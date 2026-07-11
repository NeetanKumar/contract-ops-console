# --- Build stage ---
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
# Baked in at build time (Vite env vars are compiled into the static bundle, not
# read at container runtime) — override with --build-arg for a different backend URL.
ARG VITE_API_URL=http://localhost:4000
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

# --- Runtime stage: static file server ---
FROM nginx:alpine AS runtime
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
