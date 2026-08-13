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
     -v senha="$APP_DB_PASSWORD" <<'SQL'
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dtechmed_app') THEN
    EXECUTE format(
      'CREATE ROLE dtechmed_app LOGIN PASSWORD %L '
      || 'NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT',
      :'senha'
    );
    RAISE NOTICE 'Papel dtechmed_app criado.';
  ELSE
    RAISE NOTICE 'Papel dtechmed_app já existe; nada a fazer.';
  END IF;
END
$$;

-- O dono precisa de CREATEDB apenas em desenvolvimento, para o shadow
-- database do `prisma migrate dev`. Em produção, `migrate deploy` não usa —
-- e um papel que cria bancos numa VPS compartilhada consome disco alheio.
ALTER ROLE dtechmed_owner NOCREATEDB;

-- O papel da aplicação só conecta neste banco.
REVOKE ALL ON DATABASE :"POSTGRES_DB" FROM PUBLIC;
GRANT CONNECT ON DATABASE :"POSTGRES_DB" TO dtechmed_app;
SQL

echo "Papel da aplicação pronto."
