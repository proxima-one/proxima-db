const assert = require('bsert');
const bcrypto = require('bcrypto');
const {BLAKE2b} = bcrypto;
const {Database, Table} = require("../proxima")
const randomBytes = require('randombytes');


function random(min, max) {
  return Math.floor(Math.random() * (max - min)) + min;
}
  function create_db() {
    return new Database()
  }

  async function create_table(db, name) {
    let table = db.create(name)
    return table
  }

  //query

  //commit,insert, checkout

  //stats

  //scans

  async function multiple_table_access_test() {
    let name = "newtable"
    let db = create_db()
    await db.open(name)
    await db.open(name)
    await db.close(name)
    await db.close(name)
  }

  async function random_entries(num) {
    let entries = new Map();
    let key = ""
    let value = ""
    for (let i = 0; i < num; i++) {
      key = randomBytes(32);
      value = randomBytes(300);
      entries.set(key, value)
    }
    return entries
  }

  function verify(root, key, proof) {
    return proof.verify(root, key, BLAKE2b, 256)
  }

  async function batch_insert(table, num) {
    try {
    table.transaction()
    let entries = await random_entries(num)
    for (const [key, value] of entries) {
      await table.put(key, value)
    }
    await table.commit()
    return entries
  } catch(err) {
    console.log(err)
  }
  }

  async function get_multiple(table, entries, prove = false) {
    for (const [k, v] of entries) {
      let resp = await table.get(k, prove)
      assert.bufferEqual(v, resp.value)
      //console.log(resp)
      if (prove) {
        assert(resp.proof != "")
        const [code, data] = verify(resp.root, k, resp.proof)
        assert(code == 0)
      }
    }
  }

  async function test() {
    let table_name = "test"
    let db = create_db()
    let table = await db.open(table_name)
    //console.log(db.tables)
    table = await db.get(table_name)
    let entries = await batch_insert(table, 1)
    await get_multiple(table, entries, true)
    //console.log("Closing")
    await table.close()
    //console.log("Finishing")
  }


  async function test3() {
    //cleanup  database/table
    let table_name = "test"
    let db = create_db()
    let table = await db.open(table_name)
    let stats = await table.stat()
    let entries = await random_entries(100)
    table.transaction()
    //time
    for (const [key, value] of entries) {
      let resp = await table.put(key, value, true)
      //stats = await table.stat()
    }
    //time
    await table.commit()


    for (var i = 0; i < 10; i++) {
      let r = await scanTest(table, entries)
      //await searchTest(table, entries)
    }

    let compactResponse = await table.compact()
    stats = await table.stat()
    await table.close()
  }

  async function scanTest(table, entries) {
    let direction = (Math.random() < 0.5)
    let limit = random(50,250)
    let number = random(10,200)//number 50-len

    let first = 0
    let last = number-1
    let prove = false
    //generate expected
    //sort

    let resp = await table.scan(first, last, limit, prove)
    console.log(resp.length, limit, number, entries.length)
    //assert equal
    //assertions
  }

  function searchTest(table, entries) {

    let limit = 0
    let prove = 0
    //how

    let resp = table.query(first, last, limit, prove)
    //assert equal
  }

  async function test2() {
    let table_name = "test"
    let db = create_db()
    let table = await db.open(table_name)
    let entries = await random_entries(1)
    for (const [key, value] of entries) {
      let resp = await table.put(key, value, true)
      //console.log("Put: ", resp)
    }
    await get_multiple(table, entries, true)
    await table.close()
  }

  describe("Proxima", function() {
    this.timeout(20000)

    it('should test tree', async () => {
      await test();
    });

    it('should test tree 2', async () => {
      await test2();
    });

    it('should test table access', async() => {
      await multiple_table_access_test();
    });

    it('should test advanced', async () => {
      await test3();
    });
})
