FROM node:22-alpine

WORKDIR /app

RUN apk add --no-cache ffmpeg

COPY src/server.js ./server.js
COPY src/package.json ./package.json
COPY src/index.html ./index.html

RUN npm install

ENV MUSIC_DIR=/music
EXPOSE 8000

CMD ["node", "server.js"]
