# -------------------------
# deps (install all deps needed to build)
# -------------------------
FROM node:18-alpine AS deps
RUN apk add --no-cache openssl
WORKDIR /app

COPY package*.json ./
RUN npm ci

# -------------------------
# build (copy source + build + prisma generate)
# -------------------------
FROM node:18-alpine AS builder
RUN apk add --no-cache openssl
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npx prisma generate
RUN npm run build

# -------------------------
# runtime (production deps only)
# -------------------------
FROM node:18-alpine AS runner
RUN apk add --no-cache openssl
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# Copy build output (pick the right one)
COPY --from=builder /app/dist ./dist
# If this is Next.js, comment dist and use:
# COPY --from=builder /app/.next ./.next
# COPY --from=builder /app/public ./public

# If your server reads other runtime files (views, uploads, etc), copy them too:
# COPY --from=builder /app/some-folder ./some-folder

EXPOSE 3000
CMD ["npm", "start"]
