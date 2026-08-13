# Deploy do DTECH MED na VPS

Guia para colocar o sistema no ar na sua VPS compartilhada, na "gaveta" DTECH-MED, sem encostar nos outros dois sistemas que já rodam lá.

Feito para ser seguido de cima para baixo, uma vez. Cada passo diz **o que fazer** e **como conferir que deu certo** — se a conferência falhar, pare ali; seguir em frente só empurra o problema para um lugar mais difícil de achar.

**Tempo estimado:** 40 a 60 minutos, contando a propagação do DNS.

---

## Antes de começar

Você vai precisar de:

- [ ] Acesso `root` (ou `sudo`) na VPS por SSH
- [ ] Docker e Docker Compose instalados
- [ ] nginx instalado no host
- [ ] O domínio `dtechmed.com.br` apontando para o IP da VPS
- [ ] O **token de administrador da uazapi** em mãos
- [ ] O repositório do GitHub **em modo privado** (veja o passo 0)

---

## Passo 0 — Deixe o repositório privado

**Antes de qualquer coisa.** O `.env` de produção nunca vai para o git, mas o repositório carrega o desenho inteiro do sistema: estrutura do banco, políticas de isolamento, rotas públicas. É informação que facilita muito a vida de quem quiser tentar alguma coisa.

No GitHub: **Settings → General → Danger Zone → Change repository visibility → Private**.

**Confira:** abra o endereço do repositório numa janela anônima. Tem que dar 404.

---

## Passo 1 — Crie a gaveta

```bash
ssh root@SEU_IP

# Cada sistema no seu diretório. Nada de misturar com os vizinhos.
mkdir -p /opt/dtechmed
cd /opt/dtechmed

git clone https://github.com/lucasjesus123/DTECH-MED.git .
git checkout claude/dtech-med-technical-management-mta9r4
```

**Confira:**

```bash
ls docker-compose.yml Dockerfile infra/
# tem que listar os três
```

---

## Passo 2 — Gere os segredos

Quatro segredos, todos gerados **na hora, no servidor**. Não reaproveite os do desenvolvimento e não os mande por WhatsApp nem e-mail.

```bash
cd /opt/dtechmed

echo "POSTGRES_PASSWORD=$(openssl rand -base64 32)"
echo "APP_DB_PASSWORD=$(openssl rand -base64 32)"
echo "SESSION_SECRET=$(openssl rand -base64 48)"
echo "ENCRYPTION_KEY=$(openssl rand -base64 32)"
echo "DOCUMENT_HASH_SALT=$(openssl rand -base64 32)"
```

Guarde a saída em algum lugar seguro (um gerenciador de senhas). Você vai colar no próximo passo.

> **Sobre o `ENCRYPTION_KEY`:** é ele que cifra o token do WhatsApp de cada franquia no banco. Perder essa chave significa que nenhuma empresa consegue mais enviar mensagem até reconectar o número. Trocar a chave depois tem o mesmo efeito. Guarde bem.
>
> **Sobre o `DOCUMENT_HASH_SALT`:** é ele que permite ao portal conferir o CPF/CNPJ que o cliente digita. Trocá-lo depois faz **todas** as conferências falharem, e nenhum cliente consegue aprovar orçamento.

---

## Passo 3 — Escreva o `.env` de produção

```bash
cd /opt/dtechmed
cp .env.example .env
chmod 600 .env      # só o dono lê
nano .env
```

Preencha assim (substituindo pelos valores que você gerou):

