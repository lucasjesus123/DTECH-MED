# Deploy do DTECH MED na VPS

Guia para colocar o sistema no ar na sua VPS compartilhada, na "gaveta" DTECH-MED, sem encostar nos outros dois sistemas que já rodam lá.

Feito para ser seguido de cima para baixo, uma vez. Cada passo diz **o que fazer** e **como conferir que deu certo** — se a conferência falhar, pare ali; seguir em frente só empurra o problema para um lugar mais difícil de achar.

**Tempo estimado:** 40 a 60 minutos, contando a propagação do DNS.

---

## Antes de começar

Você vai precisar de:

- [ ] Acesso `root` (ou `sudo`) na VPS por SSH
- [ ] Docker e Docker Compose instalados
- [ ] Acesso ao painel de DNS do domínio
- [ ] O **token de administrador da uazapi** em mãos
- [ ] O repositório do GitHub **em modo privado** (veja o passo 0)

> **Sobre a porta de entrada:** esta VPS **não tem nginx**. Quem atende as portas 80 e 443 é o Caddy da gaveta PORTAL_ESTETICA, que funciona como portaria compartilhada da máquina — as duas gavetas que já existem vivem em portas locais (`127.0.0.1:8080`, `127.0.0.1:8000`) e é o Caddy que decide qual domínio vai para qual porta. O DTECH MED entra no mesmo padrão, em `127.0.0.1:5400`. Instalar nginx aqui tomaria as portas 80/443 e derrubaria os dois sites vizinhos na hora. **Não instale nginx nesta máquina.**

---

## Passo 0 — Deixe o repositório privado

**Antes de qualquer coisa.** O `.env` de produção nunca vai para o git, mas o repositório carrega o desenho inteiro do sistema: estrutura do banco, políticas de isolamento, rotas públicas. É informação que facilita muito a vida de quem quiser tentar alguma coisa.

No GitHub: **Settings → General → Danger Zone → Change repository visibility → Private**.

**Confira:** abra o endereço do repositório numa janela anônima. Tem que dar 404.

---

## Passo 1 — Reconhecimento da VPS (só leitura)

A VPS já hospeda outros dois sistemas. Antes de criar qualquer coisa, vamos **olhar** o que existe. Nenhum comando deste passo escreve nada — todos apenas listam.

O objetivo é provar, com a saída na tela, que os nomes que o DTECH MED vai usar estão livres. São seis nomes, e cada um tem que estar ausente da lista correspondente:

| O que vamos criar | Onde não pode existir ainda |
| --- | --- |
| Diretório `/opt/gavetas/DTECHMED` | `ls /opt` |
| Projeto Compose `dtechmed` e contêineres `dtechmed_*` | `docker ps -a` |
| Rede `dtechmed_net` | `docker network ls` |
| Volumes `dtechmed_pgdata`, `dtechmed_storage`, `dtechmed_backups` | `docker volume ls` |
| Portas `5400` e `5433` em `127.0.0.1` | `ss -tlnp` |
| Bloco `dtechmed.caddy` na portaria | `/data/sites-extra/` do contêiner do Caddy |

```bash
ssh root@SEU_IP

echo '=== 1. DIRETÓRIOS EM /opt ==='
ls -la /opt

echo; echo '=== 2. CONTÊINERES (todos, inclusive parados) ==='
docker ps -a --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}'

echo; echo '=== 3. PROJETOS COMPOSE ==='
docker compose ls -a

echo; echo '=== 4. REDES ==='
docker network ls

echo; echo '=== 5. VOLUMES ==='
docker volume ls

echo; echo '=== 6. PORTAS EM ESCUTA ==='
ss -tlnp

echo; echo '=== 7. QUEM ATENDE A INTERNET ==='
ss -tlnp | grep -E ':(80|443) '
ls -la /etc/nginx/sites-enabled/ 2>/dev/null || echo 'sem nginx nesta maquina'

echo; echo '=== 8. ESPAÇO E MEMÓRIA ==='
df -h /
free -h
nproc
```

**Confira** — leia a saída procurando estas quatro coisas:

1. **Nenhum contêiner, rede ou volume começa com `dtechmed`.** Se algum começar, é resto de uma tentativa anterior; pare e me avise antes de seguir.
2. **As portas `5400` e `5433` não aparecem na lista do `ss`.** Se aparecerem, um vizinho já as usa — dá para trocar as nossas, mas isso tem que ser decidido agora, não depois.
3. **Quem segura as portas 80 e 443.** Nesta VPS é o `portal-da-estetica-web-1`, um Caddy. Anote o nome do contêiner: ele vai reaparecer no passo 8.
4. **Sobra espaço em disco e memória** — a imagem da aplicação, o Postgres e os backups pedem uns 6 GB de disco, e a gaveta tem teto de 3 GB de RAM. Some o que os vizinhos já usam (`free -h`) e veja se a folga comporta.

Um alerta que vale para todo o resto do guia: **sempre use `-p dtechmed`** nos comandos do `docker compose`, e sempre a partir de `/opt/gavetas/DTECHMED`. É esse par (diretório + nome do projeto) que garante que um `docker compose down` seu derrube só a nossa gaveta. Um `docker compose down` na pasta errada, ou um `docker stop $(docker ps -q)`, derruba os vizinhos junto — esse comando não aparece em lugar nenhum deste guia, e é de propósito.

### 1c — Crie o DNS de ensaio agora

Faça isto **antes** de seguir, porque o DNS leva de minutos a horas para propagar e ele vai trabalhar enquanto você constrói o resto.

O ensaio roda num **domínio separado**: `conexevolution.online`. Separado é melhor que subdomínio — o `dtechmed.com.br` não é tocado em momento nenhum, nem por engano.

No painel do `conexevolution.online`:

| Tipo | Nome | Valor |
| --- | --- | --- |
| A | `@` | `169.58.76.233` |
| A | `www` | `169.58.76.233` |

**Confira** (de qualquer máquina, inclusive da própria VPS):

```bash
dig +short conexevolution.online
dig +short www.conexevolution.online
# as duas tem que responder 169.58.76.233
```

Você pode seguir para o passo 2 sem esperar — só o passo 8 depende disso.

---

## Passo 2 — Crie a gaveta

```bash
ssh root@SEU_IP

# Cada sistema no seu diretório. Nada de misturar com os vizinhos.
mkdir -p /opt/gavetas/DTECHMED
cd /opt/gavetas/DTECHMED

git clone https://github.com/lucasjesus123/DTECH-MED.git .
git checkout claude/dtech-med-technical-management-mta9r4
```

**Confira:**

```bash
git log --oneline -1
ls docker-compose.yml Dockerfile infra/caddy/dtechmed.caddy
grep '172.17.0.1' docker-compose.yml
# a ultima linha e a prova de que voce pegou a versao adaptada a esta VPS
```

