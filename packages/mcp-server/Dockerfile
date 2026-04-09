FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY packages/mcp-server/package.json packages/mcp-server/

RUN npm ci --workspace=@realyn/core --workspace=@realyn/mcp-server

COPY packages/core/ packages/core/
COPY packages/mcp-server/ packages/mcp-server/

RUN npm run build --workspace=@realyn/core && npm run build --workspace=@realyn/mcp-server

FROM node:20-alpine
WORKDIR /app

COPY --from=builder /app/packages/mcp-server/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/core/dist ./node_modules/@realyn/core/dist
COPY --from=builder /app/packages/core/package.json ./node_modules/@realyn/core/package.json

ENV PORT=8080
EXPOSE 8080

CMD ["node", "dist/index.js"]
