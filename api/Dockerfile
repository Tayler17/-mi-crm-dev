FROM node:20-alpine

# pg_dump for automatic backups; ffmpeg to transcode voice notes to mp3 (cross-device playback)
RUN apk add --no-cache postgresql-client ffmpeg

WORKDIR /app

COPY package*.json ./
RUN npm install --legacy-peer-deps

COPY . .

RUN mkdir -p /app/uploads/kb-pdfs /app/uploads/tts /app/backups

CMD ["npm", "run", "start:dev"]
