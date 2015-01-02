'use strict';

var mInternalchain = require('microstar-internal-chain')
var mChain = require('microstar-chain')
var pull = require('pull-stream')
var serializer = require('pull-serializer')
var r = require('ramda')
var access = require('safe-access')
var pairs = require('pull-pairs')
var equal = require('deep-equal')

// settings = {
//   crypto: JS,
//   keys: JS,
//   db: db
// }

module.exports = function (settings) {
  return {
    client: client.bind(null, settings),
    server: server.bind(null, settings),
    follow: follow.bind(null, settings),
    unfollow: unfollow.bind(null, settings)
  }
}

// If you need indexes on any documents, export them so that they
// can be added.
module.exports.indexes = [
  ['pub_key', 'chain_id', 'sequence'],
  ['pub_key', 'chain_id', 'type', 'content[0]', 'sequence']
]


function follow (settings, ids, callback) {
  following(settings, [ids, true], callback)
}

function unfollow (settings, ids, callback) {
  following(settings, [ids, false], callback)
}

// [{
//   pub_key: String,
//   chain_id: String
// }, true]
function following (settings, content, callback) {
  var chain_id = settings.chain_id || 'microstar-replicate'
  var message
  message.type = 'microstar-replicate:follows'
  message.chain_id = chain_id
  message.content = content
  mInternalchain.writeOne(settings, message, callback)
}

// Retrieves the last message of every group.
// Groups are determined by testing the equality of
// a keypath. For instance, the keypath could be a chain_id.
// {id: 1}, {id: 2}, {id: 2}, {id: 2}, {id: 3}, {id: 3},
//    ^                       ^               ^
function groupLast (keypath) {
  return pull(
    pairs(function mapper (a, b) {
      if (!equal(access(a, keypath), access(b, keypath))) {
        return a
      }
      return false
    }),
    pull.filter(r.identity)
  )
}

function getAllFollowing (settings) {
  var chain_id = settings.chain_id || 'microstar-replicate'
  return pull(
    // Get following messages from self
    mInternalchain.read(settings, {
      k: ['pub_key', 'chain_id', 'type', 'content[0]', 'sequence'],
      v: [settings.keys.publicKey, chain_id, 'follows']
    }),
    // Get last (by sequence) status of every chain
    groupLast('content[0]'),
    // Only keep chains with status = true
    pull.filter(function (message) {
      return message.content[1]
    }),
    // Get latest messages in chain
    resolveLatestMessages(settings)
  )
}


function resolveLatestMessages (settings) {
  return pull.asyncMap(function (message, callback) {
    // Get highest sequence (last message)
    mChain.readOne(settings, {
      k: ['pub_key', 'chain_id', 'sequence'],
      v: [message.content[1].pub_key, message.content[1].chain_id],
      peek: 'last'
    }, callback)
  })
}

function server (settings) {
  return pull(
    pull.map(function (message) {
      // Gather all messages later than latest
      pull(
        mChain.read(settings, {
          k: ['pub_key', 'chain_id', 'sequence'],
          v: [message.pub_key, message.chain_id, [message.sequence, null]]
        }),
        pull.collect(function (err, arr) {
          return arr
        })
      )
    }),
    pull.flatten()
  )
}

function replaceFirst (settings) {
  return pull(
    pairs(function (a, b) {
      return [a, b]
    }),
    pull.asyncMap(function (pair, callback) {
      // At the transition between chains, replace the first in chain with one
      // from db.
      if (pair[0].chain_id !== pair[1].chain_id) {
        mChain.readOne(settings, {
          k: ['pub_key', 'chain_id', 'sequence'],
          v: [pair[1].pub_key, pair[1].chain_id, pair[1].sequence]
        }, callback)
      }
      return callback(null, pair[1])
    })
  )
}

function client (settings) {
  // Need to figure out how to get all the initial messages into place to
  // validate on copy.
  //
  // validate without `initial` arg? Would need to do a query for each message
  // better to recognize initial messages some other way and replace only them
  //
  // Replace initial messages and validate forward or compare for equality???za
  //
  // identify initial messages -> replace them with messages from db
  // how to identify initial messages? groupFirst function like groupLast
  // To use groupFirst results in filtered stream - would need to tap and then
  // reconstitute.. hmm.
  //
  // Otherwise, make operation special for this...
  //
  return serializer({
    source: getAllFollowing(settings),
    sink: mChain.copy()
  })
}