---

## Passo 3 — Gere o `.env` de produção

Um comando. Ele cria o arquivo inteiro, com os seis segredos gerados **na hora, no servidor**, cada um no formato que a aplicação espera.

```bash
cd /opt/gavetas/DTECHMED && bash infra/gerar-env.sh conexevolution.online
```

> **Por que um script e não copiar seis valores no `nano`.** Cada segredo tem um formato próprio, e errar o formato produz um erro que aponta para o lugar errado:
>
> - As senhas do banco entram **dentro de uma URL** (`postgresql://usuario:SENHA@db:5432/...`). O `openssl rand -base64` produz `/`, `+` e `=`, que quebram a URL — e o sintoma é "senha inválida", mandando você caçar a senha em vez do formato. O script gera em hexadecimal, sempre seguro em URL.
> - Já o `SESSION_SECRET` e o `ENCRYPTION_KEY` são lidos com `Buffer.from(v, 'base64')` e precisam decodificar para 32 bytes. Esses são base64 mesmo.
> - A senha do app aparece em dois lugares (a variável e a URL de conexão). Digitar duas vezes é uma chance de divergir.
> - O arquivo nasce com permissão `600`. Um `nano` seguido de `chmod` deixa uma janela em que o segredo está no disco legível por todos.
>
> O script **se recusa a sobrescrever** um `.env` existente. Apagar sozinho o arquivo que guarda a `ENCRYPTION_KEY` de um sistema em uso seria destruir o WhatsApp de todas as franquias.

**Confira** — sem revelar nenhum segredo na tela:

```bash
cd /opt/gavetas/DTECHMED
ls -l .env                      # tem que aparecer -rw------- (600)
# O .env NÃO pode estar dentro da imagem. Procure "No such file" na saída:
bash infra/migrador.sh ls -l /app/.env 2>&1 | grep -i 'no such file' \
  && echo 'OK: o .env ficou fora da imagem' \
  || echo 'PERIGO: o .env entrou na imagem — confira o .dockerignore'
grep -c '^[A-Z_]*=$' .env       # tem que dar 3: os que faltam preencher
grep -o 'postgresql://[^:]*' .env   # dtechmed_app e dtechmed_owner
```

⚠️ **Guarde uma cópia do `.env` num gerenciador de senhas antes de seguir**, e **não mande o conteúdo por mensagem**. Dois dos segredos não podem ser trocados depois:

| Segredo | Se você perder ou trocar |
| --- | --- |
| `ENCRYPTION_KEY` | Cifra o token do WhatsApp de cada franquia no banco. Sem ela, ninguém envia mensagem até reconectar o número na mão. |
| `DOCUMENT_HASH_SALT` | Permite ao portal conferir o CPF/CNPJ que o cliente digita. Trocá-lo faz **todas** as conferências falharem, e nenhum cliente aprova orçamento. |

Os outros quatro são trocáveis — custa uma reinicialização e todo mundo refaz login.

---

## Passo 4 — Preencha os três valores que faltam

```bash
cd /opt/gavetas/DTECHMED && nano .env
```

Procure estas três linhas vazias e preencha:

```bash
# Vem do painel da uazapi. Sem ele o sistema sobe e funciona; as mensagens
# automáticas ficam guardadas na fila e disparam sozinhas quando o token
# entrar — que é o comportamento correto, não uma falha.
UAZAPI_ADMIN_TOKEN=

# Seu acesso de Super Admin. Usado uma única vez, no passo 7.
SEED_SUPERADMIN_EMAIL=
SEED_SUPERADMIN_PASSWORD=
```

Salve com `Ctrl+O`, `Enter`, `Ctrl+X`.

**Confira:**

```bash
grep -c '^[A-Z_]*=$' .env
# tem que dar 0 — se der mais, sobrou linha em branco para preencher
```

---

## Passo 5 — Suba a gaveta

Um comando. Ele constrói as imagens, sobe os quatro contêineres, cria as tabelas, semeia o Super Admin — e **confere cada etapa antes de passar para a próxima**, parando na primeira que falhar.

```bash
cd /opt/gavetas/DTECHMED && bash infra/subir.sh
```

O que ele confere, em ordem:

| Etapa | O que precisa dar certo |
| --- | --- |
| 1 | Docker respondendo, `.env` em `600`, as 11 variáveis obrigatórias preenchidas |
| 2 | **Fotografia dos vizinhos** e portas 5400/5433 livres ou já nossas |
| 3 | Imagens construídas, contêineres de pé, banco saudável |
| 4 | `dtechmed_app` **sem superusuário, sem BYPASSRLS, sem criar banco** |
| 5 | Migrações aplicadas, ao menos 24 tabelas, **nenhuma sem RLS forçado**, nenhuma política de escrita sem `WITH CHECK` |
| 6 | Super Admin no banco |
| 7 | `/api/health`, `/` e `/entrar` em 200 — e também em `172.17.0.1:5400`, que é por onde a portaria entra |
| 8 | Worker rodando, sem laço de reinício |
| 9 | **Os mesmos vizinhos da etapa 2, todos ainda de pé** |

A etapa 9 é a que responde à pergunta que mais importa nesta VPS. Ela compara a lista de contêineres das outras gavetas antes e depois; se algum tiver saído do ar, o script nomeia qual e aborta, em vez de declarar sucesso.

A etapa 4 é a que sustenta a franquia. Se `dtechmed_app` nascesse com `BYPASSRLS`, o RLS viraria decoração — a aplicação passaria por cima de todas as políticas e uma empresa enxergaria os dados da outra. O script se recusa a migrar antes de provar que não é o caso.

**É seguro rodar de novo.** Nenhuma etapa apaga dado: as migrações aplicam só o que falta e a semeadura não recria um Super Admin que já exista.

Se ele parar no meio, a mensagem diz onde parou e qual comando usar para ver o log. Não siga por cima de um erro — cada etapa depende de a anterior ter dado certo de verdade.

---

## Passo 6 — Migrações e semeadura (referência)

**Já feito pelo passo 5.** Esta seção fica para quando você precisar rodar uma delas isoladamente — por exemplo, depois de uma atualização que traga migrações novas.

```bash
cd /opt/gavetas/DTECHMED

# Só as migrações
bash infra/migrador.sh

# Só a semeadura
bash infra/migrador.sh npx prisma db seed
```

O `migrador` usa o **estágio de build** da imagem, e não o de execução, porque precisa do CLI do Prisma e do `prisma.config.ts` — coisas que a imagem final não carrega, de propósito. Ele conecta com `DIRECT_DATABASE_URL`, como `dtechmed_owner`: o único papel com poder de criar tabela. A aplicação nunca usa essa URL.

