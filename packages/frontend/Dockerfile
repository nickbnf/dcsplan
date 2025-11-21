# Multi-stage build for React frontend
# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml* package-lock.json* yarn.lock* ./
COPY pnpm-workspace.yaml ./

# Install pnpm if not present
RUN npm install -g pnpm

# Install dependencies
COPY packages/frontend/package.json ./packages/frontend/
RUN pnpm install --frozen-lockfile

# Copy source files
COPY packages/frontend ./packages/frontend

# Build arguments for configuration
ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL}
ARG VITE_PLAUSIBLE_DOMAIN
ENV VITE_PLAUSIBLE_DOMAIN=${VITE_PLAUSIBLE_DOMAIN}
ARG VITE_PLAUSIBLE_ENDPOINT
ENV VITE_PLAUSIBLE_ENDPOINT=${VITE_PLAUSIBLE_ENDPOINT}

# Build the application
WORKDIR /app/packages/frontend
RUN pnpm build

# Production stage
FROM nginx:alpine

# Copy nginx configuration
COPY packages/frontend/nginx.conf /etc/nginx/conf.d/default.conf

# Copy built static files from builder
COPY --from=builder /app/packages/frontend/dist /usr/share/nginx/html

# Expose port
EXPOSE 5000

# Start nginx
CMD ["nginx", "-g", "daemon off;"]

