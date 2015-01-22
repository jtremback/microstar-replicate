'use strict';

var mInternalChain = require('../microstar-internal-chain')
var mChain = require('../microstar-chain')
var pull = require('pull-stream')
var serializer = require('pull-serializer')
var _ = require('lodash')
var access = require('safe-access')
// var pairs = require('pull-pairs')
var equal = require('deep-equal')

// settings = {
//   crypto: JS,
//   keys: JS,
//   db: db,
//   indexes: JSON
// }

module.exports = {
  client: client,
  server: server,
  follow: follow,
  followOne: followOne,
  unfollow: unfollow,
  unfollowOne: unfollowOne,
  getAllFollowing: getAllFollowing,
  indexes: mChain.indexes
}

// If you need indexes on all documents, export them so that they
// can be added.
// module.exports.indexes = [
//   ['public_key', 'chain_id', 'type', 'content[0]', 'sequence']
// ].concat(mChain.indexes)

function follow (settings, callback) {
  return pull(
    pull.map(function (id) {
      return [id, true]
    }),
    following(settings, callback)
  )
}

function followOne (settings, id, callback) {
  pull(
    pull.values([id]),
    follow(settings, callback)
  )
}

function unfollow (settings, callback) {
  return pull(
    pull.map(function (id) {
      return [id, false]
    }),
    following(settings, callback)
  )
}

function unfollowOne (settings, id, callback) {
  pull(
    pull.values([id]),
    unfollow(settings, callback)
  )
}

// [{
//   public_key: String,
//   chain_id: String
// }, true]
function following (settings, callback) {
  // Add indexes to following docs
  settings = {
    db: settings.db,
    keys: settings.keys,
    crypto: settings.crypto,
    indexes: _.cloneDeep(settings.indexes)
  }
  settings.indexes.push(['public_key', 'chain_id', 'type', 'content[0]', 'sequence'])

  return pull(
    pull.map(function (content) {
      return {
        type: 'microstar-replicate:follows',
        chain_id: settings.chain_id || 'microstar-replicate',
        content: content
      }
    }),
    mInternalChain.write(settings, callback)
  )
}

// Retrieves the last message of every group.
// Groups are determined by testing the equality of
// a keypath. For instance, the keypath could be a chain_id.
// {id: 1}, {id: 2}, {id: 2}, {id: 2}, {id: 3}, {id: 3},
//    ^                       ^               ^
// function groupLast0 (keypath) {
//   return pull(
//     pairs(function mapper (a, b) {
//       if (!equal(access(a, keypath), access(b, keypath))) {
//         return a
//       }
//       return false
//     }),
//     pull.filter(r.identity)
//   )
// }

// Return a stream of the last message of every group.
// Groups are determined by testing the equality of
// a keypath. For instance, the keypath could be a chain_id.
// {id: 1}, {id: 2}, {id: 2}, {id: 2}, {id: 3}, {id: 3},
//     ^                          ^                 ^
function groupLast (keypath) {
  var prev
  return pull(
    pull.map(function (message) {
      if (!equal(access(prev, keypath), access(message, keypath))) {
        return prev
      }
      prev = message
      return false
    }),
    pull.filter(function (a) {
      return a
    })
  )
}

function getAllFollowing (settings) {
  var chain_id = settings.chain_id || 'microstar-replicate'
  return pull(
    // Get following messages from self
    mInternalChain.read(settings, {
      k: ['public_key', 'chain_id', 'type', 'content[0]', 'sequence'],
      v: [settings.keys.public_key, chain_id, 'follows']
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
      k: ['public_key', 'chain_id', 'sequence'],
      v: [message.content[1].public_key, message.content[1].chain_id],
      peek: 'last'
    }, callback)
  })
}

function server (settings) {
  return pull(
    pull.map(function (message) {
      // Gather all messages later than latest
      pull(
        mChain.sequential(settings, message.public_key, message.chain_id, message.sequence),
        pull.collect(function (err, arr) {
          return arr
        })
      )
    })
  )
}

function client (settings) {
  return serializer({
    source: getAllFollowing(settings),
    sink: mChain.copy(settings)
  })
}
