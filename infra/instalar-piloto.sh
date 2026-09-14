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
  printf '  \033[31m✗ o servidor NÃO consegue buscar do GitHub.\033[0m\n\n'
  printf '  Se o repositório virou privado, ele precisa da chave de leitura:\n\n'
  printf '    ssh-keygen -t ed25519 -C "vps-dtechmed" -f /root/.ssh/dtechmed -N ""\n'
  printf '    cat /root/.ssh/dtechmed.pub\n\n'
  printf '  Cole a chave em: GitHub → Settings → Deploy keys → Add deploy key\n'
  printf '  (SEM marcar "Allow write access" — o servidor só precisa ler.)\n\n'
  printf '  E depois:\n\n'
  printf '    git remote set-url origin git@github.com:lucasjesus123/DTECH-MED.git\n\n'
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