> **Por que existe o `infra/migrador.sh` em vez do comando do Compose direto.**
>
> O comando cru é `docker compose -p dtechmed --profile manutencao run --rm migrador`, e ele carrega uma armadilha: `run` usa a imagem que **já existe**. O Compose a constrói na primeiríssima execução e nunca mais, e serviço com `profiles:` também fica de fora do `up --build`. Sem construir antes, tudo o que roda aqui é o código do dia em que a imagem nasceu.
>
> Isso já produziu dois defeitos neste sistema, e os dois **pareciam sucesso**:
>
> | O que aconteceu | O que a tela mostrou |
> | --- | --- |
> | A imagem tinha 10 migrações, o repositório tinha 11 | `No pending migrations to apply`, saída zero, deploy verde — e a tabela nova não existia |
> | O cenário de demonstração criou 6 ordens em vez de 22 | O script rodou até o fim sem erro |
>
> O `infra/migrador.sh` **sempre constrói antes de rodar**, e não tem opção para pular isso. Depois de aplicar migrações, ele ainda compara quantas existem no repositório com quantas o banco registra, e recusa seguir se divergirem. Use sempre ele; qualquer coisa que você queira rodar lá dentro entra como argumento:
>
> ```bash
> bash infra/migrador.sh                              # aplica as migrações
> bash infra/migrador.sh npx prisma migrate status    # só consulta
> bash infra/migrador.sh npx tsx scripts/cenario-demo.mts   # dados de teste
> ```

---

## Passo 7 — Conferir o banco à mão (referência)

**Já feito pelo passo 5.** Guardado aqui para quando você quiser olhar o estado do banco sem rodar o deploy inteiro.

```bash
cd /opt/gavetas/DTECHMED

# Os papéis: dtechmed_app tem que sair como `---`
docker exec dtechmed_db psql -U dtechmed_owner -d dtechmed -tAc \
  "SELECT rolname||':'
       || CASE WHEN rolsuper     THEN 's' ELSE '-' END
       || CASE WHEN rolbypassrls THEN 'b' ELSE '-' END
       || CASE WHEN rolcreatedb  THEN 'c' ELSE '-' END
     FROM pg_roles WHERE rolname LIKE 'dtechmed%' ORDER BY 1"

# Tabelas sem RLS forçado: a saída tem que ser vazia
docker exec dtechmed_db psql -U dtechmed_owner -d dtechmed -tAc \
  "SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind='r' AND c.relname NOT LIKE '_prisma%'
      AND (c.relrowsecurity=false OR c.relforcerowsecurity=false)"
```

---

## Passo 8 — Publique na portaria (Caddy)

Até aqui nada saiu da gaveta: a aplicação responde em `127.0.0.1:5400` e ninguém de fora a alcança. Este passo é o único do guia que toca em algo compartilhado — e ele foi desenhado para tocar **só no ponto de extensão que a portaria já oferece**.

O `Caddyfile` do vizinho termina assim:

```caddy
# gavetas extras (fora do git)
import /data/sites-extra/*.caddy
```

Ou seja: existe uma pasta declarada para sites adicionais. Vamos colocar um arquivo lá. **Nenhuma linha da configuração do PORTAL_ESTETICA é editada.**

### 8.1 — Confirme o ponto de extensão

```bash
docker exec portal-da-estetica-web-1 ls -la /data/sites-extra/
docker exec portal-da-estetica-web-1 sh -c 'cat /data/sites-extra/*.caddy'
```

Você deve ver o bloco da MINHAMECANICA, que serve de espelho: é a prova de que este mecanismo já funciona nesta máquina.

### 8.2 — Confira o nosso bloco

Os domínios já estão escritos dentro de `infra/caddy/dtechmed.caddy`, prontos. **Não os edite pelo terminal.**

O arquivo tem **dois blocos**: o que atende o site e o que redireciona os outros endereços para ele. O passo 14 explica o desenho; aqui só confira que os dois chegaram inteiros.

```bash
cd /opt/gavetas/DTECHMED
grep -n '^dtechmed.com.br,\|^www.dtechmed' infra/caddy/dtechmed.caddy

# Nenhum colchete nas linhas que não são comentário. Tem que dar 0.
grep -v '^[[:space:]]*#' infra/caddy/dtechmed.caddy | grep -c '\[' 
```

> **Por que a segunda verificação existe.** Alguns clientes de terminal e de chat convertem automaticamente qualquer texto começando com `www.` num link markdown, com colchetes e parênteses em volta. Isso é sintaxe inválida do Caddy — e este Caddy atende as portas 80 e 443 da máquina inteira, então uma configuração que ele não consiga carregar derruba os três sites juntos. Aconteceu neste deploy, com um `sed` que parecia inofensivo. Por isso o domínio vive no repositório e chega por `git pull`, sem passar pelo teclado.
>
> A verificação ignora as linhas de comentário — senão o próprio texto que você está lendo a faria falhar.
>
> Se o segundo `grep` não devolver `0`, o arquivo está contaminado: refaça o `git reset --hard FETCH_HEAD` e **não instale**.

### 8.3 — Instale o arquivo

```bash
docker exec portal-da-estetica-web-1 mkdir -p /data/sites-extra
docker cp infra/caddy/dtechmed.caddy portal-da-estetica-web-1:/data/sites-extra/dtechmed.caddy
docker exec portal-da-estetica-web-1 head -1 /data/sites-extra/dtechmed.caddy
```

Ainda **não** valeu nada: o Caddy só relê a configuração quando alguém manda.

### 8.4 — Valide antes de mandar reler

```bash
docker exec portal-da-estetica-web-1 caddy validate --config /etc/caddy/Caddyfile
```

Tem que terminar com `Valid configuration`. O `validate` lê o Caddyfile do vizinho **e** os arquivos importados, incluindo o nosso — então um erro de sintaxe aparece aqui, com os três sites ainda no ar, e não no momento em que a portaria tentar subir com ele.

🚨 **Se o `validate` falhar, PARE.** Desfaça com `docker exec portal-da-estetica-web-1 rm /data/sites-extra/dtechmed.caddy` e me chame. Enquanto a portaria não reler, nada mudou para ninguém.

### 8.5 — Faça a portaria reler

Primeiro a via sem interrupção nenhuma:

```bash
docker kill -s USR1 portal-da-estetica-web-1
sleep 3
curl -sI https://SEU_DOMINIO | head -1
```

`USR1` é o sinal que manda o Caddy reler a configuração sem derrubar conexão nenhuma. Se responder `HTTP/2 200`, acabou — os vizinhos nem perceberam.

**Só se o `curl` não responder 200**, use o reinício:

```bash
docker restart portal-da-estetica-web-1
sleep 5
curl -sI https://SEU_DOMINIO | head -1
```

