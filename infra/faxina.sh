#!/usr/bin/env bash
# =============================================================================
# DTECH MED — o que está ocupando disco, e o que dá para limpar
# =============================================================================
# Uso:
#   bash infra/faxina.sh              # só olha. Não apaga NADA.
#   bash infra/faxina.sh --limpar     # apaga só o que é inequivocamente nosso
#
# -----------------------------------------------------------------------------
# A REGRA QUE MANDA NESTE ARQUIVO
# -----------------------------------------------------------------------------
# Esta VPS hospeda outros dois sistemas. O comando que a internet inteira
# recomenda para "limpar o Docker" é:
#
#     docker system prune -a --volumes
#
# Ele apaga TODAS as imagens sem contêiner rodando, TODOS os volumes sem uso e
# TODAS as redes órfãs — da máquina inteira. Num servidor com um sistema só,
# libera espaço. Aqui, ele apaga a imagem que o vizinho usa para reconstruir, o
# volume de backup que o vizinho guarda, e o banco de dados de qualquer gaveta
# que estivesse parada naquele minuto. Sem pergunta e sem volta.
#
# Este script NUNCA o executa, nem sugere. Nem `docker volume prune`. O que ele
# apaga é escolhido nome a nome, e cada nome começa com `dtechmed`.
#
# -----------------------------------------------------------------------------
# POR QUE OLHAR VEM SEPARADO DE APAGAR
# -----------------------------------------------------------------------------
# "Limpar a hospedagem" costuma ser um comando que alguém cola sem saber o que
# vai sumir. Aqui são dois passos: você lê o que existe, com o tamanho de cada
# coisa e o que ela é, e só depois decide. O relatório é o produto principal —
# o `--limpar` é o acessório.
# =============================================================================
set -uo pipefail

cd "$(dirname "$0")/.."

LIMPAR=nao
[ "${1:-}" = "--limpar" ] && LIMPAR=sim

verde()  { printf '  \033[32m✓\033[0m %s\n' "$1"; }
alerta() { printf '  \033[33m!\033[0m %s\n' "$1"; }
grave()  { printf '  \033[31m▲\033[0m %s\n' "$1"; }
titulo() { printf '\n\033[1m%s\033[0m\n' "$1"; }
nota()   { printf '      %s\n' "$1"; }

# Bytes para algo que se lê.
#
# Com `awk`, e não com `bc`: o `bc` não vem instalado em imagem enxuta de
# servidor, e um relatório que morre por falta de calculadora no meio da
# contagem é pior que um relatório sem número bonito.
humano() {
  awk -v b="${1:-0}" 'BEGIN{
    if      (b >= 1073741824) printf "%.1f GB", b/1073741824
    else if (b >= 1048576)    printf "%.0f MB", b/1048576
    else if (b >= 1024)       printf "%.0f kB", b/1024
    else                      printf "%d B", b
  }'
}

command -v docker >/dev/null || { echo "docker não encontrado." >&2; exit 1; }

# ---------------------------------------------------------------------------
titulo "1. O disco"
# ---------------------------------------------------------------------------
df -h / | tail -1 | awk '{printf "      %s usado de %s (%s), sobram %s\n", $3, $2, $5, $4}'

USO=$(df / | tail -1 | awk '{print $5}' | tr -d '%')
if   [ "$USO" -ge 90 ]; then grave "disco em ${USO}% — limpar deixou de ser opcional"
elif [ "$USO" -ge 75 ]; then alerta "disco em ${USO}% — bom limpar antes que aperte"
else verde "disco em ${USO}%, folgado"
fi

titulo "2. Os maiores diretórios do sistema"
du -xhd1 / 2>/dev/null | sort -rh | head -8 | sed 's/^/      /'

# ---------------------------------------------------------------------------
titulo "3. O Docker, por categoria"
# ---------------------------------------------------------------------------
docker system df 2>/dev/null | sed 's/^/      /'

titulo "4. Imagens: quais são nossas, quais são dos vizinhos"
printf '      %-42s %-12s %s\n' 'IMAGEM' 'TAMANHO' 'DE QUEM'
docker images --format '{{.Repository}}:{{.Tag}}\t{{.Size}}' 2>/dev/null \
  | sort | while IFS=$'\t' read -r nome tam; do
  case "$nome" in
    dtechmed*) dono='NOSSA' ;;
    '<none>:<none>') dono='pendurada (sem nome)' ;;
    *) dono='vizinho — não encoste' ;;
  esac
  printf '      %-42s %-12s %s\n' "$nome" "$tam" "$dono"
