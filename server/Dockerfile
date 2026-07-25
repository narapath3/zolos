FROM node:22-alpine

WORKDIR /app

# Copy shared client modules that the server imports at runtime
COPY src/cards/ ./src/cards/

# Copy server package files and install deps (layer cache)
COPY server/package*.json ./server/
RUN cd server && npm ci --only=production

# Copy server source
COPY server/ ./server/

# Railway sets PORT dynamically; default to 3001 for local Docker runs
EXPOSE 3001

# Health check (uses PORT env if set by Railway)
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:${PORT:-3001}/ || exit 1

# Start the server
CMD ["node", "server/server.js"]
