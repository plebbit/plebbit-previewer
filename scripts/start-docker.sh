# go to current folder
cd "$(dirname "$0")"
cd ..

docker rm -f plebbit-previewer 2>/dev/null

# find port number in config.js
port=$(cat config.js | grep port: | sed -e s/[^0-9]//g)

if [ -z "$port" ]
then
  echo "can't find config.port in config.js"
  exit 1
fi

echo "starting docker on port '$port'"

docker run \
  --detach \
  --name plebbit-previewer \
  --restart always \
  --log-opt max-size=10m \
  --log-opt max-file=5 \
  --volume=$(pwd):/usr/src/plebbit-previewer \
  --workdir="/usr/src/plebbit-previewer" \
  --publish "$port:80" \
  node:16 \
  npm run start

docker logs --follow plebbit-previewer
