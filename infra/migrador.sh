#!/usr/bin/env bash
# =============================================================================
# DTECH MED — o migrador, e ele NUNCA roda de imagem velha
# =============================================================================
# Uso:
#   bash infra/migrador.sh                          # aplica as migrações
#   bash infra/migrador.sh npx prisma db seed       # cria o Super Admin
#   bash infra/migrador.sh npx prisma migrate status
#   bash infra/migrador.sh npx tsx scripts/cenario-demo.mts
#
# -----------------------------------------------------------------------------
# POR QUE ESTE ARQUIVO EXISTE
# -----------------------------------------------------------------------------
# O comando certo era longo:
#
#   docker compose -p dtechmed --profile manutencao build migrador && \
#   docker compose -p dtechmed --profile manutencao run --rm migrador
#
# e o comando ERRADO era o mesmo sem a primeira metade — mais curto, mais fácil
# de lembrar, e indistinguível do certo pela saída que produz. Foi o que
# aconteceu duas vezes:
#
#   1. As migrações rodaram por três deploys a partir do código do dia em que a
#      imagem nasceu. O repositório tinha 11 migrações, a imagem tinha 10. O
#      Prisma lê as migrações de DENTRO da imagem: sem conhecer a nova, ele
#      anunciou "No pending migrations to apply" e saiu com zero. Verde. A
#      tabela simplesmente não existia.
#
#   2. O cenário de demonstração criou 6 ordens quando o script no repositório
#      criava 22. Mesma causa exata, um dia depois, num comando diferente.
#
# `docker compose run` cria um contêiner descartável a partir da imagem que
# EXISTE. Ele constrói na primeiríssima execução e nunca mais — a menos que
# alguém mande. Serviço com `profiles:` também fica de fora do `up --build`,
# então nada mais no fluxo normal a atualiza.
#
# A correção não é lembrar melhor: é o comando curto passar a ser o correto.
# Não há como pular a construção aqui, e é de propósito — uma opção
# `--sem-construir` seria o caminho de volta para o mesmo defeito.
#
# O custo é baixo: sem mudança no código, o Docker reaproveita as camadas e a
# construção leva segundos. Quando o código MUDOU, reconstruir é exatamente o
# que se quer.
# =============================================================================
set -euo pipefail

cd "$(dirname "$0")/.."
PROJETO=dtechmed

verde()  { printf '  \033[32m✓\033[0m %s\n' "$1"; }
alerta() { printf '  \033[33m!\033[0m %s\n' "$1"; }
morre()  { printf '\n  \033[31m✗ %s\033[0m\n\n' "$1" >&2; exit 1; }
titulo() { printf '\n\033[1m%s\033[0m\n' "$1"; }

compose() { docker compose -p "$PROJETO" --profile manutencao "$@"; }

# ---------------------------------------------------------------------------
[ -f docker-compose.yml ] || morre "docker-compose.yml não está aqui. Rode de dentro da gaveta DTECH-MED."
command -v docker >/dev/null || morre "docker não encontrado."
docker info >/dev/null 2>&1 || morre "o serviço do Docker não está respondendo."
[ -f .env ] || morre ".env não existe. Rode antes: bash infra/gerar-env.sh SEU_DOMINIO"

# O migrador conecta como `dtechmed_owner` pela DIRECT_DATABASE_URL — o único
# papel com poder de criar tabela. Sem ela, a migração falha lá dentro com uma
# mensagem do Prisma que não explica o que faltou.
grep -qE '^DIRECT_DATABASE_URL=.+' .env || morre "DIRECT_DATABASE_URL vazia no .env. É por ela que o migrador cria tabela."

# O banco precisa estar de pé: o serviço tem `depends_on: service_healthy`, e
# sem isso o Compose fica esperando em silêncio até estourar o tempo.
if ! docker ps --format '{{.Names}}' | grep -qx dtechmed_db; then
  morre "o contêiner dtechmed_db não está rodando. Suba a gaveta antes: bash infra/subir.sh"
fi

# ---------------------------------------------------------------------------
titulo "Construindo o migrador a partir do código de AGORA"
# ---------------------------------------------------------------------------
compose build migrador
verde "imagem do migrador reconstruída"

# ---------------------------------------------------------------------------
if [ "$#" -eq 0 ]; then
  titulo "Aplicando migrações"
else
  titulo "Executando: $*"
fi
# ---------------------------------------------------------------------------
compose run --rm migrador "$@"

# ---------------------------------------------------------------------------
# A conferência que teria pego os dois defeitos no dia em que aconteceram.
#
# Só faz sentido no caminho padrão (migrate deploy). Nos outros — semeadura,
# status, cenário de demonstração — o número de migrações não muda, e conferir
# ali seria barulho.
# ---------------------------------------------------------------------------
if [ "$#" -eq 0 ]; then
  USUARIO=$(grep -E '^POSTGRES_USER=' .env | cut -d= -f2-)
  BANCO=$(grep -E '^POSTGRES_DB=' .env | cut -d= -f2-)

  NO_REPO=$(find prisma/migrations -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' ')
  NO_BANCO=$(docker exec dtechmed_db psql -U "${USUARIO:-dtechmed_owner}" -d "${BANCO:-dtechmed}" -tAc \
    "SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL" \
    2>/dev/null | tr -d ' ')

  titulo "O banco está no ponto que este código espera?"
  if [ "${NO_BANCO:-0}" = "$NO_REPO" ]; then
    verde "$NO_BANCO migrações no repositório, $NO_BANCO aplicadas no banco"
  else
    morre "o repositório tem $NO_REPO migrações e o banco registra ${NO_BANCO:-0}. NÃO coloque em uso."
  fi
fi

printf '\n'
