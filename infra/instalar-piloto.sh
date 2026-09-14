#!/usr/bin/env bash
# =============================================================================
# Instala o piloto automático. Roda UMA vez, no servidor.
# =============================================================================
# Uso:  bash infra/instalar-piloto.sh
#
# Depois disto, todo commit empurrado para o branch que esta gaveta segue entra
# no ar sozinho, em até um minuto, pelo mesmo `subir.sh` de sempre.
#
# -----------------------------------------------------------------------------
# POR QUE ELE CONFERE ANTES DE INSTALAR
# -----------------------------------------------------------------------------
# Um piloto automático que não consegue falar com o GitHub não avisa nada: ele
# simplesmente nunca sobe nada, e você descobre daqui a uma semana, quando
# perguntar por que a correção de terça não apareceu. O silêncio é o pior
# defeito possível numa automação.
#
# Então a instalação falha ALTO se o `git fetch` não funcionar — que é
# exatamente o que acontece quando o repositório vira privado e a chave de
# leitura ainda não foi posta.
# =============================================================================
set -euo pipefail

cd "$(dirname "$0")/.."
RAIZ="$(pwd)"

verde() { printf '  \033[32m✓\033[0m %s\n' "$1"; }
morre() { printf '\n  \033[31m✗ %s\033[0m\n\n' "$1" >&2; exit 1; }
titulo(){ printf '\n\033[1m%s\033[0m\n' "$1"; }

[ "$(id -u)" = "0" ] || morre "rode como root (o timer do systemd é do sistema)."

titulo "1. A gaveta está inteira?"
[ -f infra/subir.sh ]  || morre "não achei infra/subir.sh. Você está em /opt/gavetas/DTECHMED?"
[ -f infra/piloto.sh ] || morre "não achei infra/piloto.sh. Falta um 'git pull'."
[ -f .env ]            || morre "não achei o .env. Rode o deploy à mão uma vez antes."
verde "subir.sh, piloto.sh e .env no lugar"

command -v systemctl >/dev/null || morre "esta máquina não usa systemd. Me chame — dá para fazer por cron."
verde "systemd disponível"

titulo "2. O servidor consegue ler o repositório?"
BRANCH=$(git rev-parse --abbrev-ref HEAD)
REMOTO=$(git remote get-url origin)
echo "     branch .... $BRANCH"
echo "     origem .... $REMOTO"

if ! git fetch --quiet origin "$BRANCH" 2>/dev/null; then
  printf '\n'
  printf '  \033[31m✗ o servidor NÃO consegue buscar do GitHub.\033[0m\n'

  # -------------------------------------------------------------------------
  # ANTES DE CULPAR A CHAVE, OLHE O ssh_config.
  #
  # A primeira versão daqui dizia direto "a chave não foi posta", e estava
  # errada no caso real que aconteceu: a chave ESTAVA posta e autorizada. O que
  # atrapalhava era o `~/.ssh/config` ter DOIS blocos `Host github.com` — um de
  # outro projeto na mesma VPS, e o nosso acrescentado no fim.
  #
  # No SSH, para cada parâmetro vale o PRIMEIRO valor encontrado. Então o bloco
  # de cima vencia, a chave do outro projeto era usada, e o GitHub respondia
  # "Repository not found" — que é como ele diz "sem acesso" sem confirmar que o
  # repositório existe.
  #
  # Enquanto o repositório era público isso nem aparecia: repositório público é
  # legível por QUALQUER chave autenticada. O defeito só se revelou no dia em
  # que ele foi fechado, que é o pior dia possível para descobrir.
  #
  # Uma VPS compartilhada tende a ter vários projetos e várias chaves. Então
  # esta conferência não é caso de canto: é o caso comum.
  # -------------------------------------------------------------------------
  HOSPEDEIRO=$(git remote get-url origin | sed -n 's/^git@\([^:]*\):.*/\1/p')
  CONFIG="$HOME/.ssh/config"

  if [ -n "$HOSPEDEIRO" ]; then
    printf '\n  Diagnóstico:\n'
    QUANTOS=0
    [ -f "$CONFIG" ] && QUANTOS=$(grep -ciE "^[[:space:]]*Host[[:space:]]+${HOSPEDEIRO}([[:space:]]|$)" "$CONFIG" || true)

    if [ "$QUANTOS" -gt 1 ]; then
      printf '    \033[31m· há %s blocos "Host %s" em %s.\033[0m\n' "$QUANTOS" "$HOSPEDEIRO" "$CONFIG"
      printf '      O SSH usa o PRIMEIRO, e os de baixo nunca são lidos. É quase\n'
      printf '      certo que seja isto. Dê um apelido próprio a esta gaveta:\n\n'
      printf '        Host github-dtechmed\n'
      printf '          HostName github.com\n'
      printf '          User git\n'
      printf '          IdentityFile /root/.ssh/dtechmed\n'
      printf '          IdentitiesOnly yes\n\n'
      printf '        git remote set-url origin git@github-dtechmed:%s\n\n' "$(git remote get-url origin | sed 's/^git@[^:]*://')"
    else
      RESPOSTA=$(ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new -T "git@${HOSPEDEIRO}" 2>&1 | head -1)
      printf '    · o GitHub responde a esta chave: %s\n' "${RESPOSTA:-(silêncio)}"
      case "$RESPOSTA" in
        *"$(basename "$(git remote get-url origin)" .git)"*)
          printf '      A chave é a certa. Então o problema é o branch ou a permissão\n'
          printf '      dela — confira se a chave de deploy não foi removida.\n' ;;
        Hi*)
          printf '      \033[31mEsta chave pertence a OUTRO repositório.\033[0m Ponha a chave\n'
          printf '      desta gaveta nos Deploy keys do repositório certo.\n' ;;
        *)
          printf '      O GitHub não reconheceu a chave. Ela precisa ser cadastrada:\n'
          printf '        ssh-keygen -t ed25519 -C "vps-dtechmed" -f /root/.ssh/dtechmed -N ""\n'
          printf '        cat /root/.ssh/dtechmed.pub\n'
          printf '      Cole em: GitHub → o repositório → Settings → Deploy keys →\n'
          printf '      Add deploy key (SEM marcar "Allow write access").\n' ;;
      esac
      printf '\n'
    fi
  fi
  exit 1
