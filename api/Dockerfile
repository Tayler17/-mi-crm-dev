FROM node:20-alpine

# pg_dump for automatic backups
RUN apk add --no-cache postgresql-client

WORKDIR /app

COPY package*.json ./
RUN npm install --legacy-peer-deps

COPY . .

RUN mkdir -p /app/uploads/kb-pdfs /app/uploads/tts /app/backups

CMD ["npm", "run", "start:dev"]