> **Por que o reinício é o segundo caminho.** O Caddyfile do vizinho tem `admin off`, o que desliga a API por onde o `caddy reload` normalmente fala. O `USR1` não depende dela, mas se por algum motivo não pegar, reiniciar é a única saída — e aí são **2 a 4 segundos** em que os três sites ficam fora do ar. É o único momento do deploy inteiro que afeta os vizinhos, é medido em segundos, e por isso vale escolher a hora: fim de noite, não meio-dia.

**Confira os três sites, nesta ordem:**

```bash
curl -sI https://minhamecanica.online | head -1        # vizinho 1
curl -sI https://portaldaestetica.com.br | head -1     # vizinho 2
curl -sI https://SEU_DOMINIO | head -1                 # nosso
docker ps --format '{{.Names}}\t{{.Status}}' | grep -v dtechmed | wc -l   # tem que dar 15
```

Os vizinhos primeiro, de propósito: se algo tiver dado errado, é neles que precisamos saber antes.

Se o nosso responder 502, quase sempre é a aplicação não estar respondendo em `172.17.0.1:5400` — confira com `curl -s -o /dev/null -w '%{http_code}' http://172.17.0.1:5400/api/health`, que o `infra/subir.sh` também verifica.

---

## Passo 9 — Certificado TLS

Não há passo a executar: o Caddy emite e renova o certificado da Let's Encrypt sozinho, na primeira visita ao domínio. É por isso que o passo 8 já testa com `https://`.

**Confira que o certificado é real, não o autoassinado de emergência:**

```bash
echo | openssl s_client -connect conexevolution.online:443 -servername conexevolution.online 2>/dev/null \
  | openssl x509 -noout -issuer -dates
# issuer= ... Let's Encrypt ...  e uma data de validade uns 90 dias a frente
```

Se aparecer `issuer= ... Caddy Local Authority`, o certificado público **não** foi emitido — quase sempre é DNS que ainda não propagou ou porta 80 fechada no firewall. O sistema funciona, mas o navegador do cliente vai acusar site inseguro.

**Confira os cabeçalhos de segurança**, que vêm da aplicação e não da portaria:

```bash
curl -sI https://conexevolution.online | grep -iE 'strict-transport|content-security|x-frame|nosniff|^server'
# HSTS, CSP com nonce, X-Frame-Options: SAMEORIGIN, X-Content-Type-Options: nosniff
# e NENHUMA linha "server:"
```

> **O que perdemos ao trocar nginx por Caddy:** o limite de taxa na porta de entrada (12 tentativas de login por minuto por IP) não existe no Caddy sem plugin. A proteção continua, mas uma camada adiante: a aplicação trava a conta na 6ª tentativa e o IP na 9ª, dentro de uma janela de 15 minutos — comportamento medido na auditoria, seção 6. A diferença prática é que o custo de recusar uma tentativa agora é pago pelo Node em vez de morrer na borda. Com 90 usuários simultâneos isso é irrelevante; se um dia virar problema, o caminho é o plugin `caddy-ratelimit` na portaria.

---

## Passo 10 — Endurecimento final do servidor

Três itens que a auditoria apontou e que só podem ser aplicados aqui.

```bash
cd /opt/gavetas/DTECHMED

# SEC-007 — o dono do banco não precisa criar bancos em produção.
docker compose -p dtechmed exec db \
  psql -U dtechmed_owner -d dtechmed -c "ALTER ROLE dtechmed_owner NOCREATEDB;"

# SEC-008 — anexos legíveis só pelo dono. A VPS é compartilhada.
docker compose -p dtechmed exec app sh -c "chmod 700 /app/storage"

# SEC-009 — já resolvido: a portaria barra método incomum antes da aplicação.
```

**Confira:**

```bash
docker compose -p dtechmed exec db psql -U dtechmed_owner -d dtechmed -c \
  "SELECT rolname, rolsuper, rolbypassrls, rolcreatedb FROM pg_roles WHERE rolname LIKE 'dtechmed%';"
# dtechmed_app   → f | f | f
# dtechmed_owner → f | f | f

curl -s -o /dev/null -w "%{http_code}\n" -X TRACE https://conexevolution.online
# 405
```

Se você ainda não rodou as duas ferramentas que o ambiente de auditoria bloqueou, é aqui:

```bash
# Vulnerabilidades na imagem e nas dependências
docker run --rm -v /var/run/docker.sock:/var/run/docker.sock \
  aquasec/trivy image dtechmed-app:latest

curl -sSfL https://raw.githubusercontent.com/google/osv-scanner/main/install.sh | sh
osv-scanner --lockfile=/opt/gavetas/DTECHMED/package-lock.json
```

---

## Passo 11 — Conecte o WhatsApp

1. Entre em `https://conexevolution.online/entrar` com o Super Admin (depois da virada do passo 14, `https://dtechmed.com.br/entrar`).
2. Troque a senha (o sistema exige no primeiro acesso).
3. Vá em **Empresas → Cadastrar empresa** e crie a DTECH MED com o identificador **`dtechmed-lajeado`** — precisa bater com o `SITE_TENANT_SLUG` do `.env`, senão os contatos do site não chegam a lugar nenhum.
4. Entre com o usuário administrador que você acabou de criar.
5. Vá em **WhatsApp → Conectar o WhatsApp**.
6. Leia o QR Code no celular da empresa: **WhatsApp → Aparelhos conectados → Conectar aparelho**.

**Confira:** a tela mostra **conectado** e o número aparece. Clique em **Atualizar status** para ter certeza de que veio do provedor, e não da tela.

> Enquanto o número não conecta, nada se perde: os avisos ficam enfileirados e saem assim que a conexão subir.

---

## Passo 12 — Ensaie a restauração do backup

**Este passo não é opcional.** Backup que nunca foi restaurado não é backup, é esperança. Descobrir que o dump está quebrado no dia em que você precisa dele é o pior momento possível.

```bash
cd /opt/gavetas/DTECHMED

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

## Passo 13 — Confira o sistema de ponta a ponta

Faça isto **você mesmo**, pelo navegador, antes de entregar para a equipe:

| # | O quê | Onde |
|---|---|---|
| 1 | O site abre e a hero aparece | `https://conexevolution.online` |
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

## Passo 14 — A virada do domínio

Só depois de os 14 itens acima passarem no endereço de ensaio. Antes disso, virar o domínio é trocar um site que funciona por um que você ainda não conferiu.

O endereço é o `dtechmed.com.br`, sem `www`. Mas o `www` também precisa abrir, e o endereço de ensaio precisa continuar de pé por mais uma semana.

### O desenho: um atende, um aponta

| Endereço | O que faz |
| --- | --- |
| `dtechmed.com.br` | **atende o site** |
| `www.dtechmed.com.br` | 301 para `dtechmed.com.br` |

Durante a virada o endereço de ensaio (`conexevolution.online`) atende junto, para haver um caminho funcionando enquanto o DNS do domínio novo propaga. Ele sai no passo 14.7.

