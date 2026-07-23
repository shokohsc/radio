#!/bin/sh
set -e

JSON_STRING='window.configs = { \
  "ENV":"'"${ENV}"'" \
}'

if [ "$ENV" = "production" ]; then
  sed -i "s@// CONFIGURATIONS_PLACEHOLDER@${JSON_STRING}@" /usr/share/nginx/html/index.html
fi

mkdir -p /var/cache/nginx/conf.d
envsubst '${NGINX_PORT}' < /etc/nginx/templates/default.conf > /var/cache/nginx/conf.d/default.conf

exec nginx -g 'daemon off;'
