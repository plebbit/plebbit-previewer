#!/usr/bin/env bash

# go to current folder
cd "$(dirname "$0")"

# create nginx config file
mkdir -p nginx
cat > nginx/nginx.conf <<EOF
user nginx;

events {}

http {
    # remove nginx header
    server_tokens off;
    add_header Server "";

    # disable logs to save space
    # access_log /var/log/nginx/access.log;
    # error_log /var/log/nginx/error.log;
    access_log off;
    error_log off;

    server {
        listen 8080;

        location / {
            proxy_pass https://seedit.netlify.app;
            proxy_set_header Host seedit.netlify.app;
        }
    }
}
EOF

docker rm -f seedit-proxy 2>/dev/null

docker run \
  --detach \
  -v $(pwd)/nginx:/etc/nginx \
  --network host \
  --name seedit-proxy \
  --restart always \
  --log-opt max-size=10m \
  --log-opt max-file=5 \
  nginx:1.27.1

docker logs --follow seedit-proxy
