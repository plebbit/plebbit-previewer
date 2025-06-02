require('util').inspect.defaultOptions.depth = process.env.DEBUG_DEPTH
require('dotenv').config()

const assert = require('assert')
const config = require('./config')
const express = require('express')
const app = express()
app.on('error', e => console.log(e.message))
const port = process.env.PLEBBIT_PREVIEWER_PORT || config.port
assert(port, 'missing config.port')

const {getCommentMediaInfo} = require('./lib/utils')
const QuickLRU = require('quick-lru')
const commentCache = new QuickLRU({maxSize: 10000})
const htmlCache = new QuickLRU({maxSize: 10000})
const failedCache = new QuickLRU({maxSize: 100000})
const Debug = require('debug')
const debug = Debug('plebbit-previewer:server')
Debug.enable('plebbit-previewer:*')
const maxAttempts = 5

// use google headers on twitter or doesn't work
const ogs = require('open-graph-scraper')
const googleHeaders = {'user-agent': 'Googlebot/2.1 (+http://www.google.com/bot.html)'}
const useGoogleHeaders = new Set(['twitter.com', 'www.twitter.com', 'x.com', 'www.x.com'])
const browserHeaders = {'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36'}

let plebbit, getShortAddress
import('@plebbit/plebbit-js').then(async Plebbit => {
  plebbit = await Plebbit.default(config.plebbitOptions)
  plebbit.on('error', e => debug(e.message))
  getShortAddress = Plebbit.getShortAddress
})

assert(Array.isArray(config.redirects), `config.redirects not an array`)
const allowedRedirects = new Set(config.redirects)
assert(typeof config.redirects[0] === 'string', `config.redirects[0] not a a string`)
const defaultRedirect = config.redirects[0]

const serve = async (req, res, subplebbitAddress, commentCid) => {
  let redirect = req.query.redirect?.replace?.(/\/$/, '')
  // allow redirect=1 to redirect to config.redirects[1]
  if (config.redirects[redirect]) {
    redirect = config.redirects[redirect]
  }

  debug(req.url, subplebbitAddress, commentCid, redirect)
  if (!allowedRedirects.has(redirect)) {
    redirect = defaultRedirect
  }

  debug('getting comment', commentCid)
  let comment = commentCache.get(commentCid)
  if (!comment) {
    if (failedCache.get(commentCid) >= maxAttempts) {
      debug('failed cache max attempt reached', commentCid)
      return res.status(404).end('failed getting comment')
    }
    try {
      const res = await plebbit.getComment(commentCid)
      comment = {
        title: res.title,
        subplebbitAddress: res.subplebbitAddress,
        link: res.link,
        content: res.content,
        shortAuthorAddress: res.author.shortAddress,
        thumbnailUrl: res.thumbnailUrl,
      }
      comment.mediaInfo = getCommentMediaInfo(comment)

      // try adding short subplebbit addres
      try {
        comment.shortSubplebbitAddress = getShortAddress(comment.subplebbitAddress)
      }
      catch (e) {}

      // fetch thumbnail if doesn't exist
      if (comment.link && !comment.mediaInfo) {
        try {
          const headers = useGoogleHeaders.has(new URL(comment.link).hostname) ? googleHeaders : browserHeaders
          const res = await ogs({url: comment.link, headers})
          comment.thumbnailUrl = res.result.ogImage.url
          if (!comment.thumbnailUrl) {
            throw Error(`open-graph-scraper result has no ogImage.url ${JSON.stringify(res.result, null, 2)}`)
          }
          comment.mediaInfo = {url: comment.thumbnailUrl, type: 'image'}
        }
        catch (e) {
          debug('failed fetching comment.link thumbnail', comment.link, e?.message || e?.result?.error || e)
        }
      }
    }
    catch (e) {
      failedCache.set(commentCid, (failedCache.get(commentCid) || 0) + 1)
      debug('failed getting comment', commentCid, e.message)
      return res.status(404).end(e.message)
    }
    commentCache.set(commentCid, comment)
  }
  debug(comment)

  if (subplebbitAddress && subplebbitAddress !== comment.subplebbitAddress) {
    debug(`subplebbitAddress '${subplebbitAddress}' !== '${comment.subplebbitAddress}'`)
    return res.status(404).end('invalid subplebbit address')
  }

  let html = htmlCache.get(commentCid + redirect)
  if (!html) {
    let twitterCard = 'summary'

    // image
    const image = comment.mediaInfo?.url
    let ogImageTag = ''
    let twitterImageTag = ''
    if (image) {
      twitterCard = 'summary_large_image'
      ogImageTag = `
    <meta property="og:image" content="${image}"/>`
      twitterImageTag = `
    <meta name="twitter:image" content="${image}"/>
    <meta name="twitter:image:src" content="${image}"/>`
    }

    // title
    let title = comment.title
    if (!title && comment.content) {
      title = comment.content
      if (title.length > 60) {
        title = title.slice(0, 60) + '...'
      }
    }
    if (!title) {
      title = '-'
    }

    // description
    let description = `Posted by u/${comment.shortAuthorAddress} in p/${comment.shortSubplebbitAddress || comment.subplebbitAddress}`
    if (comment.content?.trim?.()) {
      description += ` - ${comment.content.trim()}`
    }

    // add query string back, useful for ?context=3 on old.reddit
    let queryString = ''
    for (const query in req.query) {
      if (query === 'redirect' || query === 'r') {
        continue
      }
      if (queryString === '') {
        queryString += '?'
      }
      else {
        queryString += '&'
      }
      queryString += `${query}=${req.query[query]}`
    }

    const redirectUrl = `https://${redirect}/#/p/${comment.subplebbitAddress}/c/${commentCid}${queryString}`
    const iconUrl = `https://${redirect}/favicon.ico`

    // derive site name from redirect url
    let siteName = 'plebbit'
    if (redirect.includes('seedit')) {
      siteName = 'seedit'
    }
    else if (redirect.includes('plebchan')) {
      siteName = 'plebchan'
    }

    html = `<!DOCTYPE html>
<html>
  <head>
    <meta charSet="utf-8"/>
    <title>${title}</title>
    <meta name="title" content="${title}"/>
    <meta name="description" content="${description}"/>
    <meta property="og:site_name" content="${siteName}" />
    <meta property="og:type" content="website"/>
    <meta property="og:url" content="${redirectUrl}"/>
    <meta property="og:title" content="${title}"/>
    <meta property="og:description" content="${description}"/>${ogImageTag}
    <meta name="twitter:card" content="${twitterCard}"/>
    <meta name="twitter:url" content="${redirectUrl}"/>
    <meta name="twitter:title" content="${title}"/>
    <meta name="twitter:description" content="${description}"/>${twitterImageTag}
    <link rel="icon" href="${iconUrl}"/>
    <link rel="apple-touch-icon" href="${iconUrl}"/>
  </head>
  <body>
    <script>
      window.location.replace("${redirectUrl}")
    </script>
  </body>
</html>`

    htmlCache.set(commentCid + redirect, html)
  }

  // the comment is immutable, so set the cache a long time
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
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

// robots.txt needed to not prevent bots from crawling the previews
app.get('/robots.txt', async (req, res) => {
  res.send(`User-agent: *
Allow: /`)
})

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

app.listen(port, () => debug(`listening on port ${port}`))
  .on('error', e => debug(e.message))

// uncomment to listen on port 80 as well
// app.listen(80, () => console.log(`listening on port ${port}`))
//   .on('error', e => console.log(e.message))
