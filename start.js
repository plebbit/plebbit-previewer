require('util').inspect.defaultOptions.depth = process.env.DEBUG_DEPTH
require('dotenv').config()

const Plebbit = require('@plebbit/plebbit-js')
const assert = require('assert')
const config = require('./config')
const express = require('express')
const app = express()
console.log
app.on('error', e => console.log(e.message))
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

const serve = async (req, res, subplebbitAddress, commentCid) => {
  let redirect = req.query.redirect?.replace?.(/\/$/, '')
  debug(req.url, subplebbitAddress, commentCid, redirect)
  if (!allowedRedirects.has(redirect)) {
    redirect = defaultRedirect
  }

  debug('getting comment', commentCid)
  let comment = commentCache.get(commentCid)
  if (!comment) {
    if (failedCache.get(commentCid) >= maxAttempts) {
      debug('failed cache max attempt reached', commentCid)
      return res.status(404).end()
    }
    try {
      const res = await plebbit.getComment(commentCid)
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
      failedCache.set(commentCid, (failedCache.get(commentCid) || 0) + 1)
      debug('failed getting comment', commentCid, e.message)
      return res.status(404).end()
    }
    commentCache.set(commentCid, comment)
  }
  debug(comment)

  if (subplebbitAddress && subplebbitAddress !== comment.subplebbitAddress) {
    debug(`subplebbitAddress '${subplebbitAddress}' !== '${comment.subplebbitAddress}'`)
    return res.status(404).end()
  }

  let html = htmlCache.get(commentCid + redirect)
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
    if (comment.content?.trim?.()) {
      description += ` - ${comment.content.trim()}`
    }

    const redirectUrl = `https://${redirect}/#/p/${comment.subplebbitAddress}/c/${commentCid}`

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

    htmlCache.set(commentCid + redirect, html)
  }

  res.send(html)
}

const dontServe = (req, res) => {
  // irrelevant endpoints
  if (req.url === '/service-worker.js' || req.url === '/manifest.json' || req.url === '/favicon.ico') {
    res.status(404).end()
    return true
  }

  if (!plebbit) {
    debug('plebbit not defined yet')
    res.status(404).end()
    return true
  }

  return false
}

app.get('/p/:subplebbitAddress/c/:commentCid', async (req, res) => {
  if (dontServe(req, res)) {
    return
  }
  const {subplebbitAddress, commentCid} = req.params
  await serve(req, res, subplebbitAddress, commentCid)
})

app.get('/c/:commentCid', async (req, res) => {
  if (dontServe(req, res)) {
    return
  }
  const {commentCid} = req.params
  await serve(req, res, undefined, commentCid)
})

app.get('/:commentCid', async (req, res) => {
  if (dontServe(req, res)) {
    return
  }
  const {commentCid} = req.params
  await serve(req, res, undefined, commentCid)
})

app.listen(port, () => console.log(`listening on port ${port}`))
  .on('error', e => console.log(e.message))

// try listening on port 80, will fail unless on production server
app.listen(80, () => console.log(`listening on port ${port}`))
  .on('error', e => console.log(e.message))