done

# Imagem pendurada é a versão anterior de algo que foi reconstruído. A nossa
# gaveta gera uma a cada `subir.sh`, e elas vão se acumulando.
PENDURADAS=$(docker images -f dangling=true -q 2>/dev/null | wc -l)
if [ "$PENDURADAS" -eq 0 ]; then
  # Dizer que não há é parte do relatório. Silêncio aqui seria lido como "não
  # conferi" — e foi o que eu mesmo presumi ao prever um acúmulo que não existe:
  # este Docker substitui a imagem sem deixar a anterior para trás.
  verde 'nenhuma imagem pendurada — as construções não estão deixando sobra'
fi
if [ "$PENDURADAS" -gt 0 ]; then
  alerta "$PENDURADAS imagem(ns) pendurada(s) — versões antigas, já substituídas"
  nota 'Nenhum contêiner em pé depende delas.'
  nota ''
  # Isto não é sobre espaço.
  #
  # Uma imagem construída antes do .dockerignore carrega uma cópia do .env de
  # produção congelada dentro dela: a ENCRYPTION_KEY, o SESSION_SECRET, as
  # senhas do banco. Reconstruir a imagem tira o segredo da NOVA e deixa a
  # antiga intacta, sem nome, no disco.
  #
  # É a forma mais teimosa desse vazamento: trocar a senha no .env não muda o
  # que está lá dentro, e nenhuma ferramenta de segredo olha para camadas de
  # imagem sem nome.
  grave 'Imagem pendurada de antes do .dockerignore guarda uma cópia do .env.'
  nota 'Trocar a senha no arquivo NÃO muda o que está congelado dentro dela.'
  nota 'Elas não têm nome, então o --limpar não sai apagando: ele confere o'
  nota 'rótulo do projeto em cada uma e leva só as da nossa gaveta.'
fi

# ---------------------------------------------------------------------------
titulo "5. Cache de construção"
# ---------------------------------------------------------------------------
CACHE=$(docker system df --format '{{.Type}}\t{{.Size}}' 2>/dev/null | awk -F'\t' '/Build Cache/{print $2}')
nota "ocupa: ${CACHE:-desconhecido}"
nota 'É o que faz um subir.sh levar 40 segundos em vez de 6 minutos.'
nota 'Apagar não quebra nada; só torna a próxima construção lenta — de todos,'
nota 'porque o cache é da máquina, não da gaveta.'
nota ''
# `docker builder prune -f` apaga o cache inteiro, inclusive o que foi usado
# hoje. É o conselho que se encontra por aí, e é grosso demais: joga fora
# justamente as camadas quentes, que são as que economizam tempo.
#
# O `until` mantém o que anda sendo usado e leva o que ninguém toca há uma
# semana — que é onde mora quase todo o volume, porque cada dependência trocada
# deixa a camada antiga para trás.
nota 'Se um dia o disco apertar, comece pelo que está parado há uma semana:'
nota '    docker builder prune --filter until=168h -f'
nota 'Só se isso não bastar, o cache inteiro: docker builder prune -f'

# ---------------------------------------------------------------------------
titulo "6. Registros dos contêineres"
# ---------------------------------------------------------------------------
# Registro sem teto é o jeito mais comum de um servidor encher o disco sem
# ninguém entender por quê: um contêiner tagarela grava até acabar o espaço.
# A nossa gaveta tem teto declarado no compose (10 MB × 5 arquivos por serviço).
TOTAL_LOG=0
for C in $(docker ps -a --format '{{.Names}}' 2>/dev/null); do
  ARQ=$(docker inspect --format '{{.LogPath}}' "$C" 2>/dev/null)
  [ -n "$ARQ" ] && [ -f "$ARQ" ] || continue
  B=$(stat -c '%s' "$ARQ" 2>/dev/null || echo 0)
  TOTAL_LOG=$((TOTAL_LOG + B))
  if [ "$B" -ge 52428800 ]; then
    printf '      %-38s %s  \033[33m← grande\033[0m\n' "$C" "$(humano "$B")"
  elif [ "$B" -ge 5242880 ]; then
    printf '      %-38s %s\n' "$C" "$(humano "$B")"
  fi
