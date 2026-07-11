# --- Build stage: compile TypeScript + generate the Prisma client ---
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npx prisma generate
RUN npm run build

# --- Runtime stage: production deps only ---
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev
RUN npx prisma generate

COPY --from=builder /app/dist ./dist
COPY openapi.yaml ./

EXPOSE 4000
CMD ["node", "dist/index.js"]
