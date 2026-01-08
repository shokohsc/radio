FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache ffmpeg

COPY package.json .
RUN npm install --production

COPY server.js .

EXPOSE 8000

CMD ["npm", "start"]