Quem digitar qualquer um dos dois cai no site. A diferença é invisível para a pessoa e decisiva para o Google.

> **Por que o `www` não serve o site junto.** Para o buscador, endereço diferente é página diferente até prova em contrário. Duas cópias da mesma home competindo entre si, e a reputação que o site leva meses construindo dividida em vez de somada. O sintoma é o pior tipo: o site funciona perfeitamente enquanto vai ficando para trás na busca, e nada em lugar nenhum acusa erro.
>
> O `301` é o código que diz "mudou de casa, e é definitivo". O buscador transfere a reputação para o destino e passa a mostrar só ele.
>
> **O escolhido é o `.com.br`, sem `www`.** Empresa brasileira, atendimento em Lajeado, cliente que procura no Google digita `.com.br`.
>
> **E o `.com`?** Foi considerado e ficou de fora, por decisão do dono. Se um dia entrar, o lugar dele é o bloco de redirecionamento do `infra/caddy/dtechmed.caddy`, junto do `www` — e só **depois** de o DNS dele apontar para esta máquina. Nome escrito lá sem DNS apontando para cá faz o Caddy tentar emitir certificado repetidamente para um endereço que nunca valida: barulho no log de uma peça compartilhada, e pedidos recusados que contam para o limite da Let's Encrypt.

🚨 **Antes de qualquer comando, entenda o que este passo faz.** Se o `dtechmed.com.br` hoje abre o site antigo da empresa, virar o DNS **derruba o site antigo** e coloca este no lugar. Não há meio-termo e não há volta imediata: desfazer é outra troca de DNS, com o mesmo tempo de propagação. Confira o que está no ar hoje antes de mexer:

```bash
dig +short dtechmed.com.br
curl -sI https://dtechmed.com.br | head -1
```

Se o primeiro `dig` devolver um IP que não é `169.58.76.233`, é lá que o site antigo mora. Guarde esse endereço num papel: é para ele que você volta se precisar desfazer.

### 14.1 — Prepare a gaveta para o novo endereço

```bash
cd /opt/gavetas/DTECHMED
git pull
bash infra/virar-dominio.sh dtechmed.com.br conexevolution.online   # o de ensaio sai no 14.7
```

O primeiro domínio é o principal: vai no `APP_URL` e é para ele que a portaria manda o `www`. Os demais entram só na lista de origens aceitas, cada um com e sem `www`. O endereço de ensaio **fica na lista** — enquanto o DNS propaga os dois respondem, e quem estiver com a aba antiga aberta não toma 403 no meio de um orçamento.

O script guarda uma cópia do `.env` anterior, mostra o antes e o depois, e **não sobe nada**.

> **Por que um script e não o `nano`.** A lista de origens precisa das versões com `www`. Alguns clientes de terminal e de chat convertem qualquer texto começando com `www.` num link, com colchetes e parênteses em volta — foi o que derrubou os três sites da máquina uma vez, num `sed` que parecia inofensivo. Aqui os nomes com `www` são **montados pelo script** a partir do domínio raiz que você digitou; eles nunca passam pela área de transferência.
>
> Num `.env` esse erro é pior que no Caddy, porque não derruba nada na hora: a aplicação sobe, o site abre, e só o formulário de contato passa a devolver 403 para todo mundo, dias depois, sem ninguém ligar uma coisa à outra.

Agora suba com **reconstrução**, e não só um `up -d`:

```bash
bash infra/subir.sh
```

> **Por que reconstruir, e não só reiniciar.** O `APP_URL` é o endereço que o site declara ao Google como o verdadeiro dele. Uma parte disso é resolvida quando a imagem é construída — e uma imagem antiga carregaria o domínio velho para dentro do site novo, sem erro nenhum, sem sintoma nenhum, até alguém abrir o Search Console semanas depois.
>
> O `infra/subir.sh` reconstrói, confere as 11 variáveis obrigatórias, confere o banco, confere os vizinhos antes e depois — e **imprime o `APP_URL` na tela**. Leia essa linha. Ela existe para este momento.

**Confira que o endereço novo pegou:**

```bash
curl -s http://127.0.0.1:5400/robots.txt | grep -i host
curl -s http://127.0.0.1:5400/sitemap.xml | grep -o '<loc>[^<]*</loc>'
```

Os dois têm que dizer `https://dtechmed.com.br`. Se ainda disserem `conexevolution.online`, o `.env` não foi salvo ou o `subir.sh` não chegou ao fim — **pare aqui**, porque é exatamente isso que o Google vai ler.

### 14.2 — Vire o DNS

No painel do `dtechmed.com.br` — normalmente o **Registro.br** — aponte para `169.58.76.233`:

| Tipo | Nome | Valor |
| --- | --- | --- |
| A | `@` | `169.58.76.233` |
| A | `www` | `169.58.76.233` |

Se o painel deixar escolher o TTL, coloque **300** antes de trocar. É o tempo que o mundo guarda a resposta antiga; com 300 segundos, um erro se conserta em cinco minutos em vez de em um dia.

Espere propagar — pode levar de minutos a algumas horas:

```bash
dig +short dtechmed.com.br      # 169.58.76.233
dig +short www.dtechmed.com.br  # 169.58.76.233
```

**Só siga quando os dois devolverem o IP da VPS.** O Caddy só consegue emitir certificado para um domínio que já aponta para cá; instalar antes é pedir certificado para uma casa onde ele ainda não mora, e o pedido falha.

> **Neste intervalo o `dtechmed.com.br` fica fora do ar.** O DNS já aponta para cá e a portaria ainda não conhece o nome — são os minutos entre o passo 14.2 e o 14.3. Por isso os dois se fazem em sequência, sem pausa para o café, e de madrugada. O `conexevolution.online` continua respondendo o tempo todo.

### 14.3 — Ensine a portaria os nomes novos

Os nomes já estão escritos dentro de `infra/caddy/dtechmed.caddy`, prontos, e chegaram pelo `git reset` do passo 14.1. **Não os edite pelo terminal** — o motivo está no passo 8.2, e o preço de errar aqui são os três sites da máquina juntos.

Um comando só:

```bash
cd /opt/gavetas/DTECHMED && bash infra/publicar-dominio.sh
```

> **Por que este passo é script, e todo o resto do guia é comando.** Tudo o mais mexe só na nossa gaveta. Este mexe na **portaria**, da qual dependem outros dois sistemas — uma configuração que o Caddy não consiga carregar derruba os três sites juntos.
>
> Feito à mão, a proteção é a pessoa: ela lê a saída do `validate`, decide se está bom, e se algo der errado depois da recarga ela precisa lembrar dos comandos de desfazer, na ordem certa, com o site fora do ar e o telefone tocando. Isso não é proteção, é esperança.
>
> O script guarda a configuração atual antes de tocar em nada, fotografa os vizinhos, recusa o arquivo se ele tiver colchete fora de comentário, restaura e sai se o `validate` recusar (a portaria nem chega a reler), e — depois da recarga — confere os vizinhos de novo e **desfaz sozinho** se algum caiu. O pior caso deixa de ser "três sites fora do ar até alguém acordar" e passa a ser "trinta segundos e tudo como estava".

