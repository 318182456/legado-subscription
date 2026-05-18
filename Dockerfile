# Build stage
FROM node:22-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Run stage
FROM node:22-alpine

WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/worker ./worker
COPY --from=builder /app/adapter ./adapter
COPY --from=builder /app/entry.node.ts ./
COPY --from=builder /app/tsconfig.json ./
COPY --from=builder /app/VERSION ./

# 安装 tsx 用于直接运行 typescript
RUN npm install -g tsx

EXPOSE 3000

CMD ["tsx", "entry.node.ts"]
