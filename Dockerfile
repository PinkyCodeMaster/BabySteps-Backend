# Use Bun's official image
FROM oven/bun:1.1.38-alpine AS base
WORKDIR /app

# Install dependencies
FROM base AS deps
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile --production

# Build application
FROM base AS builder
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

# Ensure drizzle directory exists (create if migrations haven't been generated yet)
RUN mkdir -p drizzle/meta

# Production image
FROM base AS runner
WORKDIR /app

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 bunuser

# Copy necessary files
COPY --from=deps --chown=bunuser:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=bunuser:nodejs /app/dist ./dist
COPY --from=builder --chown=bunuser:nodejs /app/drizzle ./drizzle
COPY --from=builder --chown=bunuser:nodejs /app/package.json ./
COPY --from=builder --chown=bunuser:nodejs /app/drizzle.config.ts ./

# Copy database schema files (needed for migrations at runtime)
COPY --from=builder --chown=bunuser:nodejs /app/src/db ./src/db

# Switch to non-root user
USER bunuser

# Expose port
EXPOSE 9000

# Set environment variables
ENV NODE_ENV=production
ENV PORT=9000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD bun run -e "fetch('http://localhost:9000/health').then(r => r.ok ? process.exit(0) : process.exit(1))"

# Start application
CMD ["bun", "run", "start"]