Ele para sozinho, sem tocar na portaria, se qualquer uma destas não passar:

| Conferência | Por que ela existe |
| --- | --- |
| a aplicação responde em `172.17.0.1:5400` | publicar antes disso troca "site antigo" por "502" |
| `robots.txt` e `sitemap.xml` declaram o `APP_URL` | é o endereço que o Google vai indexar |
| nenhum colchete fora dos comentários | é a assinatura do texto que passou por um cliente que transforma `www.` em link |
| a portaria está rodando | erro de nome do contêiner é o engano mais comum aqui |

**O que fazer com cada final:**

- **Terminou com "Pronto"** — acabou. Siga para o 14.6.
- **Parou antes de instalar** — nada foi tocado, os três sites seguem como estavam. A mensagem diz o que corrigir.
- **Desfez sozinho** — a portaria voltou ao estado anterior e recarregou. Me chame com a saída inteira.
- **Saiu com "ainda não respondeu 200"** — quase sempre é o certificado saindo. Espere dois minutos e rode `curl -sI https://dtechmed.com.br | head -1`.

Para voltar atrás depois, com tudo funcionando:

```bash
bash infra/publicar-dominio.sh --desfazer
```

### 14.4 — Se precisar fazer à mão

O script faz isto, nesta ordem. Está aqui para quando você quiser entender o que ele fez, ou fazer passo a passo:

```bash
# guarda o que está lá hoje
docker exec portal-da-estetica-web-1 cp /data/sites-extra/dtechmed.caddy /data/sites-extra/.dtechmed.caddy.anterior

docker cp infra/caddy/dtechmed.caddy portal-da-estetica-web-1:/data/sites-extra/dtechmed.caddy
docker exec portal-da-estetica-web-1 caddy validate --config /etc/caddy/Caddyfile
# tem que terminar com "Valid configuration"

docker kill -s USR1 portal-da-estetica-web-1
sleep 6
curl -sI https://dtechmed.com.br | head -1
```

`USR1` manda o Caddy reler sem derrubar uma conexão sequer, e não depende da API de administração — que neste Caddy está desligada com `admin off`.

🚨 **Se o `validate` falhar, PARE** e restaure antes de qualquer outra coisa:

```bash
docker exec portal-da-estetica-web-1 cp /data/sites-extra/.dtechmed.caddy.anterior /data/sites-extra/dtechmed.caddy
docker exec portal-da-estetica-web-1 caddy validate --config /etc/caddy/Caddyfile
```

Enquanto a portaria não reler, nada mudou para ninguém.

### 14.5 — Confira, nesta ordem

Os vizinhos primeiro, de propósito: se algo deu errado, é neles que precisamos saber antes.

```bash
curl -sI https://minhamecanica.online | head -1        # vizinho 1 — HTTP/2 200
curl -sI https://portaldaestetica.com.br | head -1     # vizinho 2 — HTTP/2 200
docker ps --format '{{.Names}}' | grep -vc dtechmed    # tem que dar 15
```

Agora o nosso. O endereço que atende:

```bash
curl -sI https://dtechmed.com.br | head -1             # HTTP/2 200
curl -sI https://conexevolution.online | head -1       # HTTP/2 200
```

E o que aponta. Tem que devolver `301` **e** um `location` para `https://dtechmed.com.br`:

```bash
curl -sI https://www.dtechmed.com.br | grep -iE '^HTTP|^location'
```

O caminho e a busca precisam atravessar o redirecionamento inteiros — é o que garante que um link de ordem de serviço mandado por WhatsApp com o domínio `.com` continue abrindo a ordem certa, e não a home:

```bash
curl -sI "https://www.dtechmed.com.br/os/teste123?x=1" | grep -i '^location'
# location: https://dtechmed.com.br/os/teste123?x=1
```

Os certificados, um por endereço:

```bash
for D in dtechmed.com.br www.dtechmed.com.br; do
  printf '%-24s ' "$D"
  echo | openssl s_client -connect $D:443 -servername $D 2>/dev/null \
    | openssl x509 -noout -issuer
done
# os dois: issuer= ... Let's Encrypt ...
```

Se algum disser `Caddy Local Authority`, o certificado público daquele nome não saiu — quase sempre é DNS que ainda não propagou. Espere e repita; o Caddy tenta sozinho.

Por fim, o endereço que o site declara ao Google:

```bash
curl -s https://dtechmed.com.br/robots.txt | grep -i host
curl -s https://dtechmed.com.br/sitemap.xml | grep -o '<loc>[^<]*</loc>'
curl -s https://dtechmed.com.br | grep -o '<link rel="canonical"[^>]*>'
```

Os três têm que dizer `https://dtechmed.com.br`.

### 14.6 — Avise o Google

