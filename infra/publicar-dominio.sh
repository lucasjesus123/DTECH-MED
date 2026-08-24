#!/usr/bin/env bash
# =============================================================================
# DTECH MED — publica os domínios na portaria compartilhada
# =============================================================================
# Uso:  bash infra/publicar-dominio.sh
#
# -----------------------------------------------------------------------------
# POR QUE ESTE PASSO É SCRIPT, E NÃO UMA SEQUÊNCIA DE COMANDOS COLADOS
# -----------------------------------------------------------------------------
# Todo o resto do deploy mexe só na nossa gaveta. Este passo mexe na PORTARIA:
# um Caddy que atende as portas 80 e 443 da máquina inteira e do qual dependem
# outros dois sistemas. Uma configuração que ele não consiga carregar derruba os
# três sites juntos.
#
# Feito à mão, a proteção é a pessoa: ela lê a saída do `validate`, decide se
# está bom, e se algo der errado depois do reload ela precisa lembrar dos
# comandos de desfazer, na ordem certa, com o site fora do ar e o telefone
# tocando. Isso não é proteção, é esperança.
#
# Aqui a proteção é o programa:
#
#   • guarda a configuração atual ANTES de tocar em qualquer coisa
#   • fotografa os vizinhos ANTES, para saber quem já estava de pé
#   • se o `validate` recusar, restaura e sai — a portaria nem chega a reler
#   • depois do reload, confere os vizinhos de novo; se algum caiu, DESFAZ
#     sozinho e recarrega, sem esperar ninguém decidir
#
# O pior caso deixa de ser "três sites fora do ar até alguém acordar" e passa a
# ser "trinta segundos e tudo como estava".
# =============================================================================
set -uo pipefail   # sem -e: o tratamento de erro aqui é explícito, e um `set -e`
                   # abortaria no meio de uma restauração pela metade.

cd "$(dirname "$0")/.."

PORTARIA="${PORTARIA:-portal-da-estetica-web-1}"
NOSSO="/data/sites-extra/dtechmed.caddy"
GUARDADO="/data/sites-extra/.dtechmed.caddy.anterior"
# Lista de RESERVA, usada só quando não dá para ler a configuração da portaria.
# O caminho normal descobre os nomes lá embaixo, direto do Caddyfile — é por
# isso que o `stabilize.online`, que apareceu na máquina depois deste guia ser
# escrito, já vinha sendo vigiado sem ninguém acrescentá-lo aqui. Ainda assim a
# reserva é mantida em dia: ela é o que resta no dia em que o `docker exec`
# falhar, e uma reserva desatualizada deixa de vigiar exatamente quem ela
# deveria proteger.
VIZINHOS=("minhamecanica.online" "portaldaestetica.com.br" "stabilize.online")

verde()  { printf '  \033[32m✓\033[0m %s\n' "$1"; }
alerta() { printf '  \033[33m!\033[0m %s\n' "$1"; }
morre()  { printf '\n  \033[31m✗ %s\033[0m\n\n' "$1" >&2; exit 1; }
titulo() { printf '\n\033[1m%s\033[0m\n' "$1"; }

# Devolve o código HTTP, ou 000 quando não houve resposta nenhuma.
#
# O `|| echo 000` que estava aqui produzia "000000": quando o endereço não
# responde, o curl imprime "000" E sai com código de erro, então o `echo`
# acrescentava outro. Número inventado num relatório de saúde é pior que
# número ausente, porque parece um código de verdade.
codigo() {
  local c
  c=$(curl -s -o /dev/null -w '%{http_code}' --max-time 12 "$1" 2>/dev/null)
  [ -n "$c" ] || c=000
  printf '%s' "$c"
}

# O nome resolve para algum IP? É a primeira pergunta quando um endereço não
# responde, e a resposta separa "DNS ainda não propagou" de "a portaria não
# conhece o nome" — dois problemas com donos diferentes.
resolve() {
  getent ahostsv4 "$1" 2>/dev/null | awk 'NR==1{print $1}'
}

