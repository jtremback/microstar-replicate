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
var level = require('level-test')()
var pull = require('pull-stream')
var pl = require('pull-level')
var ws = require('pull-ws-server')

var db1 = level('./test1.db', { valueEncoding: 'json' })
var db2 = level('./test2.db', { valueEncoding: 'json' })

mCrypto.keys('h4dfDIR+i3JfCw1T2jKr/SS/PJttebGfMMGwBvhOzS4=', function (err, keys) {
  tests(keys)
})

function tests (keys) {
  var node1_settings = {
    crypto: mCrypto,
    keys: keys,
    db: db1,
    indexes: mChain.indexes
  }

  var node2_settings = {
    crypto: mCrypto,
    keys: keys,
    db: db2,
    indexes: mChain.indexes
  }

  test('follow/unfollow', function (t) {
    mReplicate.followOne(node1_settings, { public_key: 'abc', chain_id: 'xyz' }, function (err) {
      if (err) { throw err }
      mReplicate.unfollowOne(node1_settings, { public_key: 'abc', chain_id: 'xyz' }, function (err) {
        if (err) { throw err }
        pull(
          mInternalChain.sequential(node1_settings, node1_settings.keys.public_key, 'microstar-replicate'),
          pull.collect(function (err, arr) {
            if (err) { throw err }
            debugger
            t.deepEqual(arr, [], 'unfollow')
            t.end()
          })
        )
      })
    })
  })

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

  test('replicate', function () {
    // ws.createServer(function (stream) {
    //   pull(stream, mReplicate.server(node1_settings), stream)
    // }).listen(9999)

    // var stream = ws.connect('ws://localhost:9999')

    // pull(stream, mReplicate.client(node2_settings), stream)

    pull(
      mReplicate.client(node2_settings),
      mReplicate.server(node1_settings),
      mReplicate.client(node2_settings)
    )
  })
}