```bash
NODE_ENV=production
APP_URL=https://dtechmed.com.br
APP_NAME="DTECH MED"

# ---------- Banco ----------
POSTGRES_DB=dtechmed
POSTGRES_USER=dtechmed_owner
POSTGRES_PASSWORD=<o que você gerou>
APP_DB_PASSWORD=<o que você gerou>

# A aplicação conecta como dtechmed_app. O host é `db` — nome do serviço na
# rede do Docker.
DATABASE_URL="postgresql://dtechmed_app:<APP_DB_PASSWORD>@db:5432/dtechmed?schema=public&connection_limit=20&pool_timeout=20"

# Só para as migrações. NUNCA use esta url na aplicação.
DIRECT_DATABASE_URL="postgresql://dtechmed_owner:<POSTGRES_PASSWORD>@db:5432/dtechmed?schema=public"

# ---------- Segredos ----------
SESSION_SECRET=<o que você gerou>
ENCRYPTION_KEY=<o que você gerou>
DOCUMENT_HASH_SALT=<o que você gerou>

# ---------- WhatsApp ----------
UAZAPI_BASE_URL=https://free.uazapi.com
UAZAPI_ADMIN_TOKEN=<seu token de administrador da uazapi>
UAZAPI_WEBHOOK_SECRET=<gere outro: openssl rand -base64 24>

# ---------- Armazenamento ----------
STORAGE_DRIVER=local
STORAGE_LOCAL_PATH=/app/storage

# ---------- Fila ----------
WORKER_ENABLED=true
WORKER_POLL_INTERVAL_MS=3000
WORKER_BATCH_SIZE=10
WORKER_MAX_ATTEMPTS=6

# ---------- Segurança ----------
# Sem curinga. Lista fechada.
ALLOWED_ORIGINS=https://dtechmed.com.br,https://www.dtechmed.com.br
LOGIN_RATE_LIMIT_WINDOW_MS=900000
LOGIN_RATE_LIMIT_MAX=8
SESSION_TTL_HOURS=12

# true SÓ porque a aplicação fica atrás do nginx desta VPS. Se um dia ela for
# exposta direto, volte para false — senão o IP da auditoria vira campo que
# qualquer um preenche, e IP forjado na trilha é pior que IP nenhum.
TRUST_PROXY=true

# ---------- Site ----------
SITE_TENANT_SLUG=dtechmed-lajeado
LEAD_RATE_LIMIT_WINDOW_MS=600000
LEAD_RATE_LIMIT_MAX=5

# ---------- Primeiro acesso ----------
SEED_SUPERADMIN_EMAIL=lucas@dtechmed.com.br
SEED_SUPERADMIN_PASSWORD=<uma senha forte que só você conheça>

# ---------- Backup ----------
BACKUP_RETENCAO_DIAS=14
BACKUP_INTERVALO_SEGUNDOS=86400
```

> **A armadilha mais cara deste arquivo.** `DATABASE_URL` e `DIRECT_DATABASE_URL` são parecidas e fazem coisas muito diferentes. A primeira é da aplicação, com o papel restrito. A segunda é do dono, e serve só para as migrações. **Trocar uma pela outra não dá erro visível** — o sistema sobe e funciona. O que muda é que o isolamento entre franquias deixa de valer.
>
> O `FORCE ROW LEVEL SECURITY` aplicado na auditoria transforma esse engano silencioso em erro visível: com a url errada, as telas passam a vir vazias em vez de mostrar dado de todo mundo. Ainda assim, confira duas vezes.

**Confira:**

```bash
grep -c "<" .env
# tem que dar 0 — se der mais, sobrou um placeholder para preencher

ls -l .env
# tem que aparecer -rw------- (600)
```

---

## Passo 4 — Suba a gaveta

```bash
cd /opt/dtechmed
docker compose -p dtechmed up -d --build
```

A primeira vez demora: baixa as imagens e compila a aplicação. De 5 a 10 minutos é normal.

**Confira:**

```bash
docker compose -p dtechmed ps
# db, app, worker e backup: todos "Up". db e app com (healthy).

docker compose -p dtechmed logs db | grep "Papel da aplicação pronto"
# tem que aparecer
```

Se o `db` reclamar de `APP_DB_PASSWORD não definida`, o `.env` não está sendo lido — confira se ele está em `/opt/dtechmed/.env`.

**Confira que nada vazou para a internet:**

```bash
ss -tlnp | grep -E '5400|5433'
# as duas portas TÊM que aparecer como 127.0.0.1:xxxx
# se aparecer 0.0.0.0:xxxx, PARE — o banco está exposto
```

---

## Passo 5 — Crie as tabelas

As migrações rodam num serviço próprio, o `migrador`. Ele não sobe junto com o
resto: usa o estágio de **build** da imagem, porque precisa do CLI do Prisma,
do `tsx` e do `prisma.config.ts` — coisas que a imagem final não carrega, de
propósito.