# ---------------------------------------------------------------------------
# Desfazer à mão, depois do fato.
# ---------------------------------------------------------------------------
# O script desfaz sozinho quando um vizinho cai. Este caminho é para o outro
# caso: tudo validou, ninguém caiu, e mesmo assim se decidiu voltar atrás.
if [ "${1:-}" = "--desfazer" ]; then
  titulo "Voltando a portaria ao estado anterior"
  if docker exec "$PORTARIA" test -f "$GUARDADO" 2>/dev/null; then
    docker exec "$PORTARIA" cp "$GUARDADO" "$NOSSO" || morre "não consegui restaurar."
    verde "configuração anterior restaurada"
  else
    docker exec "$PORTARIA" rm -f "$NOSSO" >/dev/null 2>&1
    alerta "não havia cópia guardada — removi o nosso bloco da portaria"
  fi
  docker exec "$PORTARIA" caddy validate --config /etc/caddy/Caddyfile 2>&1 | tail -3 | sed 's/^/      /'
  docker kill -s USR1 "$PORTARIA" >/dev/null 2>&1
  sleep 6
  for V in "${VIZINHOS[@]}"; do printf '      %-28s %s\n' "$V" "$(codigo "https://$V")"; done
  exit 0
fi

# ---------------------------------------------------------------------------
titulo "1. A nossa gaveta está pronta?"
# ---------------------------------------------------------------------------
# A portaria só deve aprender o nome novo depois que existe alguém atrás dela
# para atender. Publicar antes é trocar "site antigo" por "502".
[ -f .env ] || morre ".env não existe. Rode antes: bash infra/virar-dominio.sh"

