'use strict';

var mInternalChain = require('../microstar-internal-chain')
var mChain = require('../microstar-chain')
var pull = require('pull-stream')
var serializer = require('pull-serializer')
var _ = require('lodash')
var access = require('safe-access')
var equal = require('deep-equal')

// settings = {
//   crypto: JS,
//   keys: JS,
//   db: db,
//   index_defs: JSON
// }

module.exports = {
  // client: client,
  clientRequest: clientRequest,
  clientResponse: clientResponse,
  server: server,
  follow: follow,
  followOne: followOne,
  unfollow: unfollow,
  unfollowOne: unfollowOne,
  getAllFollowing: getAllFollowing,
  filterFirst: filterFirst,
  index_defs: mChain.index_defs
}



// {
//   public_key: String,
//   chain_id: String
// }
function follow (settings, callback) {
  return pull(
    pull.map(function (identity) {
      return [identity, true]
    }),
    following(settings, callback)
  )
}
// [{
//   public_key: String,
//   chain_id: String
// }, true]



function followOne (settings, identity, callback) {
  pull(
    pull.values([identity]),
    follow(settings, callback)
  )
}



// {
//   public_key: String,
//   chain_id: String
// }
function unfollow (settings, callback) {
  return pull(
    pull.map(function (identity) {
      return [identity, false]
    }),
    following(settings, callback)
  )
}
// [{
//   public_key: String,
//   chain_id: String
// }, false]



function unfollowOne (settings, identity, callback) {
  pull(
    pull.values([identity]),
    unfollow(settings, callback)
  )
}



// [{
//   public_key: String,
//   chain_id: String
// }, Boolean]
function following (settings, callback) {
  // Add index_defs to following docs
  settings = {
    db: settings.db,
    keys: settings.keys,
    crypto: settings.crypto,
    index_defs: _.cloneDeep(settings.index_defs)
  }
  settings.index_defs.push(['public_key', 'chain_id', 'type', 'content[0]', 'sequence'])

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
// {
//   type: String,
//   chain_id: String,
//   content: [{
//     public_key: String,
//     chain_id: String
//   }, Boolean]
// }



// Return a stream of the last message of every group.
// Groups are determined by testing the equality of
// a keypath. For instance, the keypath could be a chain_id.
// {id: 1}, {id: 2}, {id: 2}, {id: 2}, {id: 3}, {id: 3},
//     ^        ^                          ^
function filterFirst (keypath) {
  var previous
  return pull(
    pull.map(function (message) {
      var ret
      if (!equal(access(previous, keypath), access(message, keypath))) {
        ret = message
        previous = message
      } else {
        ret = false
        previous = message
      }

      return ret
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
      v: [settings.keys.public_key, chain_id, 'microstar-replicate:follows'],
      reverse: true
    }),
    // Get first (by sequence) status of every chain
    // (Actually last, since we are reading reversed)
    filterFirst('content[0]'),
    // Only keep chains with status = true
    pull.filter(function (message) {
      return message.content && message.content[1]
    }),
    // Get latest messages in chain
    resolveLatestMessages(settings)
  )
}



// {
//   "content": [
//     {
//       "public_key": String,
//       "chain_id": String
//     },
//     Boolean
//   ],
//   ...
// }
function resolveLatestMessages (settings) {
  return pull(
    pull.asyncMap(function (message, callback) {
      // Get highest sequence (last message)
      mChain.readOne(settings, {
        k: ['public_key', 'chain_id', 'sequence'],
        v: [message.content[0].public_key, message.content[0].chain_id],
        peek: 'last'
      }, function (err, msg) {
        callback(err, {
          public_key: message.content[0].public_key,
          chain_id: message.content[0].chain_id,
          // Use sequence, or start at zero
          sequence: (msg && msg.sequence) || 0
        })
      })
    })
  )
}
// {
//   public_key: String,
//   chain_id: String,
//   sequence: Number
// }



function server (settings) {
  return pull(
    pull.asyncMap(function (message, callback) {
      message = JSON.parse(message)
      // Gather all messages later than latest
      pull(
        mChain.sequential(settings, message.public_key, message.chain_id, message.sequence),
        pull.collect(callback)
      )
    }),
    pull.flatten(),
    pull.map(JSON.stringify)
  )
}

function clientRequest (settings) {
  return pull(
    getAllFollowing(settings),
    pull.map(JSON.stringify)
  )
}

function clientResponse (settings, callback) {
  return pull(
    pull.map(JSON.parse),
    mChain.copy(settings, callback)
  )
}
