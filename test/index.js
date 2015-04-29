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

var chainA = [{
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
}]

var chainB = [{
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
}]

var chainC = [{
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


var test = require('tape')
var mChain = require('../../microstar-chain')
var mCrypto = require('../../microstar-crypto')
var mReplicate = require('../')
var async = require('async')
var pull = require('pull-stream')

var trace = require('get-trace')

function tracify (t) {
  function attach (func) {
    return function () {
      var args = []
      for (var i = 0; i < arguments.length; i++) {
        args.push(arguments[i])
      }
      args.push(trace(2))

      return func.apply(null, args)
    }
  }
  return {
    equal: attach(t.equal),
    deepEqual: attach(t.deepEqual),
    error: attach(t.error),
    end: t.end,
    plan: t.plan
  }
}

// var level = require('level-test')()
var level = require('level')

var rimraf = require('rimraf')
rimraf.sync('./test1.db')
rimraf.sync('./test2.db')


var db1 = level('./test1.db', { valueEncoding: 'json' })
var db2 = level('./test2.db', { valueEncoding: 'json' })

mCrypto.keys('h4dfDIR+i3JfCw1T2jKr/SS/PJttebGfMMGwBvhOzS4=', function (err, node1_keys) {
  mCrypto.keys('cON46Sq9opa/urTcSWI+guY2il0YOz/MAEK+yIH8j94=', function (err, node2_keys) {
    tests(node1_keys, node2_keys)
  })
})

function tests (node1_keys, node2_keys) {

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

  test('follow/unfollow', function (t) {
    t = tracify(t)
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
    t = tracify(t)
debugger
    async.series([
      async.apply(write, node1_settings, chainA),
      async.apply(write, node1_settings, chainB.slice(0, 2)),
      async.apply(follow, node2_settings, node1_keys.public_key, 'A'),
      async.apply(follow, node2_settings, node1_keys.public_key, 'B'),
      async.apply(follow, node2_settings, node1_keys.public_key, 'C'),
      async.apply(replicate, node1_settings, node2_settings)
    ], function (err) {
      pull(
        mReplicate.getAllFollowing(node2_settings),
        pull.collect(console.log)
      )
      sequential(node2_settings, node1_keys.public_key, 'A', 0, console.log)
      sequential(node2_settings, node1_keys.public_key, 'B', 0, console.log)
    })

    function sequential (settings, public_key, chain_id, sequence, callback) {
      pull(
        mChain.sequential(settings, public_key, chain_id, sequence),
        pull.collect(callback)
      )
    }

    function write (settings, messages, callback) {
      debugger
      pull(
        pull.values(messages),
        mChain.write(settings, callback)
      )
    }
    function follow (settings, public_key, chain_id, callback) {
      debugger
      mReplicate.followOne(settings, {
        public_key: public_key,
        chain_id: chain_id
      }, callback)
    }
    function replicate (from, to, callback) {
      debugger
      pull(
        mReplicate.clientRequest(to),
        mReplicate.server(from),
        mReplicate.clientResponse(to, callback)
      )
    }

    // t.end()
    // ws.createServer(function (stream) {
    //   pull(stream, mReplicate.server(node1_settings), stream)
    // }).listen(9999)

    // var stream = ws.connect('ws://localhost:9999')

    // pull(stream, mReplicate.client(node2_settings), stream)
  })
}