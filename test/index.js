// Testing strategy
//
// Need to test:
// - Following and unfollowing
// - Replicating feed from scratch
// - Replicating feed that has some already
// - Replicating feed that already has all messages
//
// Three feeds exist. A is entirely on both nodes, B is entirely on one
// and partially on the other, and C is only on one node.

var node1_messages = [{
  content: 'fooA',
  timestamp: 1418804138168,
  type: 'test',
  chain_id: 'A'
}, {
  content: 'barA',
  timestamp: 1418804138169,
  type: 'test',
  chain_id: 'A'
}, {
  content: 'bazA',
  timestamp: 1418804138170,
  type: 'test',
  chain_id: 'A'
}, {
  content: 'fooB',
  timestamp: 1418804138158,
  type: 'test',
  chain_id: 'B'
}, {
  content: 'barB',
  timestamp: 1418804138159,
  type: 'test',
  chain_id: 'B'
}, {
  content: 'bazB',
  timestamp: 1418804138160,
  type: 'test',
  chain_id: 'B'
}, {
  content: 'fooC',
  timestamp: 1418804138258,
  type: 'test',
  chain_id: 'C'
}, {
  content: 'barC',
  timestamp: 1418804138259,
  type: 'test',
  chain_id: 'C'
}, {
  content: 'bazC',
  timestamp: 1418804138260,
  type: 'test',
  chain_id: 'C'
}]

var node2_messages = [{
  content: 'fooA',
  timestamp: 1418804138168,
  type: 'test',
  chain_id: 'A'
}, {
  content: 'barA',
  timestamp: 1418804138169,
  type: 'test',
  chain_id: 'A'
}, {
  content: 'bazA',
  timestamp: 1418804138170,
  type: 'test',
  chain_id: 'A'
}, {
  content: 'fooB',
  timestamp: 1418804138158,
  type: 'test',
  chain_id: 'B'
}, {
  content: 'barB',
  timestamp: 1418804138159,
  type: 'test',
  chain_id: 'B'
}]

var test = require('tape')
var mChain = require('../../microstar-chain')
var mCrypto = require('../../microstar-crypto')
var mInternalChain = require('../../microstar-internal-chain')
var mReplicate = require('../')
require('colors')
// var level = require('level-test')()

var level = require('level')
var rimraf = require('rimraf')
rimraf.sync('./test1.db')
rimraf.sync('./test2.db')

var pull = require('pull-stream')
var dump = require('level-dump')

var db1 = level('./test1.db', { valueEncoding: 'json' })
var db2 = level('./test2.db', { valueEncoding: 'json' })

mCrypto.keys('h4dfDIR+i3JfCw1T2jKr/SS/PJttebGfMMGwBvhOzS4=', function (err, node1_keys) {
  mCrypto.keys('cON46Sq9opa/urTcSWI+guY2il0YOz/MAEK+yIH8j94=', function (err, node2_keys) {
    tests(node1_keys, node2_keys)
  })
})

function tests (node1_keys, node2_keys) {

  // test('filterFirst', function (t) {
  //   var values = [
  //     { 'id': 'C', 'seq': 2 },
  //     { 'id': 'C', 'seq': 1 },
  //     { 'id': 'B', 'seq': 3 },
  //     { 'id': 'B', 'seq': 2 },
  //     { 'id': 'B', 'seq': 1 },
  //     { 'id': 'A', 'seq': 1 }
  //   ]

  //   pull(
  //     pull.values(values),
  //     mReplicate.filterFirst('id'),
  //     pull.collect(function (err, arr) {
  //       if (err) { throw err }
  //       console.log(arr)
  //       t.end()
  //     })
  //   )
  // })

  var node1_settings = {
    crypto: mCrypto,
    keys: node1_keys,
    db: db1,
    indexes: mChain.indexes
  }

  var node2_settings = {
    crypto: mCrypto,
    keys: node2_keys,
    db: db2,
    indexes: mChain.indexes
  }

  test('setup', function (t) {
    t.plan(2)

    pull(
      pull.values(node1_messages),
      mChain.write(node1_settings, t.error)
    )

    pull(
      pull.values(node2_messages),
      mChain.write(node2_settings, t.error)
    )
  })

  test('follow/unfollow', function (t) {
    // t.plan(2)
    mReplicate.followOne(node1_settings, { public_key: node2_keys.public_key, chain_id: 'A' }, function (err) {
      if (err) { throw err }
      console.log('first'.cyan)
      pull(
        mReplicate.getAllFollowing(node1_settings),
        pull.collect(function (err, arr) {
          if (err) { throw err }
          console.log('second'.cyan)
          console.log(arr)
        })
      )
      // mReplicate.unfollowOne(node1_settings, { public_key: node2_keys.public_key, chain_id: 'A' }, function (err) {
      //   if (err) { throw err }
      //   console.log('third'.cyan)
      //   pull(
      //     mReplicate.getAllFollowing(node1_settings),
      //     pull.collect(function (err, arr) {
      //       if (err) { throw err }
      //       console.log('four'.cyan)
      //       console.log(arr)
      //     })
      //   )
      // })
    })
  })

  // test('replicate', function () {
  //   // ws.createServer(function (stream) {
  //   //   pull(stream, mReplicate.server(node1_settings), stream)
  //   // }).listen(9999)

  //   // var stream = ws.connect('ws://localhost:9999')

  //   // pull(stream, mReplicate.client(node2_settings), stream)

  //   pull(
  //     mReplicate.client(node2_settings),
  //     mReplicate.server(node1_settings),
  //     mReplicate.client(node2_settings)
  //   )
  // })
}