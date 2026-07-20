# Use a specific Node.js version with a SHA256 digest for reproducibility
FROM node:20-alpine@sha256:f84e50c98e4edc519a334152eede59ade84f9f4a09e62a2e0ef3649e6a23859c

# Create a non-root user and group
RUN addgroup -S radio && adduser -S radio -G radio

WORKDIR /app

# Install only required system packages
RUN apk add --no-cache ffmpeg

# Copy package.json and install dependencies first (better layer caching)
COPY package.json package-lock.json* ./
RUN npm ci --only=production && npm cache clean --force

# Copy application code
COPY index.js .

# Create music directory with proper permissions
RUN mkdir -p /app/music && chown -R radio:radio /app /app/music

# Switch to non-root user
USER radio

EXPOSE 8000

CMD ["node", "index.js"]
