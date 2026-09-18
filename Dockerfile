FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends unzip poppler-utils && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm ci --prefer-online
COPY . .
ENV NODE_ENV=production
ENV PORT=4173
EXPOSE 4173
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||4173)+'/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"
CMD ["npm","start"]
