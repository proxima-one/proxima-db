// eslint-disable-next-line strict
const bcrypto = require("bcrypto");
const { BLAKE2b } = bcrypto;
const assert = require("bsert");
const { Tree, Proof } = require("./optimized");

const ASC = false;
const DESC = true;

/*
Worker threads.

*/

class Database {
  constructor(hash = null, bits = null, dbPath = null) {
    this.hash = hash || BLAKE2b;
    this.bits = bits || 256;
    this.db_path = dbPath || "./DB/";
    this.tables = {};
  }

  contains(name) {
    return name in this.tables;
  }

  async get(name) {
    //TODO open and get the table 
    const table = await this.open(name);
    return table;
  }

  async open(name) {
    const table = await this.create(name);
    if (table.isClosed()) {
      await table.open();
      return table;
    } else {
      return table;
    }
  }

  async batch(entries) {
    const map = {};
    let responses = [];
    for (const entry in entries) {
      if (!(entry.name in map)) {
        map[entry.name] = [];
      }
      map[entry.name].push(entry);
    }
    let response;
    let table;
    for (const [key, value] in map) {
      table = await this.get(key);
      response = await table.batch(entries);
      responses = responses.concat(response);
    }
    return responses;
  }

  async create(name) {
    if (!this.contains(name)) {
      this.tables[name] = new Table(this.hash, this.bits, this.db_path + name);
      return this.tables[name];
    }
    return this.tables[name];
  }

  async close(name) {
    if (this.contains(name) && this.tables[name].isOpen()) {
      const response = await this.tables[name].close();
      return response;
    }
    return true;
  }

  async remove(name) {
    const resp = await this.close(name);
    // eslint-disable-next-line no-undef
    this.tables = _.omit(this.tables, name);
    return resp;
  }
}

class Table {
  /*
    Options: File...
      - Index Type
      - Hash type
      - Number of bits in Hash
      - Path to DB
      - Max open files
      - Max Files
      - Max File Size
      - MAx Size of Keys
      - Max Size of Value
      - Read Buffer
      - Write Buffer
      - Snapshots (History)

      Auto-generate
      - Meta size
      - Slab size
      - Options file...
  */

  constructor(hash, bits, path) {
    const hash_function = hash || BLAKE2b;
    const num_bits = bits || 256;
    const db_path = path || "./DB/";
    this.index = new Tree(hash, num_bits, db_path);
    this.batch = null;
    this.batching = false;
  }

  async open() {
    if (this.isClosed()) {
      const resp = await this.index.open();
      return resp;
    } else {
      return this.isOpen();
    }
  }

  async close() {
    if (this.isOpen()) {
    const resp = await this.index.close();
    return resp;
    } else {
      return this.isClosed();
    }
  }

  isOpen() {
    return this.index.isOpen();
  }

  isClosed() {
    return this.index.isClosed();
  }

  async get(key, prove = false) {
    let table = this.index;
    if (this.batching) {
      table = this.batch;
    }
    const value = await table.get(key);
    let proof = "";
    let root = "";
    if (prove) {
      const p = await this.prove(key);
      proof = p.proof || "";
      root = p.root.data || "";
      //proof.key = key
      return { value: value, proof: proof, root: root };
    } else {
      return { value: value, proof: proof, root: root };
    }
  }

  async bulkWrite(writeOperations) {
    let responses = [];
    let response = this.transaction();
    var resp
    for (const operation in writeOperations) {
      switch (operation.type) {
        case "UPDATE":
          resp = await this.put(operation.key, operation.value, operation.prove);
          responses.push(resp);
          break;
        case "CREATE":
          resp = await this.put(operation.key, operation.value, operation.prove);
          responses.push(resp);
          break;
        case "DELETE": 
          resp = await this.remove(operation.key, operation.prove);
          responses.push(resp)
          break
        default: 
          throw new Error(`Operation not implemented: ${operation.type}`);
      }
    }
    await this.commit();
    return responses;
  }

  /*
    Todo: batchRead
  */

  async batch(entries) {
    let proofs = [];
    let response = this.transaction();
    for (const entry in entries) {
      response = await this.put(entry.key, entry.value, entry.prove);
      proofs.push(response);
    }
    await this.commit();
    return proofs;
  }

  async put(key, value, prove = false) {
    let table = this.index;
    let proof = "";
    let root = "";
    try {
    if (this.batching) {
      table = this.batch;
      await table.insert(key, value);
    } else {
      this.transaction();
      table = this.batch;
      await table.insert(key, value);
      await this.commit();
    }
    if (prove) {
      let p = await this.prove(key);
      root = p.root.data || "";
      proof = p.proof || "";
    }
  } catch(e) {
    console.log(`Error at put: ${e}`)
    return {data: {proof: proof, root: root}, code: `Error at put: ${e}`}
  } finally {
    return {data: {key: key, value: value, proof: proof, root: root}, code: "INSERT"}
  }
  }

  async remove(key, prove = false) {
    let table = this.index;
    if (this.batching) {
      table = this.batch;
      await table.remove(key);
    } else {
      this.transaction();
      table = this.batch;
      await table.remove(key);
      await this.commit();
    }
    let proof = "";
    let root = "";
    if (prove) {
      let p = await this.prove(key);
      proof = p.proof || "";
      root = p.root.data || "";
    }
    return { proof: proof, root: root };
  }

