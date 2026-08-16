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

# ---------------------------------------------------------------------------
# VALORES DE FACHADA, SÓ PARA A CONSTRUÇÃO PASSAR
# ---------------------------------------------------------------------------
# O `.dockerignore` mantém o `.env` de produção fora da imagem — os segredos
# não têm por que existir aqui dentro. Mas o `next build` precisa que as
# variáveis obrigatórias EXISTAM: o `layout.tsx` importa a validação de
# ambiente, e ela é executada ao montar as páginas pré-renderizadas (a de 404,
# a de erro). Sem nada preenchido, a construção para na coleta das páginas —
# medido, não suposto.
#
# Então entram valores de mentira, escolhidos para serem impossíveis de
# confundir com os de verdade. Eles ficam só neste estágio; a imagem final não
# os declara, porque ela copia arquivos escolhidos e não herda ambiente.
#
# E, para o caso de alguém um dia subir a aplicação a partir do estágio de
# construção sem passar o `.env`, o `src/lib/env.ts` RECUSA estes valores em
# execução. Chave publicada num Dockerfile assinando sessão de verdade seria
# pior que nenhuma trava — e é o tipo de coisa que ninguém percebe até ser
# tarde.
ENV DATABASE_URL="postgresql://construcao:construcao@construcao:5432/construcao" \
    SESSION_SECRET="Q09OU1RSVUNBTy1TRU0tU0VHUkVETy1SRUFMLTAwMDE=" \
    ENCRYPTION_KEY="Q09OU1RSVUNBTy1TRU0tU0VHUkVETy1SRUFMLTAwMDI=" \
    DOCUMENT_HASH_SALT="construcao-sem-segredo-real"

# O endereço público, ao contrário dos de cima, NÃO é segredo — e precisa ser o
# de verdade. Ele é o que a página de 404 grava nas etiquetas de
# compartilhamento, e essas são resolvidas durante a construção. O compose
# passa o valor do `.env`; o padrão aqui só serve para um `docker build` solto.
ARG APP_URL=http://localhost:3000
ENV APP_URL=$APP_URL

RUN npx prisma generate \
 && npm run build \
 && npx tsx --version >/dev/null 2>&1 || true
# Compila o worker para JS puro — a imagem final não carrega tsx nem o
# código-fonte. Migração e semeadura NÃO rodam aqui: elas têm serviço próprio
# no compose, a partir do estágio de build, que tem o CLI do Prisma e o
# prisma.config.ts. Tentar rodá-las na imagem enxuta falharia — e falharia
# justamente no dia do deploy.
#
# O par --define/--banner existe por um motivo específico. O cliente gerado
# pelo Prisma 7 abre com:
#
#     globalThis['__dirname'] = path.dirname(fileURLToPath(import.meta.url))
#
# um remendo para rodar em ESM. Só que este pacote sai em CJS, onde
# `import.meta` não existe: o esbuild o substitui por um objeto vazio, o
# `fileURLToPath` recebe `undefined` e o worker morre no carregamento, antes
# de qualquer linha nossa —
# `TypeError: The "path" argument must be of type string`, em laço de reinício.
#
# O `--define` troca `import.meta.url` por um identificador, e o `--banner` o
# define com o equivalente em CJS. `__filename` existe aqui, e `pathToFileURL`
# devolve a URL no formato que o `fileURLToPath` espera.
RUN npx esbuild worker/index.ts \
      --bundle --platform=node --target=node22 --format=cjs \
      --external:@prisma/client --external:.prisma --external:sharp \
      --external:@node-rs/argon2 --external:pdfkit \
      --define:import.meta.url=__esbuild_import_meta_url \
      --banner:js="const __esbuild_import_meta_url = require('node:url').pathToFileURL(__filename).href;" \
      --outfile=worker/dist/index.js \
 && grep -q '__esbuild_import_meta_url' worker/dist/index.js \
 && echo "worker empacotado com a ponte de import.meta.url"

# ---------- Estágio 2b: o pdfkit, que não pode ser empacotado ----------
# O pdfkit carrega as métricas das fontes padrão de arquivos `.afm` que ele lê
# do próprio diretório em tempo de execução. Empacotá-lo faz o `require` sumir
# mas não os arquivos: o bundle sobe, e só na hora de gerar o primeiro PDF é
# que aparece `ENOENT: data/Helvetica.afm`. Medido, não suposto.
#
# Ele também não chega pelo rastreamento do Next: a geração de PDF é alcançada
# por `await import()` dentro do worker, que roda em processo separado e nunca
# é importado por uma rota. Então o Next não tem como saber que precisa dele.
#
# Daí este estágio: instala só o pdfkit e a árvore dele, na versão declarada no
# package.json, para ser copiado inteiro na imagem final.
FROM node:22-alpine AS pdfdeps
WORKDIR /pdf
COPY package.json /tmp/package.json
RUN VERSAO=$(node -p "require('/tmp/package.json').dependencies.pdfkit") \
 && npm init -y >/dev/null \
 && npm install --omit=dev --no-audit --no-fund "pdfkit@${VERSAO}" \
 && node -e "require('/pdf/node_modules/pdfkit')" \
 && echo "pdfkit ${VERSAO} instalado e carregando"

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

# O cliente do Prisma NÃO vem de `node_modules/.prisma`. No Prisma 7 o gerador
# `prisma-client` escreve em `src/generated/prisma` (ver o bloco `generator` no
# schema), e o rastreamento do Next já leva para o standalone tanto o código
# gerado quanto o `@prisma/client` que ele usa. Copiar `.prisma` daqui quebrava
# o build com "not found" — o diretório simplesmente não existe nesta versão.

# O pdfkit por cima. `COPY` de diretório soma ao que já está lá, então isto
# acrescenta a árvore dele sem tocar no que o standalone trouxe.
COPY --from=pdfdeps --chown=dtechmed:nodejs /pdf/node_modules ./node_modules

# Diretório de anexos (fotos, PDFs, assinaturas) — montado como volume.
RUN mkdir -p /app/storage && chown -R dtechmed:nodejs /app/storage

USER dtechmed
EXPOSE 3000

# tini garante encerramento limpo (sem job órfão na fila).
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]