done
nota "soma de todos: $(humano "$TOTAL_LOG")"
nota "Os nossos têm teto no compose (10 MB × 5). Vizinho grande acima é do dono dele."

# ---------------------------------------------------------------------------
titulo "7. O que é nosso, e quanto ocupa"
# ---------------------------------------------------------------------------
for V in dtechmed_pgdata dtechmed_storage dtechmed_backups; do
  P=$(docker volume inspect "$V" --format '{{.Mountpoint}}' 2>/dev/null)
  if [ -n "$P" ] && [ -d "$P" ]; then
    printf '      %-24s %s\n' "$V" "$(du -sh "$P" 2>/dev/null | cut -f1)"
  else
    printf '      %-24s (não existe)\n' "$V"
  fi
done

BK=$(docker volume inspect dtechmed_backups --format '{{.Mountpoint}}' 2>/dev/null)
if [ -n "$BK" ] && [ -d "$BK" ]; then
  QTD=$(find "$BK" -type f -name '*.sql*' 2>/dev/null | wc -l)
  nota "$QTD arquivo(s) de backup do banco"
  ANTIGO=$(find "$BK" -type f -name '*.sql*' -printf '%T+ %p\n' 2>/dev/null | sort | head -1)
  [ -n "$ANTIGO" ] && nota "mais antigo: $ANTIGO"
fi

# ---------------------------------------------------------------------------
titulo "8. Sobras na pasta da gaveta"
# ---------------------------------------------------------------------------
# As cópias do .env são o item mais delicado deste relatório. Elas ocupam
# quase nada e guardam TUDO: a chave que decifra os tokens de WhatsApp, o
# segredo das sessões, as senhas do banco. Cada cópia esquecida é mais um
# arquivo de onde esses segredos podem vazar — e o valor dela cai a zero assim
# que o .env atual é dado como bom.
# Os parênteses não são estilo: `-maxdepth` é opção global do `find`, e
# repeti-la depois de um `-o` produz aviso e uma leitura da expressão que não é
# a que se lê. Com eles, o `-o` fica preso ao par de nomes, como se pretende.
#
# E nenhum dos dois padrões casa com `.env` — o arquivo em uso não entra nesta
# lista por construção, não por cuidado na hora de apagar.
COPIAS=$(find . -maxdepth 1 \( -name '.env.antes-da-virada-*' -o -name '.env.antigo-*' \) 2>/dev/null | sort)
if [ -n "$COPIAS" ]; then
  N=$(printf '%s\n' "$COPIAS" | grep -c .)
  grave "$N cópia(s) antiga(s) do .env nesta pasta"
  printf '%s\n' "$COPIAS" | sed 's/^/          /'
  nota "Elas guardam a ENCRYPTION_KEY, o SESSION_SECRET e as senhas do banco."
  nota "Com o sistema no ar e funcionando, não servem mais para nada — e cada"
  nota "uma é mais um arquivo de onde o segredo pode sair."
  nota "O --limpar apaga estas, e NUNCA o .env em uso."
fi

for RESTO in .next node_modules; do
  [ -d "$RESTO" ] || continue
  alerta "$RESTO existe aqui ($(du -sh "$RESTO" 2>/dev/null | cut -f1))"
  nota "A construção acontece dentro do Docker; esta pasta é sobra de algum"
  nota "npm rodado à mão no servidor. Pode ir."
done

# ---------------------------------------------------------------------------
titulo "9. Fora do Docker"
# ---------------------------------------------------------------------------
# Os dois blocos abaixo só sugerem quando há o que fazer.
#
# Um relatório que manda aparar um registro de 169 MB para 200 MB não está
# ajudando: está gastando a atenção de quem lê num conselho que não faz nada.
# Repetido algumas vezes, ensina a passar os olhos pela seção inteira — e aí o
# dia em que houver algo de verdade, também passa.
if command -v journalctl >/dev/null; then
  JB=$(journalctl --disk-usage 2>/dev/null | grep -oE '[0-9]+(\.[0-9]+)?[KMG]' | head -1)
  nota "registros do sistema (journal): ${JB:-?}"
  case "$JB" in
    *G) alerta "acima de 1 GB — vale aparar: journalctl --vacuum-size=200M" ;;
    *M) N=${JB%M}; N=${N%%.*}
        [ "${N:-0}" -ge 500 ] && alerta "para aparar: journalctl --vacuum-size=200M" \
                              || nota 'tamanho normal, nada a fazer.' ;;
    *) nota 'tamanho normal, nada a fazer.' ;;
  esac
