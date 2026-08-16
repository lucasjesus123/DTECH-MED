#!/usr/bin/env bash
# =============================================================================
# DTECH MED — troca o domínio público no .env
# =============================================================================
# Uso:  bash infra/virar-dominio.sh PRINCIPAL [EXTRA...]
#
# Exemplo:
#   bash infra/virar-dominio.sh dtechmed.com.br dtechmed.com conexevolution.online
#
# O PRIMEIRO domínio é o principal: é ele que vai no APP_URL, é ele que o site
# declara ao Google como o endereço verdadeiro, e é para ele que a portaria
# redireciona todos os outros. Os demais entram só na lista de origens aceitas.
#
# -----------------------------------------------------------------------------
# POR QUE UM SCRIPT, E NÃO UM `sed` COLADO NO TERMINAL
# -----------------------------------------------------------------------------
# A lista de origens precisa conter as versões com "www". Alguns clientes de
# terminal e de chat convertem automaticamente qualquer texto começando com
# "www." num link, com colchetes e parênteses em volta — e o que chega ao
# arquivo é lixo com pontuação no meio. Num .env isso não derruba nada na hora:
# a aplicação sobe, o site abre, e só o formulário de contato passa a devolver
# 403 para todo mundo, dias depois, sem ninguém ligar uma coisa à outra.
#
# Aqui os nomes com "www" são MONTADOS pelo script a partir do domínio que você
# digitou. Eles nunca passam pela área de transferência.
#
# -----------------------------------------------------------------------------
# O QUE ELE NÃO FAZ
# -----------------------------------------------------------------------------
# Não reinicia nada e não toca na portaria. Ele mexe em duas linhas de um
# arquivo e mostra o antes e o depois. Quem sobe é o `infra/subir.sh`, no
# comando seguinte, e é lá que estão as conferências.
# =============================================================================
set -euo pipefail

cd "$(dirname "$0")/.."

verde()  { printf '  \033[32m✓\033[0m %s\n' "$1"; }
morre()  { printf '\n  \033[31m✗ %s\033[0m\n\n' "$1" >&2; exit 1; }

PRINCIPAL="${1:-}"
if [[ -z "$PRINCIPAL" ]]; then
  echo "Uso: bash infra/virar-dominio.sh PRINCIPAL [EXTRA...]" >&2
  echo "Ex.: bash infra/virar-dominio.sh dtechmed.com.br dtechmed.com" >&2
  exit 1
fi

[[ -f .env ]] || morre ".env não existe em $(pwd)."

# Cada nome tem que ser um domínio, e nada além disso. Esta conferência é a
# rede embaixo da anterior: se um "[www.dtechmed.com.br](...)" chegar até aqui
# por qualquer caminho, ele morre nesta linha em vez de virar um 403 semanas
# depois.
for D in "$@"; do
  [[ "$D" =~ ^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$ ]] \
    || morre "'$D' não parece um domínio. Escreva só o nome, sem https:// e sem barra no fim."
  [[ "$D" != www.* ]] \
    || morre "'$D' começa com www. Passe só o domínio raiz — as versões com www são montadas aqui dentro."
done

# A lista de origens: cada domínio entra com e sem "www", montados aqui.
ORIGENS=""
for D in "$@"; do
  ORIGENS="${ORIGENS}https://${D},https://www.${D},"
done
ORIGENS="${ORIGENS%,}"

NOVA_URL="https://${PRINCIPAL}"

ANTES_URL=$(grep -E '^APP_URL=' .env | head -1 || echo '(ausente)')
ANTES_ORI=$(grep -E '^ALLOWED_ORIGINS=' .env | head -1 || echo '(ausente)')

# Cópia antes de tocar. O .env guarda a ENCRYPTION_KEY, que não pode ser
# regenerada sem perder o WhatsApp de todas as franquias — então nenhuma
# escrita aqui acontece sem uma cópia do estado anterior no disco.
COPIA=".env.antes-da-virada-$(date +%Y%m%d%H%M%S)"
cp -p .env "$COPIA"
chmod 600 "$COPIA"
verde "cópia do .env anterior guardada em $COPIA"

# Escreve num arquivo novo e troca no fim. Assim uma interrupção no meio deixa
# o .env original intacto, em vez de um arquivo pela metade que impede a
# aplicação de subir.
TMP=$(mktemp)
chmod 600 "$TMP"
awk -v url="$NOVA_URL" -v ori="$ORIGENS" '
  /^APP_URL=/         { print "APP_URL=" url; achou_url=1; next }
  /^ALLOWED_ORIGINS=/ { print "ALLOWED_ORIGINS=" ori; achou_ori=1; next }
                      { print }
  END {
    if (!achou_url) print "APP_URL=" url
    if (!achou_ori) print "ALLOWED_ORIGINS=" ori
  }
' .env > "$TMP"

# Confere o resultado ANTES de substituir o original.
grep -qE "^APP_URL=${NOVA_URL}$" "$TMP" || { rm -f "$TMP"; morre "a escrita saiu errada. O .env NÃO foi alterado."; }
grep -qE '^ALLOWED_ORIGINS=https://' "$TMP" || { rm -f "$TMP"; morre "a escrita saiu errada. O .env NÃO foi alterado."; }
LINHAS_ANTES=$(wc -l < .env)
LINHAS_DEPOIS=$(wc -l < "$TMP")
[ "$LINHAS_DEPOIS" -ge "$LINHAS_ANTES" ] \
  || { rm -f "$TMP"; morre "o arquivo novo tem menos linhas que o antigo. O .env NÃO foi alterado."; }

mv "$TMP" .env
chmod 600 .env

printf '\n\033[1mAntes\033[0m\n'
printf '  %s\n  %s\n' "$ANTES_URL" "$ANTES_ORI"
printf '\n\033[1mAgora\033[0m\n'
grep -E '^APP_URL=|^ALLOWED_ORIGINS=' .env | sed 's/^/  /'

cat <<FIM

  O arquivo mudou. Nada subiu ainda.

  Próximo comando:
      bash infra/subir.sh

  Ele reconstrói a imagem, confere o banco, confere os vizinhos e confere que
  o robots.txt e o sitemap.xml passaram a declarar $NOVA_URL — que é o endereço
  que o Google vai indexar.

FIM
