# =============================================================================
# DTECH MED — imagem de produção
# Multi-stage: a imagem final não carrega toolchain, código-fonte nem devDeps.
# =============================================================================

# ---------- Estágio 1: dependências ----------
FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --ignore-scripts && npm rebuild sharp @node-rs/argon2

# ---------- Estágio 2: build ----------
FROM node:22-alpine AS builder
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npx prisma generate \
 && npm run build \
 && npx tsx --version >/dev/null 2>&1 || true
# Compila o worker para JS puro — a imagem final não precisa de tsx.
RUN npx esbuild worker/index.ts \
      --bundle --platform=node --target=node22 --format=cjs \
      --external:@prisma/client --external:.prisma --external:sharp \
      --external:@node-rs/argon2 --external:pdfkit \
      --outfile=worker/dist/index.js

# ---------- Estágio 3: runtime ----------
FROM node:22-alpine AS runner
RUN apk add --no-cache libc6-compat openssl tini curl
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    TZ=America/Sao_Paulo

# Usuário sem privilégio. Nada roda como root.
RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 --ingroup nodejs dtechmed

# Saída standalone do Next: só o necessário para servir.
COPY --from=builder --chown=dtechmed:nodejs /app/.next/standalone ./
COPY --from=builder --chown=dtechmed:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=dtechmed:nodejs /app/public ./public
COPY --from=builder --chown=dtechmed:nodejs /app/worker/dist ./worker/dist
COPY --from=builder --chown=dtechmed:nodejs /app/prisma ./prisma
COPY --from=builder --chown=dtechmed:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=dtechmed:nodejs /app/node_modules/@prisma ./node_modules/@prisma

# Diretório de anexos (fotos, PDFs, assinaturas) — montado como volume.
RUN mkdir -p /app/storage && chown -R dtechmed:nodejs /app/storage

USER dtechmed
EXPOSE 3000

# tini garante encerramento limpo (sem job órfão na fila).
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]
