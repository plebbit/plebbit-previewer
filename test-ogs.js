const ogs = require('open-graph-scraper')
const googleHeaders = {'user-agent': 'Googlebot/2.1 (+http://www.google.com/bot.html)'}
const useGoogleHeaders = new Set(['twitter.com', 'www.twitter.com', 'x.com', 'www.x.com'])
const browserHeaders = {'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36'}

const comment = {
  link: 'https://twitter.com/FrancisBApela/status/1702063239096578213'
}

const headers = useGoogleHeaders.has(new URL(comment.link).hostname) ? googleHeaders : browserHeaders

;(async () => {
  try {
    const res = await ogs({url: comment.link, headers})
    console.log(res)
    const thumbnailUrl = res.result.ogImage.url
    console.log({thumbnailUrl})
    if (!thumbnailUrl) {
      throw Error(`open-graph-scraper result has no ogImage.url ${JSON.stringify(res.result, null, 2)}`)
    }
  }
  catch (e) {
    console.log(e)
  }
})()
