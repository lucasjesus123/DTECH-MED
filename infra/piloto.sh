#!/usr/bin/env bash
# =============================================================================
# PILOTO AUTOMÁTICO — o que foi empurrado para o branch entra no ar sozinho
# =============================================================================
# Uso (no servidor):
#
#   bash infra/piloto.sh            # uma passada (é o que o timer chama)
#   bash infra/piloto.sh agora      # força, mesmo sem commit novo
#   bash infra/piloto.sh pausar     # trava: nada sobe até você liberar
#   bash infra/piloto.sh voltar     # destrava
#   bash infra/piloto.sh log        # as últimas 60 linhas do diário
#   bash infra/piloto.sh situacao   # ligado? pausado? travado? em que commit?
#
# -----------------------------------------------------------------------------
# O QUE ELE FAZ, E O QUE ELE DE PROPÓSITO NÃO FAZ
# -----------------------------------------------------------------------------
# Ele NÃO é um deploy novo. Ele chama o `infra/subir.sh`, que é o mesmo deploy
# que você roda à mão, com as mesmas conferências: tabelas, RLS forçado,
# políticas com WITH CHECK, /api/health, as rotas, o endereço que o robots.txt
# declara, e a fotografia dos vizinhos antes e depois.
#
# Escrever um caminho automático PARALELO ao manual seria criar um segundo
# lugar que precisa lembrar das mesmas coisas — e dois lugares assim é ter um
# que vai esquecer. Este arquivo só decide TRÊS coisas: se há o que subir, se é
# seguro subir agora, e o que fazer quando dá errado.
#
# -----------------------------------------------------------------------------
# A LINHA QUE SEPARA VOLTAR ATRÁS DE NÃO PODER VOLTAR
# -----------------------------------------------------------------------------
# Commit sem migração: se o `subir.sh` falhar, o piloto volta o código para o
# commit anterior e sobe de novo. Em um minuto o sistema está como estava.
#
# Commit COM migração: ele NÃO volta sozinho, e isso não é timidez. Migração já
# aplicada não se desfaz movendo o código para trás — o banco continua com a
# coluna nova, e o código velho não sabe dela. O que se faz é restaurar o
# backup, e restaurar backup é perder o que entrou no sistema desde ele: uma
# O.S. aberta, uma assinatura coletada. Essa conta quem faz é você, não um
# script rodando às três da manhã.
#
# Por isso, antes de QUALQUER migração, ele tira um dump e confere o dump. Se o
# backup não passar na conferência, a migração não acontece.
# =============================================================================
set -euo pipefail

cd "$(dirname "$0")/.."
RAIZ="$(pwd)"

DIARIO=/var/log/dtechmed-piloto.log
TRAVA=/var/lock/dtechmed-piloto.lock
PAUSA="$RAIZ/.piloto-pausado"
# -----------------------------------------------------------------------------
# DOIS TRAVAMENTOS, PORQUE SÃO DOIS PROBLEMAS DIFERENTES
# -----------------------------------------------------------------------------
# RECUSADO é parada dura: migração que falhou, volta que falhou, alguém editando
# arquivo no servidor. O sistema pode estar num estado que só uma pessoa
# resolve, e subir o commit seguinte por cima pioraria. Só sai com 'voltar'.
#
# COMMIT_RUIM é parada branda, e guarda O SHA que falhou. Um commit quebrado não
# pode ficar sendo tentado de minuto em minuto — mas a CORREÇÃO empurrada por
# cima tem de subir sozinha, senão a mensagem "corrija e empurre por cima" é uma
# instrução que o próprio piloto impede de cumprir. Este arquivo vale para
# aquele commit, e para mais nenhum.
# -----------------------------------------------------------------------------
RECUSADO="$RAIZ/.piloto-recusado"
COMMIT_RUIM="$RAIZ/.piloto-commit-ruim"
DUMPS="$RAIZ/backups-piloto"
INSTALADO=/usr/local/bin/dtechmed-piloto

quando() { date '+%Y-%m-%d %H:%M:%S'; }
diga()   { printf '%s  %s\n' "$(quando)" "$1" | tee -a "$DIARIO"; }
grite()  { printf '%s  !! %s\n' "$(quando)" "$1" | tee -a "$DIARIO" >&2; }

