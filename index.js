'use strict';

var mInternalFeed = require('microstar-internal-feed')
var mFeed = require('microstar-feed')
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
//   db: db,
//   state_feed_id: String
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
  ['pub_key', 'feed_id', 'sequence']
]


function follow (settings, ids, callback) {
  following(settings, [ids, true], callback)
}

function unfollow (settings, ids, callback) {
  following(settings, [ids, false], callback)
}

// [{
//   pub_key: String,
//   feed_id: String
// }, true]
function following (settings, content, callback) {
  var message;
  message.type = 'microstar-replicate:follows'
  message.feed_id = 'microstar-replicate'
  message.content = content
  mInternalFeed.writeOne(settings, message, callback)
}


function request (settings) {
  var feed_id = settings.state_feed_id || 'microstar-replicate'
  return pull(
    // Get following messages from self
    mInternalFeed.read(settings, {
      k: ['pub_key', 'feed_id', 'type', 'content[0]', 'sequence'],
      v: [settings.pub_key, feed_id, 'follows']
    }),
    // Get last (by sequence) status of every feed
    groupLast('value.content[0]'),
    // Only keep feeds with status = true
    pull.filter(function (message) {
      return message.content[1]
    }),
    // Get latest messages in feed
    resolveLatestMessages(settings)
  )
}

// Retrieves the last message of every group.
// Groups are determined by testing the equality of
// a keypath. For instance, the keypath could be a feed_id.
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
    mFeed.readOne(settings, {
      k: ['pub_key', 'feed_id', 'sequence'],
      v: [message.content[1].pub_key, message.content[1].feed_id],
      peek: 'last'
    }, callback)
  })
}

function server (settings) {
  return pull(
    pull.map(function (message) {
      // Gather all messages later than latest
      return mFeed.read(settings, {
        k: ['pub_key', 'feed_id', 'sequence'],
        v: [message.pub_key, message.feed_id, [message.sequence, null]]
      })
    }),
    // And flatten into one stream
    unwind()
  )
}

var client = serializer({
  source: request,
  sink: mFeed.save
})