  snapshot(hash) {
    return this.index.snapshot(hash);
  }

  //wait until the last one is over
  transaction() {
    if (!this.batching) {
    this.batch = this.index.batch();
    this.batching = true;
    }
  }

  async commit() {
    await this.batch.commit();
    this.batching = false;
  }

  async getHistory(root = null) {
    if (root == null) {
      root = await this.index.getRoot();
    }
    return await this.index.getHistory(root);
  }

  async compact() {
    const resp = await this.index.compact();
    const root = await this.index.getRoot();
    return root;
  }

  iterator(direction, prove = false) {
    let table = this.index;
    if (this.batching) {
      table = this.batch;
    }
    return table.iterator(true, direction);
  }

  workingIndex() {
    if (this.batching && this.batch) {
      return this.batch
    } else {
    return this.index
    }
  }

  async getWorkingRoot() {
    if (this.batching) {
      return await this.batch.getRoot();
    }
    return await this.index.getRoot();
  }

  async getRoot() {
    const root = await this.index.getRoot();
    return root;
  }

  async prove(key) {
    const proof = await this.getWorkingIndex().prove(key);
    const root = await this.getWorkingRoot();
    return { proof: proof, root: root };
  }

  async stat() {
    const stats = await this.getWorkingRoot();
    //size
    //table 

    const response = {
      stats: stats,
      proof: stats,
      root: stats
    };
    return response;
  }

  async scan(first, last, limit, prove) {
    const finish = Math.max(first, last);
    const direction = (finish !== last);
    const resp = await this.range(0, finish, direction, 0, limit, prove);
    return resp;
  }

  async range(
    start,
    finish,
    direction,
    offset = 0,
    limit = 100,
    prove = false
  ) {
    const iter = this.iterator(direction, prove);
    let count = 0;
    const array = new Array(0);
    while (array.length < limit && (await iter.next())) {
      if (count <= finish && count >= start) {
        const { key, value } = iter;
        let proof = "";
        let root = "";
        if (prove) {
          let p = await this.prove(key);
          proof = p.proof;
          root = p.root.data;
          //proof.key = key
        }
        array.push({ value: value, proof: proof, root: root });
      }
      count++;
    }
    return array;
  }

  parseFilter(filterRaw) {
    try {
      return JSON.parse(filterRaw)
    } catch(e) {
      return filterRaw
    }
  }

  async query(searchText, limit = 10, prove = false) {
    const filterList = this.parseFilter(searchText);
    const direction = false;
    const d = await this.filter(filterList, direction, limit, prove, 0);
    return d;
  }

  async filter(filterList, direction, limit = 10, prove = false, offset = 0) {
    const filterIter = this.iterator(direction, prove);
    const array = new Array();
    const pred = await this._create_filter(filterList);
    while (array.length < limit && (await filterIter.next())) {
      const { key, value } = filterIter;
      if (key != null && value != null && pred(key, value)) {
        let proof = "";
        let root = "";
        if (prove) {
          let p = await this.prove(key);
          proof = p.proof;
          root = p.root.data;
          //proof.key = key
        }
        array.push({ value: value, proof: proof, root: root });
      }
    }
    return array;
  }

  // class TableStats {
  //   size, 
  //   history, 
  //   root, 
  //   opeation,
  //   operationNumber,
  // }

  /*
_not
_gt
_lt
_gte
_lte
_in
_not_in
_contains
_not_contains
_starts_with
_ends_with
_not_starts_with
_not_ends_with
*/

parseFilterValue(valueRaw) {
  try {
  //console.log("VALUE: ", valueRaw.toString())
    JSON.parse(valueRaw.toString());
  } catch(e) {
    return valueRaw;
  }
}

  async _create_filter(filter_list) {
    let filter_funct = (key, value) => {
      
      let v = this.parseFilterValue(value)
      for (let i = 0; i < filter_list.length; i++) {
        let filter = filter_list[i];
        //let filterExpression
        switch (filter["expression"]) {
          case ">":
            return v[filter.name] > filter.value;
          case ">=":
            return v[filter.name] >= filter.value;
          case "<":
            return v[filter.name] < filter.value;
          case "<=":
            return v[filter.name] <= filter.value;
          case "=":
            return v[filter.name] == filter.value;
        }
      }
    };
    return filter_funct;
  }
}

function unpack(str, m = -1) {
  let n = m / 2;
  //console.log(str)
  if (Buffer.isBuffer(str)) return str;
  let l = str.length;
  if (m == -1) {
    n = l;
  }
  str = str.padStart(n - l, " ");

  var bytes = [];
  for (var i = 0; i < n; i++) {
    var char = str.charCodeAt(i);
    bytes.push(char >>> 8, char & 0xff);
  }
  return new Buffer.from(bytes);
}

function pack(bytes) {
  var chars = [];
  for (var i = 0, n = bytes.length; i < n; ) {
    chars.push(((bytes[i++] & 0xff) << 8) | (bytes[i++] & 0xff));
  }
  return String.fromCharCode.apply(null, chars);
}
module.exports = { Database, Table };
