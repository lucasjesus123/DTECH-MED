#!/usr/bin/env bash
# =============================================================================
# DTECH MED — sobe a gaveta inteira, conferindo cada etapa
# =============================================================================
# Uso:  bash infra/subir.sh
#
# Faz o que dez comandos soltos faziam, mas com três diferenças que importam:
#
#   1. Confere ANTES. Se faltar algo no .env, se uma porta estiver ocupada, se
#      o Docker não estiver de pé — ele para aí, sem ter construído nada.
#   2. Confere DEPOIS de cada etapa, e para na primeira que falhar. Migrar
#      contra um banco que nasceu torto é o tipo de erro que só aparece três
#      dias depois, num lugar que não tem nada a ver.
#   3. Fotografa os vizinhos no começo e no fim, e compara. Esta VPS hospeda
#      outros três sistemas; a promessa de não encostar neles vira uma linha
#      de saída que você lê, não uma afirmação minha.
#
# É seguro rodar de novo. Nenhuma etapa apaga dado: as migrações só aplicam o
# que falta e a semeadura não recria um Super Admin que já exista.
# =============================================================================
set -euo pipefail

cd "$(dirname "$0")/.."
RAIZ="$(pwd)"
PROJETO=dtechmed

verde()   { printf '  \033[32m✓\033[0m %s\n' "$1"; }
alerta()  { printf '  \033[33m!\033[0m %s\n' "$1"; }
morre()   { printf '\n  \033[31m✗ %s\033[0m\n\n' "$1" >&2; exit 1; }
titulo()  { printf '\n\033[1m%s\033[0m\n' "$1"; }

compose() { docker compose -p "$PROJETO" "$@"; }

# ---------------------------------------------------------------------------
titulo "1. Antes de mexer em nada"
# ---------------------------------------------------------------------------
[ -f docker-compose.yml ] || morre "docker-compose.yml não está em $RAIZ. Rode de dentro da gaveta."
command -v docker >/dev/null || morre "docker não encontrado."
docker info >/dev/null 2>&1 || morre "o serviço do Docker não está respondendo."
verde "Docker respondendo, e estamos em $RAIZ"

[ -f .env ] || morre ".env não existe. Rode antes: bash infra/gerar-env.sh SEU_DOMINIO"

PERM=$(stat -c '%a' .env)
if [ "$PERM" = "600" ]; then
  verde ".env existe e só o dono lê"
else
  alerta ".env está com permissão $PERM (o certo é 600). Corrija com: chmod 600 .env"
fi

# Variáveis sem as quais nada funciona. O `.env` do gerar-env.sh já traz todas.
FALTANDO=""
for V in POSTGRES_DB POSTGRES_USER POSTGRES_PASSWORD APP_DB_PASSWORD \
         DATABASE_URL DIRECT_DATABASE_URL SESSION_SECRET ENCRYPTION_KEY \
         DOCUMENT_HASH_SALT APP_URL ALLOWED_ORIGINS; do
  grep -qE "^${V}=.+" .env || FALTANDO="$FALTANDO $V"
done
[ -z "$FALTANDO" ] || morre "faltam valores no .env:$FALTANDO"
verde "as 11 variáveis obrigatórias estão preenchidas"

for V in UAZAPI_ADMIN_TOKEN SEED_SUPERADMIN_EMAIL SEED_SUPERADMIN_PASSWORD; do
  grep -qE "^${V}=.+" .env || alerta "$V está vazio (o sistema sobe assim; veja o resumo no fim)"
done

# APP_URL não é só configuração: é o domínio que o site declara ao Google como
# o endereço verdadeiro dele (a URL canônica), e é a base de toda imagem de
# compartilhamento. Apontado para o domínio errado, o Google consolida a
# reputação no endereço errado e o link colado no WhatsApp sai sem imagem —
# duas coisas que não dão erro em lugar nenhum e demoram semanas para reverter.
#
# Por isso ele é IMPRESSO, e não só conferido: na troca de domínio, é aqui que
# se percebe que ele ficou para trás.
URL_PUBLICA=$(grep -E '^APP_URL=' .env | head -1 | cut -d= -f2- | tr -d '"')
case "$URL_PUBLICA" in
  https://*) verde "domínio público (APP_URL): $URL_PUBLICA" ;;
  *) alerta "APP_URL=$URL_PUBLICA — sem https. O Google vai indexar por este endereço." ;;
esac

