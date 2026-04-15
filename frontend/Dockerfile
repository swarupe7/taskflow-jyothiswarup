# ── Stage 1: Build ─────────────────────────────────────────────────────────────
# Node image builds the Vite app into static files.
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files first for better layer caching
COPY package*.json ./
RUN npm ci --silent

# Copy source and build — the VITE_API_URL points to the backend service
COPY . .
ARG VITE_API_URL=http://localhost:8080
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

# ── Stage 2: Serve ────────────────────────────────────────────────────────────
# nginx serves the compiled static files efficiently.
# No Node runtime in production — just nginx + the dist/ folder.
FROM nginx:alpine

# Copy our custom nginx config that handles React Router's client-side routing
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy the built Vite output from stage 1
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 3000

CMD ["nginx", "-g", "daemon off;"]
