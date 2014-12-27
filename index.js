'use strict';

var mInternalchain = require('microstar-internal-chain')
var mChain = require('microstar-chain')
var pull = require('pull-stream')
var serializer = require('pull-serializer')
var r = require('ramda')
var access = require('safe-access')
var pairs = require('pull-pairs')
var equal = require('deep-equal')
var unwind = require('pull-unwind')

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


function getAllFollowing (settings) {
  var chain_id = settings.chain_id || 'microstar-replicate'
  return pull(
    // Get following messages from self
    mInternalchain.read(settings, {
      k: ['pub_key', 'chain_id', 'type', 'content[0]', 'sequence'],
      v: [settings.pub_key, chain_id, 'follows']
    }),
    // Get last (by sequence) status of every chain
    groupLast('value.content[0]'),
    // Only keep chains with status = true
    pull.filter(function (message) {
      return message.content[1]
    }),
    // Get latest messages in chain
    resolveLatestMessages(settings)
  )
}

// Retrieves the last message of every group.
// Groups are determined by testing the equality of
// a keypath. For instance, the keypath could be a chain_id.
// {a: 1}, {a: 2}, {a: 2}, {a: 2}, {a: 3}, {a: 3},
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
      return mChain.read(settings, {
        k: ['pub_key', 'chain_id', 'sequence'],
        v: [message.pub_key, message.chain_id, [message.sequence, null]]
      })
    }),
    // And flatten into one stream
    unwind()
  )
}

function client (settings, ) {
  // Need to figure out how to get all latest messages into place to
  // validate on copy.
  return serializer({
    source: getAllFollowing(settings),
    sink: mChain.copy(settings, )
  })
}