# ---------------------------------------------------------------------------
titulo "2. Fotografia dos vizinhos"
# ---------------------------------------------------------------------------
VIZINHOS_ANTES=$(docker ps --format '{{.Names}}\t{{.Status}}' | grep -v '^dtechmed' | sort || true)
QUANTOS=$(printf '%s\n' "$VIZINHOS_ANTES" | grep -c . || true)
verde "$QUANTOS contêineres de outras gavetas rodando agora"
printf '%s\n' "$VIZINHOS_ANTES" | sed 's/^/      /'

# Portas nossas: livres, ou já nossas. Ocupadas por outro é motivo de parar.
for PORTA in 5400 5433; do
  DONO=$(docker ps --format '{{.Names}} {{.Ports}}' | grep ":${PORTA}->" | awk '{print $1}' || true)
  if [ -n "$DONO" ] && ! printf '%s' "$DONO" | grep -q '^dtechmed'; then
    morre "a porta $PORTA está com o contêiner '$DONO', que não é nosso. Pare aqui."
  fi
done
verde "portas 5400 e 5433 livres ou já nossas"

# ---------------------------------------------------------------------------
titulo "3. Construindo e subindo a gaveta"
# ---------------------------------------------------------------------------
compose up -d --build
verde "compose subiu"

printf '  aguardando o banco ficar saudável'
SAUDAVEL=nao
for _ in $(seq 1 60); do
  ESTADO=$(docker inspect -f '{{.State.Health.Status}}' dtechmed_db 2>/dev/null || echo indefinido)
  if [ "$ESTADO" = "healthy" ]; then SAUDAVEL=sim; break; fi
  printf '.'; sleep 2
done
printf '\n'
[ "$SAUDAVEL" = "sim" ] || morre "o banco não ficou saudável em 2 minutos. Veja: docker logs dtechmed_db --tail 40"
verde "dtechmed_db saudável"

