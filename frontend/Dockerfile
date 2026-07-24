# build stage
FROM node:20-alpine AS build-stage
WORKDIR /app
COPY package*.json ./
RUN npm install && npm cache clean --force
COPY . .
RUN npm run build

# production stage
FROM caddy:2-alpine

RUN addgroup -g 100 caddy && adduser -u 100 -G caddy -s /bin/sh -D caddy

COPY ./Caddyfile /etc/caddy/Caddyfile
COPY ./start-caddy.sh /usr/bin/start-caddy.sh
RUN chmod +x /usr/bin/start-caddy.sh

WORKDIR /usr/share/caddy
COPY --from=build-stage /app/dist .

RUN mkdir -p /var/cache/caddy && chown -R caddy:caddy /var/cache/caddy /usr/share/caddy /etc/caddy

ENV NGINX_PORT=8080
ENV ENV=production
EXPOSE 8080

USER caddy

ENTRYPOINT ["start-caddy.sh"]