```bash
cd /opt/dtechmed
docker compose -p dtechmed --profile manutencao run --rm migrador
```

Ele executa `prisma migrate deploy`, mostra o que aplicou e sai.

**Confira:**

```bash
docker compose -p dtechmed exec db \
  psql -U dtechmed_owner -d dtechmed -c \
  "SELECT count(*) AS tabelas_com_rls_forcado FROM pg_class c
     JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind='r' AND c.relforcerowsecurity;"
# tem que dar 24
```

Se der menos que 24, a migração de endurecimento não passou. Não siga em frente: é ela que garante o isolamento entre franquias.

---

## Passo 6 — Crie o Super Admin

```bash
cd /opt/dtechmed
docker compose -p dtechmed --profile manutencao run --rm \
  migrador npx tsx prisma/seed.ts
```

Sem o `--demo`: em produção ninguém quer a Clínica Bella Pelle no meio da carteira de verdade.

**Confira:** a saída mostra `Super Admin criado: lucas@dtechmed.com.br`.

Depois disso, **apague a senha do `.env`** — ela já cumpriu o papel:

```bash
sed -i 's/^SEED_SUPERADMIN_PASSWORD=.*/SEED_SUPERADMIN_PASSWORD=/' .env
```

---

## Passo 7 — Configure o nginx

```bash
cd /opt/dtechmed
cp infra/nginx/dtechmed-proxy.conf /etc/nginx/dtechmed-proxy.conf
cp infra/nginx/dtechmed.conf /etc/nginx/sites-available/dtechmed.conf
ln -s /etc/nginx/sites-available/dtechmed.conf /etc/nginx/sites-enabled/

nginx -t
```

O `nginx -t` vai reclamar do certificado, que ainda não existe. É esperado — o próximo passo resolve.

> **Convivência com as outras gavetas:** este arquivo responde só pelos `server_name` do DTECH MED. Não é `default_server`. Se fosse, capturaria requisições dos vizinhos.

---

## Passo 8 — Certificado TLS

```bash
mkdir -p /var/www/certbot

certbot certonly --webroot -w /var/www/certbot \
  -d dtechmed.com.br -d www.dtechmed.com.br \
  --email contato@conexaomkt.com.br --agree-tos --no-eff-email

nginx -t && systemctl reload nginx
```

**Confira:**

```bash
curl -sI https://dtechmed.com.br | head -1
# HTTP/2 200

curl -sI https://dtechmed.com.br | grep -i strict-transport
# strict-transport-security: max-age=31536000; includeSubDomains
```

**Confira a renovação automática** — certificado que vence no domingo derruba o sistema no domingo:

```bash
certbot renew --dry-run
systemctl list-timers | grep certbot
```

---

## Passo 9 — Endurecimento final do servidor

Três itens que a auditoria apontou e que só podem ser aplicados aqui.

```bash
cd /opt/dtechmed

# SEC-007 — o dono do banco não precisa criar bancos em produção.
docker compose -p dtechmed exec db \
  psql -U dtechmed_owner -d dtechmed -c "ALTER ROLE dtechmed_owner NOCREATEDB;"

# SEC-008 — anexos legíveis só pelo dono. A VPS é compartilhada.
docker compose -p dtechmed exec app sh -c "chmod 700 /app/storage"

# SEC-009 — já resolvido: o nginx barra método incomum antes da aplicação.
```

**Confira:**

```bash
docker compose -p dtechmed exec db psql -U dtechmed_owner -d dtechmed -c \
  "SELECT rolname, rolsuper, rolbypassrls, rolcreatedb FROM pg_roles WHERE rolname LIKE 'dtechmed%';"
# dtechmed_app   → f | f | f
# dtechmed_owner → f | f | f

curl -s -o /dev/null -w "%{http_code}\n" -X TRACE https://dtechmed.com.br
# 405
```

Se você ainda não rodou as duas ferramentas que o ambiente de auditoria bloqueou, é aqui:

