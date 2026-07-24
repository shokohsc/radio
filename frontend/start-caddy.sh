#!/bin/sh
set -e

if [ "$ENV" = "production" ]; then
  printf 'window.configs = {"ENV":"%s"}\n' "$ENV" > /tmp/config.js
  sed -i "s|// CONFIGURATIONS_PLACEHOLDER|$(cat /tmp/config.js)|" /usr/share/caddy/index.html
  rm /tmp/config.js
fi

exec caddy run --config /etc/caddy/Caddyfile