# ---------------------------------------------------------------------------
# Subcomandos — as três palavras que substituem um procedimento
# ---------------------------------------------------------------------------
case "${1:-}" in
  pausar)
    quando > "$PAUSA"
    echo "Piloto PAUSADO. Nada sobe até 'bash infra/piloto.sh voltar'."
    exit 0
    ;;
  voltar)
    rm -f "$PAUSA" "$RECUSADO" "$COMMIT_RUIM"
    echo "Piloto LIBERADO. O próximo commit sobe sozinho (em até 1 minuto)."
    exit 0
    ;;
  log)
    tail -n 60 "$DIARIO" 2>/dev/null || echo "Ainda não há diário."
    exit 0
    ;;
  situacao)
    BRANCH=$(git -C "$RAIZ" rev-parse --abbrev-ref HEAD)
    echo "branch seguido ....... $BRANCH"
    echo "commit no ar ......... $(git -C "$RAIZ" rev-parse --short HEAD) — $(git -C "$RAIZ" log -1 --format=%s | cut -c1-60)"
    if [ -f "$PAUSA" ]; then
      echo "estado ............... PAUSADO desde $(cat "$PAUSA")"
    elif [ -f "$RECUSADO" ]; then
      echo "estado ............... TRAVADO — $(cat "$RECUSADO")"
    elif [ -f "$COMMIT_RUIM" ]; then
      echo "estado ............... ligado, esperando correção — $(cat "$COMMIT_RUIM")"
    else
      echo "estado ............... ligado"
    fi
    if systemctl is-active --quiet dtechmed-piloto.timer 2>/dev/null; then
      echo "timer ................ ativo (confere a cada minuto)"
    else
      echo "timer ................ INATIVO — rode: bash infra/instalar-piloto.sh"
    fi
    exit 0
    ;;
esac

FORCAR=nao
[ "${1:-}" = "agora" ] && FORCAR=sim

# ---------------------------------------------------------------------------
# Uma passada por vez. Duas subindo ao mesmo tempo é o pior jeito de descobrir
# que o Docker não gosta disso.
# ---------------------------------------------------------------------------
mkdir -p "$DUMPS"
exec 9>"$TRAVA"
flock -n 9 || exit 0

touch "$DIARIO" 2>/dev/null || true

[ -f "$PAUSA" ] && exit 0
if [ -f "$RECUSADO" ] && [ "$FORCAR" = "nao" ]; then exit 0; fi

BRANCH=$(git rev-parse --abbrev-ref HEAD)

# ---------------------------------------------------------------------------
# O servidor não é lugar de editar arquivo. Se alguém editou, o piloto para
# ANTES de puxar — `git merge` sobre árvore suja ou some com a edição, ou trava
# no meio. Melhor reclamar do que escolher sozinho.
# ---------------------------------------------------------------------------
SUJO=$(git status --porcelain | grep -v '^?? ' || true)
if [ -n "$SUJO" ]; then
  grite "há edição não commitada no servidor — o piloto não puxa por cima disso:"
  printf '%s\n' "$SUJO" | sed 's/^/                         /' | tee -a "$DIARIO" >&2
  echo "editado no servidor, resolva à mão (git checkout -- <arquivo>)" > "$RECUSADO"
  exit 1
fi

if ! git fetch --quiet origin "$BRANCH" 2>>"$DIARIO"; then
  grite "não consegui falar com o GitHub. Repositório privado sem a chave de leitura?"
  exit 1
fi

DAQUI=$(git rev-parse HEAD)
DELA=$(git rev-parse "origin/$BRANCH")

if [ "$DAQUI" = "$DELA" ] && [ "$FORCAR" = "nao" ]; then
  exit 0
fi

# O commit que já falhou não é tentado de novo. Qualquer OUTRO é — inclusive, e
# principalmente, a correção empurrada por cima dele.
if [ "$FORCAR" = "nao" ] && [ -f "$COMMIT_RUIM" ] && grep -qF "$DELA" "$COMMIT_RUIM"; then
  exit 0
fi
rm -f "$COMMIT_RUIM"

# ---------------------------------------------------------------------------
# Migração nova muda o que está em jogo. Daqui para baixo o caminho é outro.
# ---------------------------------------------------------------------------
MIGRACOES=$(git diff --name-only "$DAQUI" "$DELA" -- prisma/migrations/ | wc -l | tr -d ' ')
ASSUNTO=$(git log -1 --format=%s "$DELA" | cut -c1-72)
DUMP=""

diga "————————————————————————————————————————————————————"
diga "commit novo em $BRANCH: $(git rev-parse --short "$DELA") — $ASSUNTO"
[ "$MIGRACOES" -gt 0 ] && diga "  este commit traz $MIGRACOES arquivo(s) de migração"

