// eslint-disable-next-line strict
const bcrypto = require("bcrypto");
const { BLAKE2b } = bcrypto;
const assert = require("bsert");
const { Tree, Proof } = require("./optimized");

const ASC = false;
const DESC = true;

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
    let map = {};
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
      let response = await this.tables[name].close();
      return response;
    }
    return true;
  }

  async remove(name) {
    let resp = await this.close(name);
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
    var hash_function = hash_function || BLAKE2b;
    var num_bits = bits || 256;
    var db_path = path || "./DB/";
    this.index = new Tree(hash_function, num_bits, db_path);
    this.batch = null;
    this.batching = false;
  }

  async open() {
    let resp = await this.index.open();
    return resp;
  }

  async close() {
    let resp = await this.index.close();
    return resp;
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
    let value = await table.get(key);
    let proof = "";
    let root = "";
    if (prove) {
      let p = await this.prove(key);
      proof = p.proof || "";
      root = p.root.data || "";
      //proof.key = key
      return { value: value, proof: proof, root: root };
    } else {
      return { value: value, proof: proof, root: root };
    }
  }

  async batch(entries) {
    let proofs = [];
    let response = this.transaction();
    for (entry in entries) {
      response = await this.put(entry.key, entry.value, entry.prove);
      proofs.push(response);
    }
    await this.commit();
    return proofs;
  }

  async put(key, value, prove = false) {
    let table = this.index;
    if (this.batching) {
      table = this.batch;
      await table.insert(key, value);
    } else {
      this.transaction();
      table = this.batch;
      await table.insert(key, value);
      await this.commit();
    }
    let proof = "";
    let root = "";
    if (prove) {
      let p = await this.prove(key);
      root = p.root.data || "";
      proof = p.proof || "";
      //proof.key = key
      return { proof: proof, root: root };
    } else {
      return { proof: proof, root: root };
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

  transaction() {
    this.batch = this.index.batch();
    this.batching = true;
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
    let resp = await this.index.compact();
    let root = await this.index.getRoot();
    return root;
  }

  iterator(direction, prove = false) {
    let table = this.index;
    if (this.batching) {
      table = this.batch;
    }
    return table.iterator(true, direction);
  }

  async getRoot() {
    let root = await this.index.getRoot();
    return root;
  }

  async prove(key) {
    let proof = await this.index.prove(key);
    let root = await this.getRoot();
    return { proof: proof, root: root };
  }

  async stat() {
    let stats = await this.getRoot();

    let response = {
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

  async query(searchText, limit = 10, prove = false) {
    const filterList = JSON.parse(searchText);
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

  async _create_filter(filter_list) {
    let filter_funct = (key, value) => {
      //console.log("VALUE: ", value.toString())
      let v = JSON.parse(value.toString());
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
