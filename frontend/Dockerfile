# build stage
FROM node:20-alpine@sha256:f84e50c98e4edc519a334152eede59ade84f9f4a09e62a2e0ef3649e6a23859c AS build-stage
WORKDIR /app
COPY package*.json ./
RUN npm ci && npm cache clean --force
COPY . .
RUN npm run build

# production stage
FROM nginx:stable-alpine

RUN apk add --no-cache gettext \
    && rm -rf /etc/nginx/conf.d/default.conf

COPY ./default.conf /etc/nginx/conf.d/default.conf
COPY ./start-nginx.sh /usr/bin/start-nginx.sh
RUN chmod +x /usr/bin/start-nginx.sh

WORKDIR /usr/share/nginx/html
COPY --from=build-stage --chown=nginx:nginx /app/dist .

ENV PORT=8080
EXPOSE 8080

USER nginx

ENTRYPOINT [ "start-nginx.sh" ]
