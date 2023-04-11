### Demo

The plebbit-previewer allows users to share links on sites like Twitter, Telegram, etc. and generate a preview. E.g. the URL https://plebbitapp.eth.limo/#/p/reddit-screenshots.eth/c/QmbJuRPxPhncxkiGLEcCaFvawoGuoZdrwp26aPNzkSUYHa becomes https://pleb.bz/p/reddit-screenshots.eth/c/QmbJuRPxPhncxkiGLEcCaFvawoGuoZdrwp26aPNzkSUYHa which will generate a preview and redirect the user to the app.

### Params

- /c/:commentCid
- /p/:subplebbitAddress/c/:commentCid
- /:commentCid
- /p/:subplebbitAddress/c/:commentCid?redirect=plebchan.eth.limo

### How to use

```
npm install
npm run start
```

### How to use with docker

```
npm install
scripts/start-docker.sh
```

### config.js

A javascript file like:

```
module.exports = {
  port: 3924,
  plebbitOptions: {
    ipfsGatewayUrls: ['https://ipfs.io'],
  },
  // whitelisted sites that are allowed to redirect
  // the first site is the default
  redirects: [
    'plebbitapp.eth.limo'
  ]
}
```
