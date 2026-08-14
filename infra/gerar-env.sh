#!/usr/bin/env bash
# =============================================================================
# DTECH MED — gera o .env de produção
# =============================================================================
# Uso:  bash infra/gerar-env.sh conexevolution.online
#
# Por que um script, e não copiar e colar seis valores no nano por SSH:
#
#   1. Cada segredo tem um formato próprio, e errar o formato dá um erro que
#      aponta para o lugar errado. As senhas do banco entram dentro de uma URL
#      (postgresql://usuario:SENHA@db:5432/...), então não podem conter "/",
#      "+" nem "=" — que é exatamente o que `openssl rand -base64` produz. Aqui
#      elas saem em hexadecimal, que é sempre seguro em URL. Já o
#      SESSION_SECRET e o ENCRYPTION_KEY são lidos com Buffer.from(v,'base64')
#      e precisam decodificar para 32 bytes: esses são base64 mesmo.
#   2. A senha aparece em dois lugares (a variável e a URL de conexão). Digitar
#      duas vezes é uma chance de divergir.
#   3. O arquivo nasce com permissão 600. Um `nano` seguido de `chmod` deixa uma
#      janela em que o segredo está no disco legível por todo mundo.
#
# O script NÃO sobrescreve um .env existente. Se você precisa refazer, mova o
# antigo antes — apagar sozinho o arquivo que guarda a ENCRYPTION_KEY de um
# sistema em uso seria destruir o WhatsApp de todas as franquias.
# =============================================================================
set -euo pipefail

cd "$(dirname "$0")/.."

DOMINIO="${1:-}"
if [[ -z "$DOMINIO" ]]; then
  echo "Uso: bash infra/gerar-env.sh SEU_DOMINIO" >&2
  echo "Exemplo: bash infra/gerar-env.sh conexevolution.online" >&2
  exit 1
fi

if [[ -f .env ]]; then
  echo "ERRO: .env já existe em $(pwd)." >&2
  echo "Se quiser começar de novo, guarde o atual primeiro:" >&2
  echo "    mv .env .env.antigo-\$(date +%Y%m%d%H%M)" >&2
  exit 1
fi

umask 077

# Hexadecimal: sempre seguro dentro de uma URL de conexão.
POSTGRES_PASSWORD="$(openssl rand -hex 32)"
APP_DB_PASSWORD="$(openssl rand -hex 32)"

# Base64 de 32 bytes: é assim que a aplicação lê os dois.
SESSION_SECRET="$(openssl rand -base64 32)"
ENCRYPTION_KEY="$(openssl rand -base64 32)"

# Só precisa ter 16 caracteres ou mais. Hexadecimal para não ter surpresa.
DOCUMENT_HASH_SALT="$(openssl rand -hex 24)"
UAZAPI_WEBHOOK_SECRET="$(openssl rand -hex 24)"

cat > .env <<EOF
# =============================================================================
# DTECH MED — produção
# Gerado por infra/gerar-env.sh. Não versionar. Não enviar por mensagem.
# =============================================================================
NODE_ENV=production
APP_URL=https://${DOMINIO}
APP_NAME="DTECH MED"

# ---------- Banco ----------
POSTGRES_DB=dtechmed
POSTGRES_USER=dtechmed_owner
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
APP_DB_PASSWORD=${APP_DB_PASSWORD}

# A aplicação conecta como dtechmed_app: sem superusuário, sem BYPASSRLS,
# submetido às policies como qualquer um. O host é 'db', o nome do serviço
# na rede do Docker.
DATABASE_URL="postgresql://dtechmed_app:${APP_DB_PASSWORD}@db:5432/dtechmed?schema=public&connection_limit=20&pool_timeout=20"

# Só para as migrações. NUNCA na aplicação.
DIRECT_DATABASE_URL="postgresql://dtechmed_owner:${POSTGRES_PASSWORD}@db:5432/dtechmed?schema=public"

# ---------- Segredos ----------
SESSION_SECRET=${SESSION_SECRET}
ENCRYPTION_KEY=${ENCRYPTION_KEY}
DOCUMENT_HASH_SALT=${DOCUMENT_HASH_SALT}

# ---------- WhatsApp ----------
# PREENCHER: token de administrador da uazapi. Sem ele o sistema sobe e
# funciona; as mensagens automáticas ficam guardadas na fila e disparam
# sozinhas quando o token entrar.
UAZAPI_BASE_URL=https://free.uazapi.com
UAZAPI_ADMIN_TOKEN=
UAZAPI_WEBHOOK_SECRET=${UAZAPI_WEBHOOK_SECRET}

# ---------- Armazenamento ----------
STORAGE_DRIVER=local
STORAGE_LOCAL_PATH=/app/storage

# ---------- Fila de automação ----------
WORKER_ENABLED=true
WORKER_POLL_INTERVAL_MS=3000
WORKER_BATCH_SIZE=10
WORKER_MAX_ATTEMPTS=6

# ---------- Segurança ----------
# Lista fechada, sem curinga: é ela que recusa formulário enviado de outro
# site. Endereço fora desta lista leva 403.
ALLOWED_ORIGINS=https://${DOMINIO},https://www.${DOMINIO}
LOGIN_RATE_LIMIT_WINDOW_MS=900000
LOGIN_RATE_LIMIT_MAX=8
SESSION_TTL_HOURS=12

# true só porque a aplicação fica atrás do Caddy desta VPS. Se um dia ela for
# exposta direto, volte para false: senão o IP da trilha de auditoria vira um
# campo que qualquer um preenche, e IP forjado é pior que IP nenhum.
TRUST_PROXY=true

# ---------- Site institucional ----------
SITE_TENANT_SLUG=dtechmed-lajeado
LEAD_RATE_LIMIT_WINDOW_MS=600000
LEAD_RATE_LIMIT_MAX=5

# ---------- Backup ----------
BACKUP_RETENCAO_DIAS=14
BACKUP_INTERVALO_SEGUNDOS=86400

# ---------- Primeiro acesso ----------
# PREENCHER: usado uma única vez para criar o Super Admin.
SEED_SUPERADMIN_EMAIL=
SEED_SUPERADMIN_PASSWORD=
EOF

chmod 600 .env

echo
echo "  .env criado em $(pwd)/.env"
echo
echo "  Faltam 3 valores, e são os únicos que eu não posso gerar:"
echo "     UAZAPI_ADMIN_TOKEN      (vem do painel da uazapi)"
echo "     SEED_SUPERADMIN_EMAIL   (seu e-mail de acesso)"
echo "     SEED_SUPERADMIN_PASSWORD (uma senha forte, só sua)"
echo
echo "  Guarde uma cópia do arquivo num gerenciador de senhas ANTES de seguir."
echo "  A ENCRYPTION_KEY e o DOCUMENT_HASH_SALT não podem ser trocados depois"
echo "  que o sistema entrar em uso."
echo