```bash
# Vulnerabilidades na imagem e nas dependências
docker run --rm -v /var/run/docker.sock:/var/run/docker.sock \
  aquasec/trivy image dtechmed-app:latest

curl -sSfL https://raw.githubusercontent.com/google/osv-scanner/main/install.sh | sh
osv-scanner --lockfile=/opt/dtechmed/package-lock.json
```

---

## Passo 10 — Conecte o WhatsApp

1. Entre em `https://dtechmed.com.br/entrar` com o Super Admin.
2. Troque a senha (o sistema exige no primeiro acesso).
3. Vá em **Empresas → Cadastrar empresa** e crie a DTECH MED com o identificador **`dtechmed-lajeado`** — precisa bater com o `SITE_TENANT_SLUG` do `.env`, senão os contatos do site não chegam a lugar nenhum.
4. Entre com o usuário administrador que você acabou de criar.
5. Vá em **WhatsApp → Conectar o WhatsApp**.
6. Leia o QR Code no celular da empresa: **WhatsApp → Aparelhos conectados → Conectar aparelho**.

**Confira:** a tela mostra **conectado** e o número aparece. Clique em **Atualizar status** para ter certeza de que veio do provedor, e não da tela.

> Enquanto o número não conecta, nada se perde: os avisos ficam enfileirados e saem assim que a conexão subir.

---

## Passo 11 — Ensaie a restauração do backup

**Este passo não é opcional.** Backup que nunca foi restaurado não é backup, é esperança. Descobrir que o dump está quebrado no dia em que você precisa dele é o pior momento possível.

```bash
cd /opt/dtechmed

# Force um backup agora
docker compose -p dtechmed restart backup
sleep 60
docker compose -p dtechmed exec backup ls -lh /backups
# tem que existir um dtechmed_AAAA-MM-DD_HHMM.sql.gz

# Restaure em um banco DESCARTÁVEL — nunca por cima do de produção
docker compose -p dtechmed exec db psql -U dtechmed_owner -d postgres \
  -c "CREATE DATABASE ensaio_restauracao;"

ARQ=$(docker compose -p dtechmed exec -T backup sh -c 'ls -t /backups/*.sql.gz | head -1' | tr -d '\r')
docker compose -p dtechmed exec -T backup sh -c "gunzip -c $ARQ" \
  | docker compose -p dtechmed exec -T db psql -U dtechmed_owner -d ensaio_restauracao

# Confira que os dados vieram
docker compose -p dtechmed exec db psql -U dtechmed_owner -d ensaio_restauracao -c \
  "SELECT (SELECT count(*) FROM tenants) empresas, (SELECT count(*) FROM usuarios) usuarios;"

# Descarte o ensaio
docker compose -p dtechmed exec db psql -U dtechmed_owner -d postgres \
  -c "DROP DATABASE ensaio_restauracao;"
```

Agora ative também o **Auto Backup da VPS**, no painel da Hostinger. São duas camadas com propósitos diferentes: o dump restaura um engano recente; o snapshot da VPS salva o servidor inteiro.

---

## Passo 12 — Confira o sistema de ponta a ponta

Faça isto **você mesmo**, pelo navegador, antes de entregar para a equipe:

| # | O quê | Onde |
|---|---|---|
| 1 | O site abre e a hero aparece | `https://dtechmed.com.br` |
| 2 | O formulário do site envia e confirma na tela | `#solicitar` |
| 3 | O contato aparece no painel do dia | `/painel` |
| 4 | Abrir a ordem pelo contato já vem preenchida | botão **Abrir ordem** |
| 5 | Agendar a retirada avisa o cliente | `/painel/agenda` |
| 6 | O motorista vê a rota no celular | `/app/motorista` |
| 7 | A assinatura funciona com o dedo | parada → **Cheguei** |
| 8 | O técnico registra as fotos | `/app/tecnico` |
| 9 | O orçamento sai e o cliente recebe o link | prontuário |
| 10 | O PDF abre pelo link do WhatsApp | link recebido |
| 11 | O cliente aprova confirmando o CPF/CNPJ | `/os/<token>` |
| 12 | A fatura aceita pagamento em duas formas | `/painel/financeiro` |
| 13 | A gestão confere e fecha | mesma tela |
| 14 | O prontuário mostra **histórico íntegro** | `/painel/ordens/<id>` |

