# Multi-stage build for Railway deployment
# This compiles TypeScript for faster startup and better performance

FROM node:20-alpine AS builder

# Install build dependencies
WORKDIR /app
COPY backend/package*.json ./
RUN npm ci --only=production

# Copy source and compile TypeScript
COPY backend/ ./
RUN npm run build

# Production stage
FROM node:20-alpine

# Set production environment
ENV NODE_ENV=production
ENV NODE_OPTIONS="--max-old-space-size=512"

WORKDIR /app

# Copy compiled output and node_modules from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

# Expose port
EXPOSE 4000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:4000/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1); })"

# Start the server
CMD ["node", "dist/index.js"]

