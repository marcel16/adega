FROM node:20-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install --legacy-peer-deps
COPY prisma ./prisma/
ENV DATABASE_URL=postgresql://dummy:dummy@localhost:5432/dummy
RUN ./node_modules/.bin/prisma generate
COPY tsconfig.json ./
COPY src ./src/
RUN ./node_modules/.bin/tsc

FROM node:20-slim
RUN apt-get update && apt-get install -y ffmpeg python3 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY package*.json ./
RUN printf '#!/bin/sh\nset -e\n./node_modules/.bin/prisma db push --accept-data-loss 2>/dev/null || true\nnode dist/config/seed.js 2>/dev/null || true\nexec node dist/index.js\n' > /app/start.sh && chmod +x /app/start.sh
RUN mkdir -p /app/uploads
EXPOSE 3001
ENV DATABASE_URL=postgresql://adega:\${DB_P…ga
CMD ["/app/start.sh"]
