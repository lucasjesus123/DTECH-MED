#!/bin/sh
# =============================================================================
# Papel de RUNTIME da aplicação
# =============================================================================
# Roda UMA vez, quando o volume do Postgres é criado do zero.
#
# A separação entre dois papéis é a base de todo o isolamento multiempresa:
#
#   dtechmed_owner  dono das tabelas. Roda as migrações (DDL). NÃO é usado
#                   pela aplicação em tempo de execução.
#   dtechmed_app    quem a aplicação usa. NOSUPERUSER, NOBYPASSRLS,
#                   NOCREATEDB, NOCREATEROLE. É submetido às policies como
#                   qualquer um — inclusive depois do FORCE ROW LEVEL
#                   SECURITY, que também alcança o dono.
#
# Sem essa separação o RLS seria decoração: a aplicação passaria por cima dele
# e o isolamento entre franquias dependeria de ninguém esquecer um filtro.
#
# É script de shell, e não .sql, por um motivo concreto: a senha vem do
# ambiente e não pode ficar escrita em arquivo do repositório nem gravada na
# configuração do banco, onde qualquer conexão a leria.
#
# Os GRANTs de tabela vivem na migração de RLS, não aqui — precisam acontecer
# DEPOIS de as tabelas existirem.
# =============================================================================
set -e

if [ -z "$APP_DB_PASSWORD" ]; then
  echo "ERRO: APP_DB_PASSWORD não definida." >&2
  echo "      Gere uma com: openssl rand -base64 32" >&2
  echo "      Papel de banco com senha vazia numa VPS compartilhada é pior" >&2
  echo "      que erro no deploy — por isso este init falha aqui." >&2
  exit 1
fi

psql -v ON_ERROR_STOP=1 \
     --username "$POSTGRES_USER" \
     --dbname "$POSTGRES_DB" \
     -v senha="$APP_DB_PASSWORD" \
     -v banco="$POSTGRES_DB" <<'SQL'
-- Cria o papel se ele ainda não existir.
--
-- Sem bloco `DO $$ ... $$`, e o motivo é específico: o psql NÃO substitui
-- variáveis dentro de texto delimitado por cifrões. Ele trata `$$...$$` como
-- literal de propósito, para não estragar corpos de função que contenham dois
-- pontos. O `:'senha'` chegava cru ao PostgreSQL e virava
-- `syntax error at or near ":"`, derrubando a inicialização inteira.
--
-- `\gexec` roda o comando que a consulta devolve. Quando o papel já existe, a
-- consulta não devolve linha nenhuma e nada acontece — a mesma idempotência do
-- bloco anterior, só que num lugar onde a substituição funciona.
SELECT 'CREATE ROLE dtechmed_app LOGIN '
    || 'NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT'
 WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dtechmed_app')
\gexec

-- A senha entra aqui, em comando de primeiro nível, onde o `:'senha'` é
-- substituído e escapado pelo próprio psql.
ALTER ROLE dtechmed_app WITH PASSWORD :'senha';

-- O dono precisa de CREATEDB apenas em desenvolvimento, para o shadow
-- database do `prisma migrate dev`. Em produção, `migrate deploy` não usa —
-- e um papel que cria bancos numa VPS compartilhada consome disco alheio.
ALTER ROLE dtechmed_owner NOCREATEDB;

-- O papel da aplicação só conecta neste banco.
--
-- `:"banco"` vem do -v acima. Antes estava escrito `:"POSTGRES_DB"`, como se o
-- psql enxergasse as variáveis de ambiente do shell — ele não enxerga: só
-- conhece o que recebe por -v. O nome ficava literal no SQL, virava erro de
-- sintaxe e, com ON_ERROR_STOP, derrubava a inicialização inteira.
REVOKE ALL ON DATABASE :"banco" FROM PUBLIC;
GRANT CONNECT ON DATABASE :"banco" TO dtechmed_app;
SQL

echo "Papel da aplicação pronto."
