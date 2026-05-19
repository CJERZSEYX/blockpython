# 两阶段构建：先编译前端，再运行后端
FROM node:20-slim AS builder
WORKDIR /app
COPY frontend/package*.json frontend/
RUN cd frontend && npm install
COPY frontend/ frontend/
RUN cd frontend && npm run build

# 运行阶段
FROM node:20-slim
RUN apt-get update && apt-get install -y python3 && \
    ln -s /usr/bin/python3 /usr/bin/python && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY backend/package*.json ./
RUN npm install --production

COPY backend/src/ ./src/
COPY backend/tsconfig.json ./
COPY --from=builder /app/frontend/dist/ ./frontend/dist/

ENV PORT=3001
EXPOSE 3001

CMD ["npx", "tsx", "src/index.ts"]
