const assert = require('bsert');
const bcrypto = require('bcrypto');
const {BLAKE2b} = bcrypto;
const {Database, Table} = require("../proxima")
const randomBytes = require('randombytes');
const Any = require('random-values-generator');

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

  function unpack(str, m = -1) {
      let n = m/2;
      //console.log(str)
      if (Buffer.isBuffer(str)) return str
      let l = str.length;
      if (m == -1) {
        n = l;
      }
      str = str.padStart(n-l, ' ');

      var bytes = [];
      for(var i = 0; i < n; i++) {
          var char = str.charCodeAt(i);
          bytes.push(char >>> 8, char & 0xFF);
      }
      return new Buffer.from(bytes);
  }


  function pack(bytes) {
      var chars = [];
      for(var i = 0, n = bytes.length; i < n;) {
          chars.push(((bytes[i++] & 0xff) << 8) | (bytes[i++] & 0xff));
      }
      return String.fromCharCode.apply(null, chars);
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

  async function random_entries(num, entryStruct = []) {
    let entries = new Map();

    let key = ""
    let value = ""
    for (let i = 0; i < num; i++) {
      key = randomBytes(32);
      value = randomBytes(300);
      if (entryStruct.length > 0) {
        //console.log(entryStruct)
        let resp = generateRandomEntity(entryStruct)
        key = resp.key
        value = resp.value
      }
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
    for (const [key, value] of entries.entries()) {
      await table.put(key, value)
    }
    await table.commit()
    return entries
  } catch(err) {
    console.log(err)
  }
  }

  async function get_multiple(table, entries, prove = false) {
    if (entries) {
      for (const [key, value] of Object.entries(entries)) {
        let resp = await table.get(key, prove)
        assert.bufferEqual(v, resp.value)
        if (prove) {
          assert(resp.proof != "")
          const [code, data] = verify(resp.root, k, resp.proof)
          assert(code == 0)
        }
      }
    }
  }

  async function test() {
    let table_name = "test"
    let db = create_db()
    let table = await db.open(table_name)
    //console.log(db.tables)
    table = await db.get(table_name)
    let entries = await batch_insert(table, 1000)
    //console.log(entries)
    await get_multiple(table, entries, false)

    for (var i = 0; i < 10; i++) {
      let r = await scanTest(table, entries)
    }
    //console.log("Closing")
    await table.close()
    //console.log("Finishing")
  }


  async function test3() {
    //cleanup  database/table
    let table_name = "DPoolLists"
    let db = create_db()
    let table = await db.open(table_name)
    let stats = await table.stat()
    let entryStruct = [{"name":"id","type":"ID"},{"name":"pools","type":"Float"},{"name":"numPools","type":"Int"}, {"name":"numUsers","type":"Int"},{"name":"numActiveUsers","type":"Int"}, {"name":"numFunders","type":"Int"}]
    table  = await db.get(table_name)
    let entries = await random_entries(100, entryStruct)
    table.transaction()
    //time

    //let entries = await batch_insert(table, 1000)

    for (const [key, value] of entries.entries()) {
      //console.log(key.length)
      await table.put(key, value, false)
      //stats = await table.stat()
    }



    for (var i = 0; i < 10; i++) {
      //let r = await scanTest(table, entries)
      let s = await searchTest(table, entries, entryStruct)
    }

    let h = await table.commit()

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
    //console.log(resp.length, limit, number, entries.size)
    //assert equal
    //console.log("Response: ", resp)
    return resp
    //assertions
  }

  async function searchTest(table, entries, entityStruct) {
    let limit = 10
    let prove = false

    let queryText = generateRandomSearchQueryText(entityStruct)
    console.log(queryText)
    let resp = await table.query(queryText, limit, prove)
    //assert equal
    //console.log(queryText)
    console.log(resp)
    for (var val of resp) {
     console.log(val.value.toString())
     }
    return resp
  }

  function generateRandomSearchQueryText(entityStruct) {
    searchFilterList = []
    let maxFilters = 3
    let numFilters = 0
    for (var varStruct of entityStruct) {
        //console.log(varStruct)
        searchFilter  = generateRandomFilter(varStruct)//generate search test

        if (searchFilter != "" && searchFilter.expression != "" && (Math.random() < 0.5)) {
          searchFilterList.push(searchFilter)
          numFilters++;
        }

        if (numFilters >= maxFilters) {
          return JSON.stringify(searchFilterList)
        }
    }


    //console.log(searchFilterList)
    return JSON.stringify(searchFilterList)
  }

  function generateRandomEntity(entryStruct, args = {min: 1, max: 10}) {
    var newRandomEntity = {}
    var newRandomEntityInput = {}
    var id = ""
    //console.log(entryStruct)
    for (var varStruct of entryStruct) {
      //console.log(varStruct)
      if (varStruct.name) {
        let val = generateRandomOfType(varStruct.type, args = args)
        //console.log(val)
        if (varStruct.name == "id") {
          id = val
        }
        if (varStruct.name != "proof") {
          newRandomEntity[varStruct.name] = val
        }
        //newRandomEntity[varStruct.name] = val
    }
  }

  let r = {
    key: unpack(id),
    value: unpack(JSON.stringify(newRandomEntity)),
  }
    //
    return r
  }

  function generateRandomOfType(varType, args = {}) {
    var randomVar;
    //if args = {}
    //console.log(varType)
    //console.log(args)
    switch (varType) {
      case "String":
      //equal
        randomVar = Any.string(32)
        break
      case "Float":
        //range
        //console.log(args)
        if (Object.keys(args).length > 0 && args.max > 0) {
          randomVar = (Math.random() * (args.max - args.min)) + args.min
          return randomVar
        }

        randomVar = Any.positiveNumber()
        //console.log(randomVar)
        break
      case "ID":
        randomVar = Any.string(16)
        break
      case "Int":
        randomVar = Any.positiveInteger()
        if (Object.keys(args).length > 0 && args.max > 0) {
          randomVar = random(args.min, args.max)
          return randomVar
        }
        break
      case "Bool":
        randomVar = false
        break
      default:
        randomVar = Any.string(32)
        break
    }
    return randomVar
  }

function generateRandomExpression(varType, args = {min: 1, max: 10}) {
  //determine if it wants expression...
  let expressionList = [">", ">=", "<", "<="]
  let randomExpression = ""
  if (varType == "Float" || varType == "Int") {
    let i = Math.floor(Math.random()*expressionList.length)
    randomExpression = expressionList[i]
  }
  return randomExpression
}

function generateRandomFilter(varStruct, args = {min: 1, max: 10}) {
//{"name":"mphMintingMultiplier","type":"String"}
  let varType = varStruct.type
  let name = varStruct.name
  let expression = generateRandomExpression(varType, args) //type, min, max
  if (expression == "") {
    return expression
  }
  let value = generateRandomOfType(varType, args) //type, min, max
  let searchFilter = {
    name: name,
    expression: expression,
    value: value,
  }
  //console.log("search ", searchFilter)
  return searchFilter
}

  async function test2() {
    let table_name = "test"
    let db = create_db()
    let table = await db.open(table_name)
    let entries = await random_entries(100)
    for (const [key, value] of Object.entries(entries)) {
      let resp = await table.put(key, value, true)
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