Se o item 14 mostrar **histórico alterado**, pare e me chame: alguma coisa mexeu no banco por fora.

---

## Operação do dia a dia

### Ver o que está acontecendo

```bash
cd /opt/dtechmed
docker compose -p dtechmed logs -f app        # aplicação
docker compose -p dtechmed logs -f worker     # fila de WhatsApp e PDF
docker compose -p dtechmed ps                 # saúde dos serviços
```

### Atualizar o sistema

```bash
cd /opt/dtechmed
git pull
docker compose -p dtechmed up -d --build
docker compose -p dtechmed --profile manutencao run --rm migrador
```

O `restart: unless-stopped` do compose já religa tudo sozinho se a VPS reiniciar.

### Quando os avisos param de sair

```bash
# A fila está entupida?
docker compose -p dtechmed exec db psql -U dtechmed_owner -d dtechmed -c \
  "SELECT status, count(*) FROM outbox_jobs GROUP BY status;"
```

- Muitos `PENDENTE` e nenhum `CONCLUIDO` → o worker caiu. `docker compose -p dtechmed restart worker`.
- Muitos `DESCARTADO` → estouraram as tentativas. Veja o motivo em **Painel → WhatsApp**, na coluna de situação.
- O número desconectou → **Painel → WhatsApp → Conectar** e leia o QR de novo.

### Espaço em disco

```bash
df -h /
docker system df
docker compose -p dtechmed exec app du -sh /app/storage
```

As fotos são o que mais cresce. Cada ordem guarda no mínimo seis, redimensionadas para 1600 px.

---

## Se der errado

| Sintoma | O que olhar |
|---|---|
| **Página em branco ou erro 502** | `docker compose -p dtechmed logs app`. Quase sempre é `.env` incompleto. |
| **"Acesso da empresa suspenso" no login** | A empresa está bloqueada. Veja em **Empresas** com o Super Admin. |
| **Telas do painel vêm vazias** | `DATABASE_URL` pode estar apontando para o papel errado. Confira que ela usa `dtechmed_app`, não `dtechmed_owner`. |
| **O PDF do cliente dá 404** | O worker não gerou. `docker compose -p dtechmed logs worker`. |
| **O cliente não consegue aprovar** | O `DOCUMENT_HASH_SALT` mudou depois do cadastro dos clientes. Ele não pode mudar. |
| **WhatsApp não envia** | `UAZAPI_ADMIN_TOKEN` vazio, ou o número desconectou. |
| **Login recusa todo mundo** | Confira se as migrações rodaram: `docker compose -p dtechmed --profile manutencao run --rm migrador npx prisma migrate status`. |

---

## O que não fazer

- **Não** rode `prisma migrate reset` na VPS. Ele apaga o banco inteiro.
- **Não** troque `ENCRYPTION_KEY` nem `DOCUMENT_HASH_SALT` depois que o sistema estiver em uso.
- **Não** exponha as portas 5400 e 5433 para fora do `127.0.0.1`.
- **Não** use `DIRECT_DATABASE_URL` na aplicação — ela é só das migrações.
- **Não** volte o repositório para público.
- **Não** edite dado direto no banco. A linha do tempo é encadeada por hash: mexer nela deixa rastro, e o prontuário passa a mostrar "histórico alterado" para sempre.

---

## Referência rápida

| Item | Valor |
|---|---|
| Diretório da gaveta | `/opt/dtechmed` |
| Nome do projeto Docker | `dtechmed` |
| Aplicação (loopback) | `127.0.0.1:5400` |
| Banco (loopback) | `127.0.0.1:5433` |
| Volumes | `dtechmed_pgdata`, `dtechmed_storage`, `dtechmed_backups` |
| Migração e semeadura | `docker compose -p dtechmed --profile manutencao run --rm migrador` |
| Rede | `dtechmed_net` |
| nginx | `/etc/nginx/sites-available/dtechmed.conf` |
| Retenção de backup | 14 dias (ajustável no `.env`) |

Relatório de segurança completo, com o que foi corrigido e o que ficou para o servidor: **[AUDITORIA_SEGURANCA.md](./AUDITORIA_SEGURANCA.md)**.
