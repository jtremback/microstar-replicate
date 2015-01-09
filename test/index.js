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
  content: 'Fa',
  timestamp: 1418804138168,
  type: 'holiday-carols:syllable',
  chain_id: 'holiday-carols:2014'
}, {
  content: 'La',
  timestamp: 1418804138169,
  type: 'holiday-carols:syllable',
  chain_id: 'holiday-carols:2014'
}, {
  content: 'Laa',
  timestamp: 1418804138170,
  type: 'holiday-carols:syllable',
  chain_id: 'holiday-carols:2014'
}, {
  content: 'one',
  timestamp: 1418804138158,
  type: 'number',
  chain_id: 'numbers'
}, {
  content: 'two',
  timestamp: 1418804138159,
  type: 'number',
  chain_id: 'numbers'
}, {
  content: 'three',
  timestamp: 1418804138160,
  type: 'number',
  chain_id: 'numbers'
}, {
  content: 'A',
  timestamp: 1418804138258,
  type: 'letter',
  chain_id: 'letters'
}, {
  content: 'B',
  timestamp: 1418804138259,
  type: 'letter',
  chain_id: 'letters'
}, {
  content: 'C',
  timestamp: 1418804138260,
  type: 'letter',
  chain_id: 'letters'
}]

var node2_messages = [{
  content: 'Fa',
  timestamp: 1418804138168,
  type: 'holiday-carols:syllable',
  chain_id: 'holiday-carols:2014'
}, {
  content: 'La',
  timestamp: 1418804138169,
  type: 'holiday-carols:syllable',
  chain_id: 'holiday-carols:2014'
}, {
  content: 'Laa',
  timestamp: 1418804138170,
  type: 'holiday-carols:syllable',
  chain_id: 'holiday-carols:2014'
}, {
  content: 'one',
  timestamp: 1418804138158,
  type: 'number',
  chain_id: 'numbers'
}, {
  content: 'two',
  timestamp: 1418804138159,
  type: 'number',
  chain_id: 'numbers'
}]

var test = require('tape')
var mChain = require('../../microstar-chain')
var mCrypto = require('../../microstar-crypto')
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
      t.error(err)

      pull(
        pl.read(db1),
        pull.collect(function (err, arr) {
          t.error(err)
          t.deepEqual(arr, [], 'follow')

          mReplicate.unfollowOne(node1_settings, { public_key: 'abc', chain_id: 'xyz' }, function (err) {
            t.error(err)

            pull(
              pl.read(db1),
              pull.collect(function (err, arr) {
                t.error(err)
                t.deepEqual(arr, [], 'unfollow')
                t.end()
              })
            )
          })
        })
      )
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