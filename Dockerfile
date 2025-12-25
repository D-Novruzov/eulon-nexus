# Multi-stage build for Railway deployment
# This compiles TypeScript for faster startup and better performance

FROM node:20-alpine AS builder

# Install ALL dependencies (including devDependencies for build)
WORKDIR /app
COPY backend/package*.json ./
RUN npm ci

# Copy source and compile TypeScript
COPY backend/ ./
RUN npm run build

# Production stage
FROM node:20-alpine

# Set production environment
ENV NODE_ENV=production
ENV NODE_OPTIONS="--max-old-space-size=512"

WORKDIR /app

# Copy package files and install ONLY production dependencies
COPY backend/package*.json ./
RUN npm ci --only=production

# Copy compiled output from builder
COPY --from=builder /app/dist ./dist

# Expose port (Railway uses dynamic PORT env var, typically 8080)
EXPOSE 4000 8080

# Health check (uses Railway's PORT environment variable)
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "const port = process.env.PORT || 4000; require('http').get('http://localhost:' + port + '/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1); })"

# Start the server
CMD ["node", "dist/index.js"]

