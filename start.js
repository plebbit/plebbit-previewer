// require('util').inspect.defaultOptions.depth = process.env.DEBUG_DEPTH
require('dotenv').config()

const Plebbit = require('@plebbit/plebbit-js')
const assert = require('assert')
const config = require('./config')
const express = require('express')
const app = express()
const port = config.port
assert(port, 'missing config.port')

const {getCommentMediaInfo} = require('./lib/utils')
const ogs = require('open-graph-scraper')
const headers = {"user-agent": "Googlebot/2.1 (+http://www.google.com/bot.html)"}
const QuickLRU = require('quick-lru')
const commentCache = new QuickLRU({maxSize: 10000})
const htmlCache = new QuickLRU({maxSize: 10000})
const failedCache = new QuickLRU({maxSize: 100000})
const Debug = require('debug')
const debug = Debug('plebbit-previewer:server')
Debug.enable('plebbit-previewer:*')
const maxAttempts = 5

let plebbit
Plebbit(config.plebbitOptions).then(_plebbit => {
  plebbit = _plebbit
  plebbit.on('error', e => debug(e.message))
})

assert(Array.isArray(config.redirects), `config.redirects not an array`)
const allowedRedirects = new Set(config.redirects)
assert(typeof config.redirects[0] === 'string', `config.redirects[0] not a a string`)
const defaultRedirect = config.redirects[0]

app.get('*', async (req, res) => {
  const url = req.url

  // irrelevant endpoints
  if (url === '/service-worker.js' || url === '/manifest.json' || url === '/favicon.ico') {
    return res.status(404).end()
  }

  if (!plebbit) {
    debug('plebbit not defined yet')
    return res.status(404).end()
  }

  const cid = req.params[0]?.replaceAll?.('/', '')
  let redirect = req.query.redirect?.replace?.(/\/$/, '')
  debug(url, cid, redirect)
  if (!allowedRedirects.has(redirect)) {
    redirect = defaultRedirect
  }

  debug('getting comment', cid)
  let comment = commentCache.get(cid)
  if (!comment) {
    if (failedCache.get(cid) >= maxAttempts) {
      debug('failed cache max attempt reached', cid)
      return res.status(404).end()
    }
    try {
      const res = await plebbit.getComment(cid)
      comment = {
        title: res.title,
        subplebbitAddress: res.subplebbitAddress,
        link: res.link,
        content: res.content,
        authorShortAddress: res.author.shortAddress,
        thumbnailUrl: res.thumbnailUrl,
      }
      comment.mediaInfo = getCommentMediaInfo(comment)

      // fetch thumbnail if doesn't exist
      if (comment.link && !comment.mediaInfo) {
        try {
          const res = await ogs({url: comment.link})
          comment.thumbnailUrl = res.result.ogImage.url
          comment.mediaInfo = {url: comment.thumbnailUrl, type: 'image'}
        }
        catch (e) {
          debug('failed fetching comment.link thumbnail', comment.link, e.message)
        }
      }
    }
    catch (e) {
      failedCache.set(cid, (failedCache.get(cid) || 0) + 1)
      debug('failed getting comment', cid, e.message)
      return res.status(404).end()
    }
    commentCache.set(cid, comment)
  }
  debug(comment)

  let html = htmlCache.get(cid + redirect)
  if (!html) {
    // image
    let imageTag = ''
    if (comment.mediaInfo?.url) {
      imageTag = `\n    <meta property="og:image" content="${comment.mediaInfo?.url}" />\n`
    }

    // title
    let title = comment.title
    if (!title && comment.content) {
      title = comment.content
      if (title.length > 60) {
        title = title.slice(0, 60) + '...'
      }
    }

    // description
    let description = `Posted by u/${comment.authorShortAddress}`
    if (comment.content) {
      description += ` - ${comment.content}`
    }

    const redirectUrl = `https://${redirect}/#/p/${comment.subplebbitAddress}/c/${cid}`

    html = `<!DOCTYPE html>
<html>
  <head>
    <title>Just a moment...</title>
    <meta name="robots" content="noindex,nofollow">
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${description}" />${imageTag}
    <meta http-equiv="Refresh" content="0; url='${redirectUrl}'" />
  </head>
  <body>
  </body>
</html>`

    htmlCache.set(cid + redirect, html)
  }

  res.send(html)
})

app.listen(port, () => {
  console.log(`listening on port ${port}`)
})
