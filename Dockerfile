FROM node:20-alpine

WORKDIR /app

# Backend
COPY backend ./backend
RUN cd backend && npm install

# Frontend
COPY frontend ./frontend
RUN cd frontend && npm install && npm run build

ENV MUSIC_DIR=/music
EXPOSE 3000

CMD ["node", "backend/server.js"]
