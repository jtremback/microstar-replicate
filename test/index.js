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
var pl = require('pull-level')
var mReplicate = require('../')
var async = require('async')

// var level = require('level-test')()

var level = require('level')
var rimraf = require('rimraf')
rimraf.sync('./test1.db')
rimraf.sync('./test2.db')

var pull = require('pull-stream')

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
    index_defs: mChain.index_defs
  }

  var node2_settings = {
    crypto: mCrypto,
    keys: node2_keys,
    db: db2,
    index_defs: mChain.index_defs
  }

  test('setup', function (t) {
    t.plan(2)

    pull(
      pull.values(node1_messages),
      mChain.write(node1_settings, function (err) {
        t.error(err)
      })
    )

    pull(
      pull.values(node2_messages),
      mChain.write(node2_settings, function (err) {
        t.error(err)
      })
    )
  })

  // test('saved', function (t) {
  //   t.plan(2)

  //   pull(
  //     pl.read(node1_settings.db),
  //     pull.collect(function (err, arr) {
  //       console.log(arr)
  //       t.error(err)
  //     })
  //   )

  //   pull(
  //     pl.read(node2_settings.db),
  //     pull.collect(function (err, arr) {
  //       console.log(arr)
  //       t.error(err)
  //     })
  //   )
  // })

  test('follow/unfollow', function (t) {
    mReplicate.followOne(node1_settings, {
      public_key: node2_keys.public_key,
      chain_id: 'A'
    }, function (err) {
      if (err) { throw err }
      pull(
        mReplicate.getAllFollowing(node1_settings),
        pull.collect(function (err, arr) {
          if (err) { throw err }
          t.deepEqual(arr, [{
            public_key: 'rFdhKtLmcstNXIuItYKQChg/ksjL6Y6Jt7HS1tgT7Sk=IPQS5tuF8v+tf/9EJkpehov/Aru7a/Ubp7sHUgUrVDg=',
            chain_id: 'A',
            sequence: 0
          }], 'replication message is generated after follow')
        })
      )
      mReplicate.unfollowOne(node1_settings, {
        public_key: node2_keys.public_key,
        chain_id: 'A'
      }, function (err) {
        if (err) { throw err }
        pull(
          mReplicate.getAllFollowing(node1_settings),
          pull.collect(function (err, arr) {
            if (err) { throw err }
            t.deepEqual(arr, [], 'no replication message after unfollow')
            t.end()
          })
        )
      })
    })
  })

  test('replicate', function (t) {
    mReplicate.followOne(node1_settings, {
      public_key: node2_keys.public_key,
      chain_id: 'A'
    }, function (err) {
      if (err) { throw err }

      pull(
        mReplicate.client(node1_settings),
        mReplicate.server(node2_settings),
        mReplicate.client(node1_settings, function () {

        })
      )
    })

    t.end()
    // ws.createServer(function (stream) {
    //   pull(stream, mReplicate.server(node1_settings), stream)
    // }).listen(9999)

    // var stream = ws.connect('ws://localhost:9999')

    // pull(stream, mReplicate.client(node2_settings), stream)
  })
}