fi
if [ -d /var/cache/apt ]; then
  AK=$(du -sk /var/cache/apt 2>/dev/null | cut -f1)
  nota "cache do apt: $(humano $(( ${AK:-0} * 1024 )))"
  # Cache de pacote é puro descarte: o apt rebaixa o que precisar de novo.
  if [ "${AK:-0}" -ge 102400 ]; then
    alerta 'acima de 100 MB, e é descarte puro. Para limpar: apt-get clean'
  else
    nota 'pequeno, não compensa mexer.'
  fi
fi

# ---------------------------------------------------------------------------
if [ "$LIMPAR" != "sim" ]; then
  # ATENÇÃO ao apóstrofo em <<'FIM'. Sem ele, o shell EXECUTA o que estiver
  # entre crases dentro do texto — e o texto abaixo cita, de propósito, os dois
  # comandos que este script promete nunca rodar. Escrito sem as aspas, o modo
  # que só olha rodava `docker system prune` e `docker volume prune` na VPS
  # compartilhada. Foi assim que ele nasceu, e é por isso que este comentário
  # existe: o defeito não parece defeito, parece pontuação.
  cat <<'FIM'

  ─────────────────────────────────────────────────────────────────────
  Nada foi apagado. Este comando só olha.

  Para apagar o que é inequivocamente nosso — cópias antigas do .env e as
  imagens que as nossas construções substituíram:

      bash infra/faxina.sh --limpar

  O que ele NÃO faz, nem se você pedir: `docker system prune`,
  `docker volume prune`, ou qualquer coisa com nome de vizinho. Os itens
  dos passos 5 e 9 têm os comandos escritos ali — são seus para decidir.
  ─────────────────────────────────────────────────────────────────────

FIM
  exit 0
fi

# ---------------------------------------------------------------------------
titulo "LIMPANDO — só o que é nosso"
# ---------------------------------------------------------------------------

if [ -n "${COPIAS:-}" ]; then
  # `shred` antes de apagar: o arquivo guardava chave de criptografia, e
  # `rm` só solta o espaço — os bytes continuam no disco até serem
  # sobrescritos por acaso.
  printf '%s\n' "$COPIAS" | while read -r F; do
    [ -f "$F" ] || continue
    if command -v shred >/dev/null; then shred -u "$F" 2>/dev/null || rm -f "$F"
    else rm -f "$F"; fi
    verde "apagada: $F"
  done
fi

# As imagens penduradas que as NOSSAS construções deixaram para trás.
#
# `docker image prune` apagaria todas as penduradas da máquina, inclusive as
# dos vizinhos. Aqui a lista sai da árvore das nossas imagens: só entra o que
# é ancestral de dtechmed-app ou dtechmed-worker.
NOSSAS_VELHAS=$(docker images --filter 'dangling=true' --format '{{.ID}} {{.CreatedAt}}' 2>/dev/null | awk '{print $1}')
APAGADAS=0
for ID in $NOSSAS_VELHAS; do
  # A imagem pendurada carrega, nos rótulos, o projeto compose que a construiu.
  PROJ=$(docker image inspect "$ID" --format '{{index .Config.Labels "com.docker.compose.project"}}' 2>/dev/null)
  [ "$PROJ" = "dtechmed" ] || continue
  if docker rmi "$ID" >/dev/null 2>&1; then
    APAGADAS=$((APAGADAS + 1))
  fi
done
if [ "$APAGADAS" -gt 0 ]; then
  verde "$APAGADAS imagem(ns) nossa(s) antiga(s) removida(s)"
else
  nota "nenhuma imagem pendurada identificada como nossa (as sem rótulo ficam)"
fi

titulo "Depois"
df -h / | tail -1 | awk '{printf "      %s usado de %s (%s), sobram %s\n", $3, $2, $5, $4}'
VIZ=$(docker ps --format '{{.Names}}' | grep -vc '^dtechmed' || true)
printf '      %s contêiner(es) de vizinho, todos de pé\n' "$VIZ"