URL_PUBLICA=$(grep -E '^APP_URL=' .env | head -1 | cut -d= -f2- | tr -d '"')
DOMINIO=${URL_PUBLICA#https://}
DOMINIO=${DOMINIO#http://}
DOMINIO=${DOMINIO%%/*}
[ -n "$DOMINIO" ] || morre "não consegui ler o APP_URL do .env."
verde "domínio principal: $DOMINIO"

C=$(codigo "http://172.17.0.1:5400/api/health")
[ "$C" = "200" ] || morre "a aplicação não responde em 172.17.0.1:5400 (deu $C). É por aqui que a portaria entra. Rode antes: bash infra/subir.sh"
verde "a aplicação responde no endereço por onde a portaria vai entrar"

# A conferência que impede o Google de ser mandado para o endereço velho.
for ARQUIVO in robots.txt sitemap.xml; do
  CORPO=$(curl -s --max-time 12 "http://127.0.0.1:5400/${ARQUIVO}" 2>/dev/null || true)
  printf '%s' "$CORPO" | grep -qF "$URL_PUBLICA" \
    || morre "/$ARQUIVO ainda não declara $URL_PUBLICA. O .env foi trocado mas a imagem não foi reconstruída — rode: bash infra/subir.sh"
done
verde "robots.txt e sitemap.xml declaram $URL_PUBLICA"

# ---------------------------------------------------------------------------
titulo "2. O arquivo da portaria está limpo?"
# ---------------------------------------------------------------------------
[ -f infra/caddy/dtechmed.caddy ] || morre "infra/caddy/dtechmed.caddy não existe. Rode antes: git pull"

# Colchete fora de comentário é a assinatura do texto que passou por um cliente
# que transforma "www." em link. É sintaxe inválida do Caddy, e o Caddy aqui
# atende a máquina inteira.
SUJEIRA=$(grep -v '^[[:space:]]*#' infra/caddy/dtechmed.caddy | grep -c '\[')
[ "$SUJEIRA" = "0" ] || morre "o arquivo tem $SUJEIRA linha(s) com colchete fora de comentário — ele passou por algum lugar que transformou nome em link. Refaça com: git checkout -- infra/caddy/dtechmed.caddy"
verde "nenhum colchete fora dos comentários"

docker ps --format '{{.Names}}' | grep -qx "$PORTARIA" \
  || morre "o contêiner da portaria ('$PORTARIA') não está rodando. Confira o nome com: docker ps"
verde "portaria encontrada: $PORTARIA"

# Os nomes que um arquivo de configuração atende, lidos das linhas de abertura de
# bloco: sem indentação, sem comentário, terminando em `{`.
#
# Ler do arquivo, e não de uma lista repetida no script, é o que impede este
# relatório de mentir no dia em que alguém acrescentar um domínio lá e esquecer
# daqui.
nomes_de_bloco() {
  awk '/^[^#[:space:]{].*\{[[:space:]]*$/ { sub(/[[:space:]]*\{[[:space:]]*$/, ""); gsub(/,/, " "); print }' \
    | tr ' ' '\n' | sed 's#^https\?://##' | grep '\.' | sort -u
}

CABECALHOS=$(nomes_de_bloco < infra/caddy/dtechmed.caddy)
verde "o nosso bloco atende: $(printf '%s' "$CABECALHOS" | tr '\n' ' ')"

# O domínio do .env precisa estar entre eles. Sem isso, a portaria vai atender
# um nome e a aplicação vai declarar outro ao Google — os dois funcionando, e
# nenhum sinal de que discordam.
#
# A conferência anterior procurava a linha "dtechmed.com.br," COM a vírgula, o
# que só valia enquanto o bloco tinha mais de um nome. No dia em que o endereço
# de ensaio saiu e o nome ficou sozinho na linha, ela passou a acusar problema
# numa configuração correta. Aviso que dispara no caso certo é pior que aviso
# nenhum: ensina a ignorar todos os outros.
printf '%s\n' "$CABECALHOS" | grep -qxF "$DOMINIO" \
  || alerta "o APP_URL aponta para '$DOMINIO', que não está entre os nomes do arquivo do Caddy. Siga só se souber o motivo."

# Os nomes que o arquivo JÁ INSTALADO atende — que podem não ser os mesmos.
#
# Isto não é redundância. Esta execução pode estar justamente REMOVENDO um nome:
# foi o que aconteceu quando o domínio .com saiu. Sem esta leitura, um nome que
# está no ar hoje pelo arquivo antigo e sai no arquivo novo seria contado como
# vizinho, apareceria de pé na fotografia do "antes", cairia depois da recarga —
# e o desfazer automático reverteria uma mudança CORRETA, concluindo que tinha
# derrubado o site de outra pessoa.
#
# Um mecanismo de desfazer que dispara sozinho precisa errar para o lado de não
# disparar. Um rollback automático em falso é pior que rollback nenhum, porque
# desfaz sem ninguém pedir e ainda ensina a duvidar do alarme.
NOSSOS_INSTALADOS=$(docker exec "$PORTARIA" cat "$NOSSO" 2>/dev/null | nomes_de_bloco)
NOSSOS=$(printf '%s\n%s\n' "$CABECALHOS" "$NOSSOS_INSTALADOS" | grep . | sort -u)

# ---------------------------------------------------------------------------
titulo "3. Fotografia dos vizinhos, antes de tocar em nada"
# ---------------------------------------------------------------------------
# Os nomes dos vizinhos são LIDOS da configuração da própria portaria, e não de
# uma lista escrita aqui.
#
# A lista escrita à mão parece mais simples e mente calada: um nome errado nela
# aparece como vizinho fora do ar (e a gente aprende a ignorar), e um vizinho
# novo que ninguém acrescentou aqui simplesmente não é vigiado. Lido da
# configuração, o conjunto é exatamente quem a portaria atende hoje.
DESCOBERTOS=$(docker exec "$PORTARIA" sh -c \
  'cat /etc/caddy/Caddyfile /data/sites-extra/*.caddy 2>/dev/null' 2>/dev/null \
  | nomes_de_bloco | grep -vxF "$NOSSOS")

if [ -n "$DESCOBERTOS" ]; then
  read -r -a VIZINHOS <<< "$(printf '%s ' $DESCOBERTOS)"
  verde "$(printf '%s\n' $DESCOBERTOS | grep -c .) nome(s) de vizinho lidos da configuração da portaria"
else
  alerta "não consegui ler os nomes da portaria — usando a lista de reserva"
fi

declare -A ANTES
for V in "${VIZINHOS[@]}"; do
  ANTES[$V]=$(codigo "https://$V")
  printf '      %-32s %s\n' "$V" "${ANTES[$V]}"
done

# Vizinho que JÁ estava fora do ar não pode ser confundido com estrago nosso —
# nem servir de desculpa para um estrago nosso. Por isso a comparação é entre
# antes e depois, e não contra o número 200.
verde "estado dos vizinhos registrado"

# ---------------------------------------------------------------------------
titulo "4. Guardando a configuração atual"
# ---------------------------------------------------------------------------
TINHA=nao
if docker exec "$PORTARIA" test -f "$NOSSO" 2>/dev/null; then
  docker exec "$PORTARIA" cp "$NOSSO" "$GUARDADO" \
    || morre "não consegui guardar a configuração atual. Não vou seguir sem rede de proteção."
  TINHA=sim
  verde "configuração anterior guardada dentro da portaria"
else
  alerta "não havia bloco nosso na portaria — se algo falhar, o desfazer é remover o arquivo"
fi

# Restaura exatamente o estado anterior e manda a portaria reler.
desfazer() {
  printf '\n  \033[33m→ desfazendo\033[0m\n'
  if [ "$TINHA" = "sim" ]; then
    docker exec "$PORTARIA" cp "$GUARDADO" "$NOSSO" >/dev/null 2>&1
  else
    docker exec "$PORTARIA" rm -f "$NOSSO" >/dev/null 2>&1
  fi
  docker exec "$PORTARIA" caddy validate --config /etc/caddy/Caddyfile >/dev/null 2>&1 \
    && verde "configuração restaurada e válida" \
    || alerta "a restauração não validou — ME CHAME AGORA, não tente mais nada"
  docker kill -s USR1 "$PORTARIA" >/dev/null 2>&1
  sleep 5
}

# ---------------------------------------------------------------------------
titulo "5. Instalando e validando (a portaria ainda não releu)"
# ---------------------------------------------------------------------------
docker cp infra/caddy/dtechmed.caddy "$PORTARIA:$NOSSO" >/dev/null \
  || morre "não consegui copiar o arquivo para a portaria."
verde "arquivo instalado"

SAIDA=$(docker exec "$PORTARIA" caddy validate --config /etc/caddy/Caddyfile 2>&1)
if ! printf '%s' "$SAIDA" | grep -q 'Valid configuration'; then
  printf '\n%s\n' "$SAIDA" | tail -20 | sed 's/^/      /'
  desfazer
  morre "o Caddy recusou a configuração. Nada foi recarregado — os três sites seguem exatamente como estavam."
fi
verde "Valid configuration"

# ---------------------------------------------------------------------------
titulo "6. A portaria relê (sem derrubar conexão)"
# ---------------------------------------------------------------------------
# USR1 é o sinal de recarregar. Não derruba uma conexão sequer, e não depende da
# API de administração — que neste Caddy está desligada com `admin off`.
docker kill -s USR1 "$PORTARIA" >/dev/null 2>&1 || morre "não consegui enviar o sinal de recarga."
verde "sinal enviado"

# ---------------------------------------------------------------------------
titulo "7. Os vizinhos continuam de pé?"
# ---------------------------------------------------------------------------
# Esta conferência vem ANTES da nossa, de propósito. Se estragamos algo, é neles
# que precisamos saber primeiro.
sleep 6
QUEBROU=""
for V in "${VIZINHOS[@]}"; do
  D=$(codigo "https://$V")
  if [ "${ANTES[$V]}" != "000" ] && [ "$D" = "000" ]; then
    QUEBROU="$QUEBROU $V"
    printf '      %-32s %s → %s  \033[31mCAIU\033[0m\n' "$V" "${ANTES[$V]}" "$D"
  elif [ "$D" = "000" ]; then
    # Já estava assim antes de encostarmos. Não é estrago nosso, e também não é
    # motivo para ficar quieto: pode ser um vizinho fora do ar de verdade.
    printf '      %-32s %s → %s  (já estava assim antes)\n' "$V" "${ANTES[$V]}" "$D"
  else
    printf '      %-32s %s → %s\n' "$V" "${ANTES[$V]}" "$D"
  fi
done

if [ -n "$QUEBROU" ]; then
  desfazer
  morre "vizinho(s) fora do ar após a recarga:$QUEBROU. Já desfiz e recarreguei. Confira agora e me chame."
fi
verde "nenhum vizinho caiu"

# ---------------------------------------------------------------------------
titulo "8. O nosso domínio subiu?"
# ---------------------------------------------------------------------------
# O certificado da Let's Encrypt é emitido na primeira visita e leva alguns
# segundos. Por isso a espera é um laço, e não um `sleep` chutado.
printf '  aguardando o certificado'
NOSSO_OK=nao
for _ in $(seq 1 30); do
  C=$(codigo "https://$DOMINIO")
  if [ "$C" = "200" ]; then NOSSO_OK=sim; break; fi
  printf '.'; sleep 4
done
printf '\n'

if [ "$NOSSO_OK" != "sim" ]; then
  alerta "https://$DOMINIO ainda não respondeu 200 (último código: ${C:-000})."
  alerta "Os vizinhos estão de pé e a configuração é válida, então NÃO vou desfazer sozinho."
  alerta "Quase sempre é o certificado ainda saindo. Espere 2 minutos e rode: curl -sI https://$DOMINIO | head -1"
  alerta "Se continuar, para desfazer: bash infra/publicar-dominio.sh --desfazer"
  exit 2
fi
verde "https://$DOMINIO → 200"

EMISSOR=$(echo | openssl s_client -connect "$DOMINIO:443" -servername "$DOMINIO" 2>/dev/null | openssl x509 -noout -issuer 2>/dev/null)
case "$EMISSOR" in
  *"Let's Encrypt"*) verde "certificado público emitido (Let's Encrypt)" ;;
  *) alerta "certificado ainda não é o público: ${EMISSOR:-desconhecido}. Espere e confira de novo." ;;
esac

# ---------------------------------------------------------------------------
titulo "9. E os endereços que só apontam o caminho?"
# ---------------------------------------------------------------------------
# O caminho e a busca precisam atravessar inteiros. É o que garante que um link
# de ordem de serviço mandado por WhatsApp abra a ordem, e não a home — o token
# vive na URL, e perder a URL é perder o acesso.
MUDOS=""
for OUTRO in $CABECALHOS; do
  [ "$OUTRO" != "$DOMINIO" ] || continue
  COD=$(codigo "https://$OUTRO")
  DESTINO=$(curl -sI --max-time 12 "https://$OUTRO/os/teste?x=1" 2>/dev/null | grep -i '^location:' | tr -d '\r' | awk '{print $2}')

  if [ "$COD" = "000" ]; then
    # Sem resposta NÃO é "atende direto". Chamar as duas coisas pelo mesmo nome
    # foi um defeito real deste relatório: um endereço que não subiu aparecia
    # com uma legenda tranquilizadora ao lado.
    IP=$(resolve "$OUTRO")
    if [ -z "$IP" ]; then
      printf '      %-32s sem resposta  \033[33mo nome não resolve — falta o registro A no painel do domínio\033[0m\n' "$OUTRO"
    else
      printf '      %-32s sem resposta  \033[33maponta para %s — DNS ainda propagando, ou o certificado saindo\033[0m\n' "$OUTRO" "$IP"
    fi
    MUDOS="$MUDOS $OUTRO"
  elif [ -n "$DESTINO" ]; then
    printf '      %-32s %s → %s\n' "$OUTRO" "$COD" "$DESTINO"
  else
    printf '      %-32s %s (atende direto)\n' "$OUTRO" "$COD"
  fi
done

if [ -n "$MUDOS" ]; then
  alerta "endereço(s) ainda sem resposta:$MUDOS"
  alerta "o site principal está no ar; estes são os que faltam. Confira o DNS deles e rode este script de novo."
fi

# ---------------------------------------------------------------------------
titulo "Pronto"
# ---------------------------------------------------------------------------
cat <<FIM

  https://$DOMINIO está no ar, os vizinhos não foram tocados e a configuração
  anterior segue guardada dentro da portaria, em $GUARDADO.

  Falta o que só se faz fora do servidor:
    1. Search Console: cadastrar o domínio e enviar o sitemap.xml
    2. Google Meu Negócio: trocar o site do perfil para $URL_PUBLICA
  O passo 14.6 do DEPLOY.md tem o roteiro.

FIM