# ---------------------------------------------------------------------------
titulo "4. O papel da aplicação"
# ---------------------------------------------------------------------------
# Este bloco é o coração do isolamento entre franquias. Se `rolbypassrls` for
# `t`, o RLS vira decoração: a aplicação passa por cima de todas as políticas
# e uma empresa enxerga os dados da outra. Por isso é conferido antes de
# qualquer tabela existir.
USUARIO=$(grep -E '^POSTGRES_USER=' .env | cut -d= -f2-)
BANCO=$(grep -E '^POSTGRES_DB=' .env | cut -d= -f2-)
# Cada atributo vira uma letra, ou um traço quando ausente:
#   s = superusuário   b = ignora RLS   c = pode criar banco
# O que a aplicação precisa ser é `---`, os três ausentes.
#
# Escrito com CASE, e não com `::text`, por um motivo prosaico: `booleano::text`
# no Postgres devolve "true"/"false" por extenso, não "t"/"f". Comparar com o
# formato errado abortaria o deploy com alarme falso.
PAPEIS=$(docker exec dtechmed_db psql -U "$USUARIO" -d "$BANCO" -tAc \
  "SELECT rolname||':'
       || CASE WHEN rolsuper     THEN 's' ELSE '-' END
       || CASE WHEN rolbypassrls THEN 'b' ELSE '-' END
       || CASE WHEN rolcreatedb  THEN 'c' ELSE '-' END
     FROM pg_roles WHERE rolname LIKE 'dtechmed%' ORDER BY 1" | tr -d ' ')

printf '%s\n' "$PAPEIS" | grep -q '^dtechmed_app:---$' \
  || morre "o papel dtechmed_app não nasceu correto. Encontrado: $(printf '%s' "$PAPEIS" | tr '\n' ' ')"
verde "dtechmed_app: sem superusuário, sem BYPASSRLS, sem criar banco"

if printf '%s\n' "$PAPEIS" | grep -q '^dtechmed_owner:.*c$'; then
  alerta "dtechmed_owner ainda pode criar bancos (SEC-007 da auditoria)"
else
  verde "dtechmed_owner sem CREATEDB"
fi

# ---------------------------------------------------------------------------
titulo "5. Migrações"
# ---------------------------------------------------------------------------
# Delegado ao `infra/migrador.sh`, e não escrito aqui, porque o defeito que
# esta etapa já teve não era deste arquivo: era do comando manual.
#
# O `up -d --build` acima não constrói o migrador — ele tem
# `profiles: ["manutencao"]`, e serviço com perfil fica de fora do `up`. O
# Compose constrói a imagem dele na primeira execução e nunca mais. Aqui isso
# foi corrigido no dia; o que continuou solto foi o `docker compose run --rm
# migrador` digitado à mão no terminal, que carrega o mesmo defeito e apareceu
# de novo uma semana depois, no cenário de demonstração.
#
# Ter dois lugares que precisam lembrar da mesma coisa é ter um que vai
# esquecer. Agora existe um só, e ele também confere a paridade das migrações.
bash infra/migrador.sh

TABELAS=$(docker exec dtechmed_db psql -U "$USUARIO" -d "$BANCO" -tAc \
  "SELECT count(*) FROM pg_tables WHERE schemaname='public'" | tr -d ' ')
[ "$TABELAS" -ge 24 ] || morre "esperava ao menos 24 tabelas, encontrei $TABELAS"
verde "$TABELAS tabelas no banco"

FROUXAS=$(docker exec dtechmed_db psql -U "$USUARIO" -d "$BANCO" -tAc \
  "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind='r' AND c.relname NOT LIKE '_prisma%'
      AND (c.relrowsecurity=false OR c.relforcerowsecurity=false)" | tr -d ' ')
[ "$FROUXAS" = "0" ] || morre "$FROUXAS tabela(s) sem RLS forçado. NÃO coloque em uso."
verde "nenhuma tabela sem RLS forçado"

SEM_CHECK=$(docker exec dtechmed_db psql -U "$USUARIO" -d "$BANCO" -tAc \
  "SELECT count(*) FROM pg_policies WHERE schemaname='public'
     AND cmd IN ('ALL','INSERT','UPDATE') AND with_check IS NULL" | tr -d ' ')
[ "$SEM_CHECK" = "0" ] || morre "$SEM_CHECK política(s) de escrita sem WITH CHECK — brecha de gravação."
POLITICAS=$(docker exec dtechmed_db psql -U "$USUARIO" -d "$BANCO" -tAc \
  "SELECT count(*) FROM pg_policies WHERE schemaname='public'" | tr -d ' ')
verde "$POLITICAS políticas, todas as de escrita com WITH CHECK"

# ---------------------------------------------------------------------------
titulo "6. Super Admin"
# ---------------------------------------------------------------------------
# Pergunta ANTES de semear.
#
# A semeadura em si é idempotente — ela não duplica um Super Admin que já
# existe. Mas rodá-la em todo deploy significa abrir uma transação contra um
# banco que acabou de trocar de contêineres, e foi exatamente aí que ela
# falhou com P2028 ("Unable to start a transaction in the given time"): o
# trabalho não era necessário, e o deploy parou por causa dele.
#
# Semear é coisa de instalação nova. Depois disso, a resposta certa é não
# fazer nada.
QUANTOS_SA=$(docker exec dtechmed_db psql -U "$USUARIO" -d "$BANCO" -tAc \
  "SELECT count(*) FROM usuarios WHERE papel='SUPER_ADMIN'" | tr -d ' ')

if [ "$QUANTOS_SA" -ge 1 ]; then
  verde "$QUANTOS_SA Super Admin já existe — semeadura desnecessária"
elif grep -qE '^SEED_SUPERADMIN_EMAIL=.+' .env; then
  bash infra/migrador.sh npx prisma db seed
  QUANTOS_SA=$(docker exec dtechmed_db psql -U "$USUARIO" -d "$BANCO" -tAc \
    "SELECT count(*) FROM usuarios WHERE papel='SUPER_ADMIN'" | tr -d ' ')
  [ "$QUANTOS_SA" -ge 1 ] || morre "a semeadura rodou mas não há Super Admin no banco."
  verde "$QUANTOS_SA Super Admin criado"
else
  alerta "SEED_SUPERADMIN_EMAIL vazio — semeadura pulada, ninguém consegue entrar ainda"
fi

# ---------------------------------------------------------------------------
titulo "7. A aplicação responde?"
# ---------------------------------------------------------------------------
printf '  aguardando a aplicação'
VIVA=nao
for _ in $(seq 1 45); do
  CODIGO=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:5400/api/health || echo 000)
  if [ "$CODIGO" = "200" ]; then VIVA=sim; break; fi
  printf '.'; sleep 2
done
printf '\n'
[ "$VIVA" = "sim" ] || morre "a aplicação não respondeu 200 em /api/health. Veja: docker logs dtechmed_app --tail 40"
verde "/api/health → 200"

for ROTA in / /entrar; do
  C=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:5400${ROTA}" || echo 000)
  [ "$C" = "200" ] || morre "a rota $ROTA respondeu $C, esperava 200"
  verde "$ROTA → 200"
done

# O endereço que o site declara ao buscador tem que ser o mesmo do .env.
#
# Esta conferência nasceu de um defeito real: o robots.txt e o sitemap.xml eram
# resolvidos durante a construção da imagem, então uma troca de domínio feita do
# jeito natural — editar o .env, reiniciar — deixava os dois apontando para o
# endereço velho. O site novo respondia certo, as páginas traziam a canônica
# certa, e só esses dois arquivos continuavam mandando o Google para o lugar
# errado. Ninguém os abre depois de uma virada; o sintoma aparece semanas
# depois, quando já custou posição na busca.
#
# Os dois passaram a ser gerados a cada pedido. Isto aqui é a prova de que
# continuam assim: se um dia alguém tirar o `force-dynamic`, o deploy avisa.
for ARQUIVO in robots.txt sitemap.xml; do
  CORPO=$(curl -s "http://127.0.0.1:5400/${ARQUIVO}" || true)
  if printf '%s' "$CORPO" | grep -qF "$URL_PUBLICA"; then
    verde "/$ARQUIVO declara $URL_PUBLICA"
  else
    # No sitemap o endereço vive dentro de <loc>. Sem este primeiro recorte, a
    # mensagem mostraria a URL do esquema XML (sitemaps.org) como se fosse o
    # endereço configurado — um erro apontando para o lugar errado, que é pior
    # que erro nenhum.
    ENCONTRADO=$(printf '%s' "$CORPO" | grep -oE '<loc>[^<]+</loc>' | head -1 | sed 's/<[^>]*>//g')
    [ -n "$ENCONTRADO" ] || ENCONTRADO=$(printf '%s' "$CORPO" | grep -oiE '^(Host|Sitemap): *\S+' | head -1 | awk '{print $2}')
    morre "/$ARQUIVO declara '${ENCONTRADO:-nada}' e o .env diz '$URL_PUBLICA'. É este endereço que o Google vai indexar — não coloque em uso assim."
  fi
done

# O Caddy chega por este endereço, não pelo 127.0.0.1. Se esta linha falhar, o
# passo da portaria vai dar 502 — e a causa é invisível olhando só o log do app.
C=$(curl -s -o /dev/null -w '%{http_code}' http://172.17.0.1:5400/api/health || echo 000)
[ "$C" = "200" ] || morre "a aplicação não responde em 172.17.0.1:5400, que é por onde a portaria chega."
verde "172.17.0.1:5400 → 200 (é por aqui que o Caddy vai entrar)"

# ---------------------------------------------------------------------------
titulo "8. A fila de automação"
# ---------------------------------------------------------------------------
sleep 5
ESTADO_W=$(docker inspect -f '{{.State.Status}}' dtechmed_worker 2>/dev/null || echo ausente)
REINICIOS=$(docker inspect -f '{{.RestartCount}}' dtechmed_worker 2>/dev/null || echo 0)
[ "$ESTADO_W" = "running" ] || morre "o worker está '$ESTADO_W'. Veja: docker logs dtechmed_worker --tail 30"
verde "worker rodando (reinícios desde que subiu: $REINICIOS)"

if docker logs dtechmed_worker 2>&1 | tail -40 | grep -qi 'does not exist'; then
  alerta "o worker ainda reclama de tabela ausente; reinicie-o: docker restart dtechmed_worker"
fi

# ---------------------------------------------------------------------------
titulo "9. Os vizinhos continuam como estavam?"
# ---------------------------------------------------------------------------
VIZINHOS_DEPOIS=$(docker ps --format '{{.Names}}\t{{.Status}}' | grep -v '^dtechmed' | sort || true)
NOMES_ANTES=$(printf '%s\n' "$VIZINHOS_ANTES"  | cut -f1 | sort)
NOMES_DEPOIS=$(printf '%s\n' "$VIZINHOS_DEPOIS" | cut -f1 | sort)

if [ "$NOMES_ANTES" = "$NOMES_DEPOIS" ]; then
  verde "os mesmos $QUANTOS contêineres vizinhos, todos ainda de pé"
else
  printf '\n  \033[31mATENÇÃO: a lista de vizinhos mudou.\033[0m\n'
  diff <(printf '%s\n' "$NOMES_ANTES") <(printf '%s\n' "$NOMES_DEPOIS") | sed 's/^/      /' || true
  morre "algum vizinho saiu do ar. Isto não deveria acontecer — me chame antes de seguir."
fi

# ---------------------------------------------------------------------------
titulo "Pronto"
# ---------------------------------------------------------------------------
cat <<FIM

  A gaveta está no ar em http://127.0.0.1:5400 — ainda sem acesso pela
  internet, o que é o certo neste ponto.

  Falta:
    1. Publicar na portaria (Caddy)  → passo 8 do DEPLOY.md
    2. Conectar o WhatsApp           → passo 11, precisa do token da uazapi

  No primeiro login o sistema vai exigir a troca da senha. Faça — a senha
  atual passou pelo terminal e está no histórico do shell.

FIM