if [ "$MIGRACOES" -gt 0 ]; then
  # -------------------------------------------------------------------------
  # BACKUP ANTES, E CONFERIDO. A mesma lógica do run-backup.sh: `pg_dump` pode
  # sair com código zero e deixar arquivo truncado quando o disco enche no
  # meio. Sem o `gzip -t`, o defeito só apareceria na hora de restaurar.
  # -------------------------------------------------------------------------
  CARIMBO=$(date +%Y-%m-%d_%H%M%S)
  DUMP="$DUMPS/antes-da-migracao_${CARIMBO}.sql.gz"
  diga "  tirando backup antes de migrar…"

  USUARIO=$(sed -n 's/^POSTGRES_USER=//p' .env | head -1)
  BANCO=$(sed -n 's/^POSTGRES_DB=//p' .env | head -1)
  USUARIO=${USUARIO:-dtechmed_owner}
  BANCO=${BANCO:-dtechmed}

  if ! docker exec dtechmed_db pg_dump -U "$USUARIO" -d "$BANCO" \
        --format=plain --no-owner --no-privileges 2>>"$DIARIO" | gzip -9 > "$DUMP"; then
    grite "o backup falhou. A migração NÃO vai rodar."
    rm -f "$DUMP"
    echo "backup pré-migração falhou em $(quando)" > "$RECUSADO"
    exit 1
  fi
  if ! gzip -t "$DUMP" 2>/dev/null; then
    grite "o backup saiu corrompido. A migração NÃO vai rodar."
    rm -f "$DUMP"
    echo "backup pré-migração corrompido em $(quando)" > "$RECUSADO"
    exit 1
  fi
  diga "  backup conferido: $DUMP ($(du -h "$DUMP" | cut -f1))"

  # Guarda 30 dumps de migração. São os únicos pontos de volta que existem.
  ls -1t "$DUMPS"/antes-da-migracao_*.sql.gz 2>/dev/null | tail -n +31 | xargs -r rm -f
fi

# ---------------------------------------------------------------------------
# Puxa e sobe. O `subir.sh` é quem confere tudo — inclusive os vizinhos.
# ---------------------------------------------------------------------------
if ! git merge --ff-only "origin/$BRANCH" >>"$DIARIO" 2>&1; then
  grite "o branch divergiu (alguém reescreveu o histórico?). Não puxei nada."
  echo "branch divergiu em $(quando)" > "$RECUSADO"
  exit 1
fi
diga "  código atualizado. Subindo…"

if bash infra/subir.sh >>"$DIARIO" 2>&1; then
  diga "✓ NO AR: $(git rev-parse --short HEAD) — $ASSUNTO"

  # O piloto se atualiza sozinho quando o próprio arquivo muda. Sem isto,
  # melhorar o piloto exigiria lembrar de reinstalá-lo — e ninguém lembra.
  if [ -f "$INSTALADO" ] && ! cmp -s infra/piloto.sh "$INSTALADO"; then
    install -m 755 infra/piloto.sh "$INSTALADO"
    diga "  (o piloto se atualizou)"
  fi
  exit 0
fi

# ---------------------------------------------------------------------------
# Deu errado. Aqui a diferença entre ter e não ter migração vira ação.
# ---------------------------------------------------------------------------
grite "o deploy do commit $(git rev-parse --short "$DELA") FALHOU."

if [ "$MIGRACOES" -gt 0 ]; then
  grite "este commit tinha migração — NÃO vou voltar o código sozinho."
  grite "Migração já aplicada não se desfaz movendo código para trás."
  grite "O backup de antes está em: $DUMP"
  grite "O sistema pode estar fora do ar. Veja: docker logs dtechmed_app --tail 60"
  echo "deploy com migração falhou em $(quando) — commit $(git rev-parse --short "$DELA")" > "$RECUSADO"
  exit 1
fi

grite "sem migração no meio: voltando para $(git rev-parse --short "$DAQUI")…"
git reset --hard "$DAQUI" >>"$DIARIO" 2>&1

if bash infra/subir.sh >>"$DIARIO" 2>&1; then
  diga "✓ voltou ao ar no commit anterior $(git rev-parse --short "$DAQUI")"
  grite "O commit $(git rev-parse --short "$DELA") está TRAVADO — corrija e empurre por cima."
  printf '%s  (commit %s falhou em %s; voltei para %s)\n' \
    "$DELA" "$(git rev-parse --short "$DELA")" "$(quando)" "$(git rev-parse --short "$DAQUI")" > "$COMMIT_RUIM"
  exit 1
fi

grite "A VOLTA TAMBÉM FALHOU. O sistema está fora do ar — isto precisa de você agora."
grite "docker logs dtechmed_app --tail 60"
echo "volta falhou em $(quando) — sistema possivelmente fora do ar" > "$RECUSADO"
exit 1