O Caddy já contou aos navegadores. Falta contar ao buscador, e isso é no [Search Console](https://search.google.com/search-console):

1. **Cadastre a propriedade.** Escolha **Prefixo do URL** e digite `https://dtechmed.com.br`.
2. **Prove que o site é seu.** Na lista de métodos, escolha **Tag HTML**. O Google mostra uma linha assim:

   ```html
   <meta name="google-site-verification" content="AbC123..." />
   ```

   Copie **só o que está entre as aspas do `content`**, entre no sistema em **Site → Busca do Google → Código de verificação do Google**, cole e salve. Volte ao Search Console e clique em **Verificar**.

   > Este campo existe para você não precisar do terminal nem de mim para uma coisa que leva trinta segundos. Ele mora no conteúdo do site, junto do título e da descrição da busca, e vale imediatamente depois do salvar — sem publicação, sem reiniciar nada. Vazio, nenhuma etiqueta é escrita na página.

3. **Envie o sitemap.** Em **Sitemaps**, digite `sitemap.xml` e envie.
4. **Se o site antigo tinha propriedade no Search Console**, entre nela e use **Configurações → Mudança de endereço** apontando para `dtechmed.com.br`. É o que acelera a transferência da reputação; sem isso o 301 funciona igual, só demora mais.
5. **No Google Meu Negócio, troque o site do perfil** para `https://dtechmed.com.br`. Este é o item que mais custa dinheiro se ficar esquecido: para assistência técnica local, o perfil costuma trazer mais visita que a busca — e enquanto não for trocado, ele continua mandando cliente para o endereço velho.

### 14.7 — Aposente o endereço de ensaio

Com o `dtechmed.com.br` estável, tire o `conexevolution.online` de circulação.

> **Por que isto não é opcional.** Endereço de ensaio deixado no ar é uma porta a menos vigiada apontando para o mesmo sistema: o mesmo login, o mesmo painel, os mesmos dados de cliente, num nome que ninguém mais olha. E no dia em que o registro daquele domínio expirar, é uma porta que outra pessoa pode registrar e passar a controlar.
>
> **O que se perde.** Quem tiver link antigo apontando para o endereço de ensaio — um orçamento mandado por WhatsApp, uma aba aberta — perde o acesso na hora. Ele deixa de responder por completo, e não redireciona: um endereço de ensaio que continua respondendo, mesmo que só para mandar embora, continua sendo um nome vivo apontando para cá.

O nome já saiu do arquivo do Caddy no repositório. Na VPS:

```bash
cd /opt/gavetas/DTECHMED
git pull
```

🚨 **O `git pull` vem primeiro, e não é formalidade.** O `publicar-dominio.sh` desfaz sozinho quando um endereço que estava de pé para de responder depois da recarga — e é exatamente isso que esta mudança faz com o endereço de ensaio. Sem a correção que trata os nomes do arquivo instalado como nossos, o script reverteria esta remoção achando que tinha derrubado o site de um vizinho.

```bash
bash infra/virar-dominio.sh dtechmed.com.br
bash infra/subir.sh
bash infra/publicar-dominio.sh
```

O primeiro tira o nome da lista de origens aceitas, o segundo reconstrói, o terceiro reinstala a portaria. No fim, o passo 9 tem que listar **só** o `www.dtechmed.com.br`.

**Confira que ele realmente saiu:**

```bash
curl -sI https://conexevolution.online | head -1   # tem que falhar ou dar 404
curl -sI https://dtechmed.com.br | head -1        # HTTP/2 200
```

Por último, **remova os registros A do `conexevolution.online` no painel de DNS**. Enquanto eles apontarem para esta máquina, o nome continua chegando na portaria — só que sem ninguém para atendê-lo.

### Se precisar desfazer

Nada aqui é irreversível, mas o DNS tem o tempo dele.

**Se você ainda está no meio da virada** (passos 14.3 a 14.5), o caminho é um comando:

```bash
cd /opt/gavetas/DTECHMED && bash infra/publicar-dominio.sh --desfazer
```

Ele restaura a configuração que a portaria tinha antes e manda reler. O endereço de ensaio volta a atender, e o `dtechmed.com.br` para de responder.

**Se você já passou do 14.7** e o endereço de ensaio foi aposentado, não existe mais para onde voltar sozinho — o desfazer restauraria uma configuração que também não o atende. Aí o caminho é o inverso da virada, e leva o tempo do DNS:

```bash
# 1. A portaria volta a não conhecer os nomes novos (5 segundos)
docker exec portal-da-estetica-web-1 rm /data/sites-extra/dtechmed.caddy
docker exec portal-da-estetica-web-1 caddy validate --config /etc/caddy/Caddyfile
docker kill -s USR1 portal-da-estetica-web-1

# 2. O DNS do dtechmed.com.br volta para o IP que você anotou no começo do
#    passo 14, no painel do domínio, à mão (minutos a horas).
```

O site antigo volta quando o DNS propagar. **É por isso que o IP anotado no início do passo 14 importa:** sem ele, esta é uma volta que não tem como ser feita.

---

## Operação do dia a dia

### Ver o que está acontecendo

```bash
cd /opt/gavetas/DTECHMED
docker compose -p dtechmed logs -f app        # aplicação
docker compose -p dtechmed logs -f worker     # fila de WhatsApp e PDF
docker compose -p dtechmed ps                 # saúde dos serviços
```

### Atualizar o sistema

```bash
cd /opt/gavetas/DTECHMED
git pull
docker compose -p dtechmed up -d --build
bash infra/migrador.sh
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
| **Login recusa todo mundo** | Confira se as migrações rodaram: `bash infra/migrador.sh npx prisma migrate status`. |

---

## O que não fazer

- **Não** rode `prisma migrate reset` na VPS. Ele apaga o banco inteiro.
- **Não** troque `ENCRYPTION_KEY` nem `DOCUMENT_HASH_SALT` depois que o sistema estiver em uso.
- **Não** exponha a porta 5433 (o banco) para fora do `127.0.0.1`. A 5400 fica também em `172.17.0.1` de propósito — é por ali que a portaria chega até nós, e é um endereço interno da máquina, não da internet.
- **Não** instale nginx nesta VPS. As portas 80 e 443 já são do Caddy do PORTAL_ESTETICA; disputar por elas derruba os três sites.
- **Não** edite o `Caddyfile` do vizinho. Nosso bloco vive em `/data/sites-extra/dtechmed.caddy`, que é o ponto de extensão que ele mesmo declara.
- **Não** rode `docker compose down` fora de `/opt/gavetas/DTECHMED`, e nunca `docker stop $(docker ps -q)` nem `docker system prune -a` — os três derrubam ou apagam as gavetas vizinhas junto.
- **Não** use `DIRECT_DATABASE_URL` na aplicação — ela é só das migrações.
- **Não** volte o repositório para público.
- **Não** edite dado direto no banco. A linha do tempo é encadeada por hash: mexer nela deixa rastro, e o prontuário passa a mostrar "histórico alterado" para sempre.

---

## Referência rápida

| Item | Valor |
|---|---|
| Diretório da gaveta | `/opt/gavetas/DTECHMED` |
| Nome do projeto Docker | `dtechmed` |
| Aplicação (loopback) | `127.0.0.1:5400` |
| Banco (loopback) | `127.0.0.1:5433` |
| Volumes | `dtechmed_pgdata`, `dtechmed_storage`, `dtechmed_backups` |
| Migração e semeadura | `bash infra/migrador.sh` |
| Rede | `dtechmed_net` |
| Bloco da portaria | `/data/sites-extra/dtechmed.caddy` no `portal-da-estetica-web-1` |
| Retenção de backup | 14 dias (ajustável no `.env`) |

Relatório de segurança completo, com o que foi corrigido e o que ficou para o servidor: **[AUDITORIA_SEGURANCA.md](./AUDITORIA_SEGURANCA.md)**.

---

## Google Tag Manager e o tráfego pago

O contêiner **não fica no código nem no `.env`**. Ele é um campo do editor do
site: **Painel → Site → aba "Busca do Google" → Google Tag Manager**. Trocar o
contêiner é digitar e salvar; não precisa publicar nada nem entrar na VPS. Campo
vazio desliga: nenhum script do Google é escrito na página.

Fica ali de propósito — quando isto virar franquia, cada unidade anuncia a sua
região com o próprio contêiner, e uma variável de ambiente seria uma só para o
servidor inteiro.

**A tag roda SÓ na home pública.** O painel, os aplicativos de campo e o link
`/os/<token>` ficam de fora, e o motivo do terceiro é o mais forte: aquela URL
**é a credencial do cliente**. Quem tem o link abre a ordem inteira. Um pageview
mandaria essa URL para o Google, e não há como recolher depois.

### Os eventos de conversão — o que o site já manda pronto

GTM sozinho mede **visita**. Visita não otimiza campanha: o Google Ads precisa
saber quais cliques viraram contato para aprender a quem mostrar o anúncio.

O site empurra três eventos no `dataLayer`. Falta só criar o gatilho de cada um
dentro do GTM (**Acionadores → Novo → Evento personalizado**, com o nome exato):

| Nome do evento | Quando dispara | O que vem junto |
|---|---|---|
| `lead_formulario` | O formulário de retirada foi **aceito** | `canal`, `origem` |
| `contato_whatsapp` | Clique em qualquer botão/link de WhatsApp | `canal`, `origem`, `assunto` |
| `clique_telefone` | Clique num número de telefone | `canal`, `origem` |

**`lead_formulario` é a conversão principal** — e é a única que o GTM **não
conseguiria medir sozinho de jeito nenhum**. O formulário é uma Server Action do
React: não existe o envio clássico que o gatilho nativo "Form Submission"
escuta, e a página nem recarrega. Se um dia esse evento sumir do código, a
melhor conversão do site fica invisível sem nenhum aviso.

Ele dispara **no sucesso**, não no clique: formulário recusado por telefone
inválido não é lead, e contar como se fosse ensina a campanha a comprar o clique
errado.

**`origem`** diz de onde partiu o clique — `primeira-dobra`, `servicos`,
`a-empresa`, `solicitar`, `onde-estamos`, `rodape`, `flutuante`. É o que
responde "qual botão traz cliente" e permite cortar o que não converte.
**`assunto`** só vem do botão flutuante, e é o rótulo escolhido na antessala
("Quero um orçamento", "Meu equipamento parou"…).

Para usar no Ads: crie a variável de camada de dados (`origem`, `assunto`) em
**Variáveis → Nova → Variável da camada de dados** e mande como parâmetro do
evento de conversão.

> **Nada de dado pessoal sai daqui.** Nome, telefone, e-mail e documento **não**
> entram no `dataLayer` — nem parcialmente. O que vai para o Google é o fato de
> ter havido um contato e de qual botão. É a diferença entre medir campanha e
> mandar a sua base de clientes para um terceiro, e a LGPD trata as duas de
> forma bem diferente. Se um dia alguém pedir "manda o telefone junto para casar
> a conversão", a resposta é não.

Um botão de WhatsApp novo, criado depois, **já nasce medido**: a escuta é única
e delegada (`src/app/medir-cliques.tsx`), não é um `onClick` por botão.

### Quando você adicionar um fornecedor novo dentro do GTM

Este site roda com Content-Security-Policy fechada. Gerenciador de tag e CSP
querem coisas opostas por desenho: o GTM existe para o marketing acrescentar um
fornecedor sem tocar no código, e a CSP existe para nenhum pixel que ninguém
declarou sair falando com o mundo.

Já estão liberados o **próprio GTM**, o **Google Analytics 4** e as **conversões
do Google Ads**. Um fornecedor de fora dessa lista — Meta Pixel, TikTok, Hotjar,
RD Station — é **bloqueado**, e o sintoma é este, no console do navegador (F12):

```
Refused to connect to 'https://connect.facebook.net/…' because it violates
the following Content Security Policy directive: "connect-src 'self' …"
```

A correção é uma linha em `src/middleware.ts`, na constante `GOOGLE`: acrescente
o domínio na lista certa (`script`, `img`, `conexao` ou `moldura`, conforme o que
a mensagem disser) e publique. Se preferir, me mande a mensagem do console que eu
digo em qual lista ele entra.

Isso é chato de propósito. O contrário — abrir tudo — significa que qualquer
pessoa com acesso ao GTM pode fazer o site falar com qualquer servidor do mundo
sem passar por ninguém, e o GTM é exatamente onde código de terceiro entra na
velocidade do marketing.

---

## Conferir o dinheiro, todo fechamento de mês

Seis perguntas cuja resposta certa é sempre **zero**. Somente leitura — nenhuma linha é alterada.

```bash
cd /opt/gavetas/DTECHMED
docker exec -i dtechmed_db psql -U dtechmed_owner -d dtechmed < scripts/conferir-dinheiro.sql
```

Ela procura fatura com valor diferente do orçamento aprovado, quitação com valor errado, soma de pagamentos que não bate, fatura órfã, status desalinhado com os números, e fatura duplicada. Nenhuma dessas divergências dá erro na tela: todas aparecem semanas depois como "o relatório não fecha".

---

## Antes do primeiro cliente de verdade — tirar os dados de demonstração

⚠️ **Faça isto ANTES de preencher o `UAZAPI_ADMIN_TOKEN`.**

O cenário de demonstração atravessou o motor de verdade, e cada mudança de etapa **enfileirou um aviso de WhatsApp**. São **196 mensagens PENDENTE** paradas na fila, e elas só não saíram porque não há token configurado. No instante em que houver, o worker dispara todas — para os telefones do cenário, que têm cara de número real de Lajeado.

Comece pelo relatório, que **não apaga nada**:

```bash
cd /opt/gavetas/DTECHMED
bash infra/migrador.sh npx tsx scripts/limpar-demo.mts
```

Ele lista, lado a lado, **o que sai** e **o que fica**. Leia a coluna do que fica: é ali que você confere que nenhuma ordem sua de verdade está na lista de exclusão. Quando estiver de acordo:

```bash
bash infra/migrador.sh npx tsx scripts/limpar-demo.mts --apagar
```

| Detalhe | Como se comporta |
|---|---|
| **O que ele considera falso** | Os quatro clientes pelos CNPJ do `prisma/seed.ts`, as peças pelos SKU, e as ordens por pertencerem àqueles clientes. O que não casa não é tocado. |
| **A equipe fictícia** | Fica, por padrão. Só sai com `--apagar-equipe` — não dá para o script saber se Camila, Rafael e os outros são pessoas de verdade já usando o sistema. |
| **A numeração** | Volta para o maior número que sobrou, não para zero. Numa instalação nova isso dá zero, e a primeira O.S. de verdade nasce como a nº 1. |
| **Arquivos no disco** | As pastas de fotos e assinaturas das ordens falsas são removidas junto — senão o banco fica limpo e o disco não. |
| **Rodar duas vezes** | Inofensivo. |

> **Sobre as senhas.** A semeadura grava a mesma senha (`Dtech@2026`, escrita no repositório) em todas as contas da equipe, e nenhuma delas nasce obrigada a trocar. O script confere isso de verdade — com a mesma função do login, não pelo cadastro — e avisa quais contas ainda entram com ela. Apagar dado falso e deixar esses logins abertos é limpar a vitrine e deixar a porta destrancada.
