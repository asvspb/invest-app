# syntax=docker/dockerfile:1

# ---- Stage 1: builder ----
# Full deps + source; produces dist/ (frontend bundle) and dist/server/server.js.
# Node 22 required: Vite 8 (rolldown) needs util.styleText (Node 20.19+); aligns with local dev.
FROM node:22-alpine AS builder

WORKDIR /app

# Install ALL deps (incl. dev: vite, typescript, tsx) — needed for build only
COPY package*.json ./
RUN npm ci

# Copy sources and build
COPY . .
RUN npm run build

# ---- Stage 2: runtime ----
# Minimal: only prod deps + compiled output. No source, no dev deps.
FROM node:22-alpine AS runtime

WORKDIR /app

# Production deps only
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Compiled output from builder (frontend dist/ + dist/server/server.js)
COPY --from=builder /app/dist ./dist

ENV NODE_ENV=production
ENV PORT=7777
EXPOSE 7777

# Compiled CJS server serves dist/ (static) + /api/* (CBR proxy)
CMD ["node", "dist/server/server.js"]