fi
verde "git fetch funciona — o piloto vai conseguir ver os commits novos"

titulo "3. Instalando"
install -m 755 infra/piloto.sh /usr/local/bin/dtechmed-piloto
verde "/usr/local/bin/dtechmed-piloto"

# -----------------------------------------------------------------------------
# O serviço aponta para a CÓPIA em /usr/local/bin, e não para o arquivo dentro
# do repositório. Motivo concreto: o `git merge` do próprio piloto troca os
# arquivos da gaveta enquanto ele está rodando, e o bash lê o script aos
# pedaços — trocar o arquivo no meio da execução faz o shell continuar lendo de
# um deslocamento que agora é outra linha. O piloto se recopia sozinho ao fim
# de um deploy bem-sucedido (ver o fim do piloto.sh).
# -----------------------------------------------------------------------------
cat > /etc/systemd/system/dtechmed-piloto.service <<UNIDADE
[Unit]
Description=DTECH MED — piloto automático de deploy
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
WorkingDirectory=$RAIZ
# A raiz vai DECLARADA, e não deduzida do caminho do executável. A cópia mora
# em /usr/local/bin, então `dirname \$0/..` daria /usr/local — foi assim que a
# primeira versão morria com "not a git repository" toda vez, em silêncio.
Environment=DTECHMED_RAIZ=$RAIZ
ExecStart=/usr/local/bin/dtechmed-piloto
# Uma passada não pode durar para sempre: build travado seguraria a trava e
# nenhum commit subiria mais, em silêncio.
TimeoutStartSec=1800
UNIDADE
verde "dtechmed-piloto.service"

cat > /etc/systemd/system/dtechmed-piloto.timer <<UNIDADE
[Unit]
Description=Confere a cada minuto se há commit novo para subir

[Timer]
OnBootSec=2min
OnUnitActiveSec=1min
# Sem isto, um deploy demorado empilharia passadas atrasadas para rodar todas
# de uma vez assim que ele terminasse.
AccuracySec=15s
Persistent=false

[Install]
WantedBy=timers.target
UNIDADE
verde "dtechmed-piloto.timer"

touch /var/log/dtechmed-piloto.log
cat > /etc/logrotate.d/dtechmed-piloto <<ROTACAO
/var/log/dtechmed-piloto.log {
  weekly
  rotate 8
  compress
  missingok
  notifempty
  copytruncate
}
ROTACAO
verde "diário em /var/log/dtechmed-piloto.log (rotaciona sozinho)"

systemctl daemon-reload
systemctl enable --now dtechmed-piloto.timer >/dev/null 2>&1
verde "timer ligado"

# ---------------------------------------------------------------------------
# E AGORA RODA UMA VEZ, PELO MESMO CAMINHO QUE O SYSTEMD USA.
#
# Sem isto, a instalação termina dizendo "pronto" sem nunca ter executado o
# piloto do jeito que ele vai ser executado de verdade. Foi exatamente assim
# que um defeito passou: tudo verde na instalação, e a cópia em /usr/local/bin
# morrendo em silêncio a cada minuto porque procurava a gaveta no lugar errado.
# ---------------------------------------------------------------------------
titulo "4. A cópia instalada roda mesmo?"
if DTECHMED_RAIZ="$RAIZ" /usr/local/bin/dtechmed-piloto situacao >/tmp/piloto-prova.txt 2>&1; then
  sed 's/^/     /' /tmp/piloto-prova.txt
  verde "a cópia de /usr/local/bin enxerga a gaveta e responde"
  rm -f /tmp/piloto-prova.txt
else
  sed 's/^/     /' /tmp/piloto-prova.txt
  rm -f /tmp/piloto-prova.txt
  morre "a cópia instalada NÃO roda. O piloto não vai subir nada — não confie nele assim."
fi

titulo "Pronto"
cat <<FIM

  A partir de agora, todo commit empurrado para
    $BRANCH
  entra no ar sozinho, em até um minuto.

  Para acompanhar:

    bash infra/piloto.sh situacao    # ligado? em que commit está no ar?
    bash infra/piloto.sh log         # o diário
    bash infra/piloto.sh pausar      # trava tudo (véspera de feriado, etc.)
    bash infra/piloto.sh voltar      # destrava
    bash infra/piloto.sh agora       # força uma passada, sem esperar o minuto

FIM
