
const bcrypto = require('bcrypto');
const {BLAKE2b} = bcrypto;
const assert = require('bsert');
const {Tree, Proof} = require('./optimized')

const ASC = false;
const DESC = true;

class Database {
  constructor(hash = null, bits = null, db_path = null) {
    this.hash = hash || BLAKE2b
    this.bits = bits || 256
    this.db_path = db_path || "./DB/"
    this.tables = {}
  }

  contains(name) {
    return (name in this.tables)
  }

  async get(name) {
    let table = await this.open(name)
    return table
  }

  async open(name) {
      let table = await this.create(name)
      if (table.isClosed()) {
        await table.open()
        return table
      } else {
        return table
      }
    }

  async batch(entries) {
    let map = {}
    let responses = []
    for (entry in entries) {
      if (!(entry.name in map)) {
        map[entry.name] = []
      }
      map[entry.name].push(entry)
    }
    let response
    let table
    for ([key, value] in map) {
      table = await this.get(key)
      response = await table.batch(entries)
      responses = responses.concat(response)
    }
    return responses
  }

  async create(name) {
    if (!this.contains(name)) {
      this.tables[name] = new Table(this.hash, this.bits, this.db_path + name);
      return this.tables[name]
    }
    return this.tables[name]
  }

  async close(name) {
    if (this.contains(name) && this.tables[name].isOpen()) {
      let response = await this.tables[name].close()
      return response
    }
    return true
  }

  async remove(name) {
      let resp = await this.close(name)
      this.tables =  _.omit(this.tables, name);
      return resp
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
    var hash_function = hash_function || BLAKE2b
    var num_bits = bits || 256
    var db_path = path || "./DB/"
    this.index = new Tree(hash_function, num_bits, db_path);
    this.batch = null
    this.batching = false
  }

async open() {
  let resp = await this.index.open()
  return resp
}

async close() {
  let resp = await this.index.close()
  return resp
}

isOpen() {
  return this.index.isOpen()
}

isClosed() {
  return this.index.isClosed()
}

async get(key, prove = false) {
    let table = this.index
    if (this.batching) {
      table = this.batch
    }
    let value = await table.get(key)
    let proof = ""
    let root = ""
    if (prove) {
      let p = await this.prove(key)
      proof = p.proof || ""
      root = p.root.data || ""
      //proof.key = key
      return {value: value, proof: proof, root: root}
    } else {
      return {value: value, proof: proof, root: root}
    }
}

async batch(entries) {
  let proofs = []
  let response
  this.transaction()
  for (entry in entries) {
    response = await this.put(entry.key, entry.value, entry.prove)
    proofs.push(response)
  }
  await this.commit()
  return proofs
}

async put(key, value, prove = false) {
  let table = this.index
  if (this.batching) {
    table = this.batch
    await table.insert(key, value)
  } else {
    this.transaction()
    table = this.batch
    await table.insert(key, value)
    await this.commit()
  }
  let proof = ""
  let root = ""
  if (prove) {
    let p = await this.prove(key)
    root = p.root.data || ""
    proof = p.proof || ""
    //proof.key = key
    return {proof: proof, root: root}
  } else {
    return {proof: proof, root: root}
  }
}

async remove(key, prove = false) {
  let table = this.index
  if (this.batching) {
    table = this.batch
  }
  let resp = await table.remove(key)
  let proof = ""
  let root = ""
  if (prove) {
    let p = await this.prove(key)
    proof = p.proof || ""
    root = p.root.data || ""
  }
  return {proof: proof, root: root}
}

snapshot(hash) {
  return this.index.snapshot(hash)
}

transaction() {
  this.batch = this.index.batch()
  this.batching = true
}

async commit() {
  await this.batch.commit()
  this.batching = false
}

async getHistory(root = null) {
  if (root == null) {
    root = await this.index.getRoot()
  }
  return await this.index.getHistory(root)
}

async compact() {
  let resp = await this.index.compact();
  let root = await this.index.getRoot()
  return root
}

iterator(direction, prove = false) {
    let table = this.index
    if (this.batching) {
      table = this.batch
    }
   return table.iterator(true, direction)
}

async getRoot() {
  let root = await this.index.getRoot()
  return root
}

async prove(key) {
  let proof = await this.index.prove(key)
  let root = await this.getRoot()
  return {proof: proof, root: root}
}

async stat() {
  let stats = await this.getRoot()

  let response = {
    stats: stats,
    proof: stats,
    root: stats,
  }
  return response
}

//filter

async scan(first, last, limit, prove) {
  let finish = Math.max(first, last)
  let direction = (finish == last)
  let resp = await this.range(0, finish, direction, 0, limit, prove);
  return resp
}

async range(start, finish, direction, offset = 0, limit = 100, prove = false) {
  const iter = this.iterator(direction, prove);
  var count = 0;
  var array = new Array();
  while (array.length < limit && await iter.next()) {
    if (count <= finish && count >= start) {
      const {key, value} = iter;
      var proof = ""
      var root = ""
      if (prove) {
        let p = await this.prove(key)
        proof = p.proof
        root = p.root.data
        //proof.key = key
      }
      array.push({value: value, proof: proof, root: root});
    }
    count++;
  }
  return array
}

//range between keys
async query(searchText, prove= false) {
  //parse query
  let filter_list = searchText
  let direction = false
  let limit = 100
  let offset = 0
  return filter(filter_list, direction, limit, prove, offset)
}

async filter(filter_list, direction, limit = 100, prove = false, offset = 0) {
  const iter = this.iterator(direction, prove);
  var array = new Array();
  let pred = this._create_filter(filter_list)
  //limit
  while (await iter.next()) {
      const {key, value} = iter;
      if (pred(key, value)) {
        var proof = ""
        if (prove) {
          let p = await this.prove(key)
          proof = p.proof
          root = p.root.data
          //proof.key = key
        }
        array.push({value: value, proof: proof, root: root});
      }
  }
  return array
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
    let v = JSON.parse(pack(value))
    for (i = 0; i < filter_list.length; i++) {
      switch (filter['expression']) {
        case ">":
          return v[filter['name']] > filter['value']
        case ">=":
          return v[filter['name']] >= filter['value']
        case "<":
          return v[filter['name']] < filter['value']
        case "<=":
          return v[filter['name']] <= filter['value']
        case "=":
          return v[filter['name']] == filter['value']
      }
    }
  }
  return filter_funct
}
}


module.exports = {Database, Table}
