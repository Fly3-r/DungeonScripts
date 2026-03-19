FROM node:20-alpine

WORKDIR /app

COPY package.json ./package.json
COPY src ./src
COPY public ./public
COPY data ./data

ENV HOST=0.0.0.0
ENV PORT=3000

EXPOSE 3000

CMD ["node", "./src/server.js"]
