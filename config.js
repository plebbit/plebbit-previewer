module.exports = {
  port: 3924,
  plebbitOptions: {
    // if gateway URL is defined, monitor won't start its own IPFS daemon
    ipfsGatewayUrls: ['https://ipfs.io'],
    pubsubHttpClientsOptions: ['https://pubsubprovider.xyz/api/v0'],
    chainProviders: {
      eth: {
        // if ETH RPC URL, won't use default ethers.js provider
        urls: [process.env.ETH_PROVIDER_URL]
      }
    },
  },
  redirects: [
    'plebbitapp.eth.limo'
  ]
}
