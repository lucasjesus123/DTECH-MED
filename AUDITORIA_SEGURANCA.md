# Auditoria de segurança — DTECH MED

**Data:** 13 de agosto de 2026
**Escopo:** repositório `lucasjesus123/DTECH-MED`, branch `claude/dtech-med-technical-management-mta9r4`, commit `8069c2a`
**Ambiente analisado:** desenvolvimento local (Node 22, PostgreSQL 16), aplicação em modo de produção (`npm run build && npm start`)
**Natureza:** revisão de código, configuração e comportamento em execução. **Nenhum teste ofensivo contra terceiros.**

---

## Como ler este documento

Cada afirmação está marcada com uma destas três etiquetas:

| Etiqueta | Significado |
|---|---|
| **FATO** | Verificado nesta auditoria, com o comando e a saída registrados aqui. |
| **HIPÓTESE** | Conclusão derivada de leitura de código ou de comportamento conhecido da plataforma, **sem** execução que a comprove. |
| **NÃO VERIFICADO** | Fora do alcance desta auditoria. Está listado para não parecer coberto. |

Nada aqui foi marcado como seguro sem evidência. Onde a evidência não existe, está escrito que não existe.

---

## 1. Sumário executivo

O sistema foi construído com o isolamento entre empresas como primeira preocupação, e **essa parte se sustentou nos testes**: a aplicação, no papel de banco que usa em produção, não enxerga uma linha sequer de outra franquia sem que o escopo seja aberto explicitamente. Tentativas diretas de alcançar ordem, foto e documento de outra empresa — estando logado e com o identificador correto em mãos — devolveram 404 nas três superfícies.

Ainda assim, a auditoria encontrou **nove problemas**, sendo **quatro de severidade alta**. Três deles têm a mesma origem, e vale nomeá-la: *o código afirma uma propriedade que a implementação não tem*. O comentário da rota de documentos diz que o token é "de alta entropia" — ele tem 41 bits de aleatoriedade, não 256. A migração de endurecimento diz que a trilha de assinaturas é imutável — a aplicação consegue reescrever o nome de quem assinou. O banco tem RLS em todas as tabelas de negócio — e o dono das tabelas passa por cima dele sem esforço.

Dois achados não são de segurança, mas quebram a operação e foram encontrados no mesmo varrimento: a **busca de ordens devolve HTTP 500** para qualquer termo com letras, e os **PDFs enviados ao cliente pelo WhatsApp devolvem 404**. Os dois estão em caminhos que os testes automatizados não cobriam.

Sobre escalabilidade, a medição foi feita com volume real gerado para isto: **30 empresas, 159 usuários, 27 mil ordens**. As consultas do painel ficaram todas **abaixo de 1,2 ms** no banco. Com 90 requisições disparadas ao mesmo tempo na tela mais pesada, o p95 ficou em **2,27 s e nenhum erro** — num contêiner de desenvolvimento compartilhado, que é bem mais fraco que a VPS de destino. O alvo de 30 empresas com 5 usuários cada tem folga larga.

**Recomendação original:** corrigir os quatro achados de severidade alta antes de colocar no ar.

> **Atualização — 13/08/2026.** Numa etapa separada e declarada, feita **depois** de este relatório ser fechado, **sete dos nove achados foram corrigidos e as correções foram verificadas uma a uma**. Os dois restantes dependem do servidor de produção (um comando no banco, uma linha no nginx) e estão no guia de deploy. O detalhe de cada correção, com a medida antes e depois, está na **§11** — inclusive a regressão que a própria correção do SEC-004 causou nas duas superfícies públicas, e que só apareceu porque a verificação não parou no primeiro sinal verde.

### Contagem

| Severidade | Quantidade |
|---|---|
| Crítica | 0 |
| Alta | 4 |
| Média | 3 |
| Baixa | 2 |
| **Total** | **9** |

---

## 2. Stack identificada

**FATO** — levantado de `package.json`, `prisma/schema.prisma`, `next.config.ts` e da execução.

| Camada | Tecnologia | Versão |
|---|---|---|
| Runtime | Node.js | 22 (exigido em `engines`) |
| Framework | Next.js (App Router, Server Actions, `output: standalone`) | 16.3.0 |
| Interface | React | 19.2.8 |
| Linguagem | TypeScript (modo estrito) | 5.9.3 |
| Banco | PostgreSQL | 16 |
| ORM | Prisma + `@prisma/adapter-pg` | 7.9.1 |
| Senhas | `@node-rs/argon2` (Argon2id) | 2.0.2 |
| Validação | Zod | 4.4.3 |
| Imagens | sharp | 0.35.3 |
| PDF | pdfkit | 0.16.0 |
| WhatsApp | uazapi (HTTP) | — |
| Testes | Vitest | 3.2.7 |

**Dependências de produção:** 11 diretas, 359 linhas na árvore resolvida.
**Dependências Python:** nenhuma. Não há `requirements.txt`, `pyproject.toml` nem `Pipfile` no repositório.

### Superfícies expostas

| Superfície | Autenticação | Observação |
|---|---|---|
| `/` (site) | nenhuma | Estático. Formulário público de contato. |
| `/entrar` | — | Login. Limite por IP e bloqueio progressivo por conta. |
| `/painel/*` | sessão + papel | Painel de gestão. |
| `/app/motorista`, `/app/tecnico` | sessão + papel | PWAs de campo. |
| `/os/[token]` | token no link | Portal do cliente. Aprovar exige CPF/CNPJ. |
| `/api/documento/[token]` | token no link | PDF. **O token é a única credencial.** |
| `/api/foto/[id]` | sessão | Foto interna da oficina. |
| `/api/health` | nenhuma | Sonda. |

---

## 3. Vulnerabilidades

---

### SEC-001 — Busca de ordens derruba a página com HTTP 500

| | |
|---|---|
| **Severidade** | **Alta** |
| **Categoria** | Disponibilidade / defeito de dados |
| **Arquivo** | `src/server/consultas/listas.ts`, linha 64 |
| **Status** | Corrigido em 13/08/2026 — ver §11 |

**Evidência (FATO).** O arquivo contém um **byte NUL** (`0x00`) onde deveria haver um espaço:

```
$ python3 -c "d=open('src/server/consultas/listas.ts','rb').read(); print(d.count(b'\x00'))"
1

$ file src/server/consultas/listas.ts
src/server/consultas/listas.ts: data          ← reconhecido como binário, não como texto
```

O trecho, com o byte visível:

```
{ cliente: { documento: { contains: soDigitos || '\x00' } } },
```

Comportamento no navegador, logado como administrador:

```
busca "Bella":   HTTP 500 /painel/ordens?busca=Bella&situacao=todas
busca "0001":    4 resultado(s)
busca "Lavieen": HTTP 500 /painel/ordens?busca=Lavieen&situacao=todas
```

**Descrição do risco.** O PostgreSQL não aceita o byte NUL em valores de texto. Quando a busca contém letras, `soDigitos` fica vazio, o operador `||` cai no valor de reserva — que é o NUL — e a consulta explode no driver. Só buscas compostas apenas de números funcionam.

**Cenário de exploração.** Não é exploração: é uso normal. A atendente digita o nome da clínica que ligou e recebe uma tela de erro. Nenhum dado vaza; o efeito é a tela de ordens ficar inutilizável para a busca que as pessoas mais usam.

**Impacto.** A funcionalidade central da tela de ordens não funciona. Um invasor pode usar isso para provocar erro repetido e poluir o log, mas o dano real é operacional.

**Por que passou pelos testes.** Os testes automatizados e o roteiro de navegador exercitaram a lista de ordens **sem termo de busca** ou com o número da O.S. O caminho que quebra é o de texto, que nenhum deles percorria. O achado veio de o `grep` recusar-se a ler o arquivo por considerá-lo binário.

**Como corrigir.** Trocar o byte NUL por um valor que não case com documento nenhum. O ideal é não incluir a cláusula de documento quando a busca não tem dígitos:

```ts
...(soDigitos ? [{ cliente: { documento: { contains: soDigitos } } }] : []),
```

E acrescentar uma verificação de bytes NUL no `npm run typecheck` ou num hook, para o caso não voltar.

---

### SEC-002 — O PDF enviado ao cliente no WhatsApp devolve 404

| | |
|---|---|
| **Severidade** | **Alta** |
| **Categoria** | Controle de acesso / disponibilidade |
| **Arquivo** | `src/app/api/documento/[token]/route.ts`, linha 25 |
| **Status** | Corrigido em 13/08/2026 — ver §11 |

**Evidência (FATO).** A rota consulta o cliente Prisma **sem abrir escopo de empresa**:

```ts
const doc = await prisma.documento.findUnique({
  where: { tokenAcesso: token },
  ...
})
```

Sem `comEscopo`, o `set_config('app.tenant_id', …)` não é aplicado e a policy de RLS da tabela `documentos` filtra tudo. Comprovado no banco com o mesmo token:

```
Rota /api/documento consulta SEM abrir escopo (é o que o código faz):
  linhas devolvidas: 0  ← o cliente recebe 404

A MESMA consulta com o escopo da empresa aberto:
  linhas devolvidas: 1  ← existe, o RLS é que filtrava
```

E pela rota HTTP, com um token válido:

```
$ curl -o /dev/null -w "%{http_code} · %{size_download}" .../api/documento/<token>
404 · 25 bytes        ← corpo "Documento não encontrado"
```

**Descrição do risco.** Todo laudo, orçamento, contrato, ordem de serviço, recibo e comprovante de entrega que o sistema manda ao cliente cai num link morto. Como o worker de PDF não havia rodado nesta sessão, o defeito só apareceria em produção, no primeiro link clicado.

**Cenário de exploração.** Não há exploração — o efeito é o oposto: nega acesso a quem tem direito. Mas o achado é de controle de acesso porque revela que **a rota nunca foi exercitada contra o RLS**; a mesma classe de erro, invertida, produziria vazamento.

**Impacto.** O cliente recebe no WhatsApp um link que não abre. Em disputa, a empresa não consegue apresentar o contrato assinado pelo próprio sistema.

**Como corrigir.** Resolver a empresa a partir do token por função `SECURITY DEFINER` — exatamente o padrão já usado em `app.empresa_do_token()` para o portal — e então abrir `comEscopo` com o id devolvido. O token continua provando o direito àquele documento, sem virar passe livre.

---

### SEC-003 — Token do portal e do documento tem 41 bits de entropia, não 256

| | |
|---|---|
| **Severidade** | **Alta** |
| **Categoria** | Criptografia / controle de acesso |
| **Arquivo** | `prisma/schema.prisma` (`Ordem.tokenPublico`, `Documento.tokenAcesso`) |
| **Status** | Corrigido em 13/08/2026 — ver §11 |

**Evidência (FATO).** Os dois campos usam `@default(cuid())`. O comentário da rota de documentos afirma:

> "o token é a credencial. Por isso ele é opaco e de alta entropia"

Tokens reais gerados pelo sistema:

```
cmsr0ung6001q9z7d9mxucfm4
cmsr0umx4000t9z7d5j3jb8ki
cmsr0ulzx00089z7drk7aulof
cmsr0ulxn00019z7dg1sgl1gl

prefixo idêntico entre todos: 6 de 25 caracteres ("cmsr0u")
sufixo de 8 caracteres (parte aleatória do cuid v1):
  9mxucfm4 · 5j3jb8ki · rk7aulof · g1sgl1gl

entropia da parte aleatória: 8 caracteres base36 = 41 bits
comparação: novoToken() usa randomBytes(32) = 256 bits
```

**Descrição do risco.** O `cuid()` do Prisma é cuid **v1**: um prefixo derivado do relógio, um contador sequencial, uma impressão digital da máquina e apenas 8 caracteres aleatórios. O relógio e o contador são adivinháveis por quem já recebeu um token — todo cliente recebe um. A parte imprevisível é de 41 bits.

O sistema **já tem** a primitiva certa: `novoToken()` em `src/lib/cripto.ts` usa `randomBytes(32)`. Ela é usada nas sessões, mas não nestes dois campos.

**Cenário de exploração.** Um cliente legítimo recebe o link da própria O.S. Do token dele extrai o instante de criação e a impressão digital da instância. Ordens criadas em janela próxima compartilham prefixo e contador vizinho; sobram os 41 bits. Isso é caro para um alvo aleatório, mas **viável para um alvo escolhido** — a ordem de um concorrente aberta no mesmo dia — e o retorno é a linha do tempo, o equipamento, os valores e o PDF do laudo de outra clínica.

**Impacto.** Exposição de dado comercial de cliente de terceiro. Numa franquia, exposição entre franqueados.

**Como corrigir.** Trocar o valor padrão dos dois campos por token de 256 bits gerado pela aplicação (`novoToken()`), gravado explicitamente na criação. Ordens já existentes continuam com o token antigo; se o histórico importar, vale uma migração que regenere os tokens das ordens ainda abertas — os links antigos param de funcionar, o que é aceitável e até desejável.

---

### SEC-004 — O dono das tabelas passa por cima do RLS (falta `FORCE ROW LEVEL SECURITY`)

| | |
|---|---|
| **Severidade** | **Alta** |
| **Categoria** | Isolamento multiempresa |
| **Arquivo** | `prisma/migrations/20260812232600_rls_isolamento_multiempresa/migration.sql` |
| **Status** | Corrigido em 13/08/2026 — ver §11 |

**Evidência (FATO).** Nenhuma das 24 tabelas de negócio tem `relforcerowsecurity`:

```
 tabela              | rls  | forcado | policies
---------------------+------+---------+----------
 agendamentos        | true | false   | 1
 assinaturas         | true | false   | 1
 clientes            | true | false   | 1
 eventos_ordem       | true | false   | 1
 ordens              | true | false   | 1
 …  (todas as 24 iguais: rls=true, forcado=false)
```

E o efeito prático, medido:

```
DONO (dtechmed_owner), sem definir app.tenant_id:
  ordens visíveis: 4

APP (dtechmed_app) sem nenhum escopo definido:
  ordens visíveis: 0  (RLS filtrou tudo)
```

Os papéis estão corretamente restritos — o que **hoje** segura a situação:

```
 rolname          | rolsuper | rolbypassrls | rolcreatedb
------------------+----------+--------------+-------------
 dtechmed_app     | false    | false        | false
 dtechmed_owner   | false    | false        | true
```

**Descrição do risco.** No PostgreSQL, o dono de uma tabela **não é submetido às policies** dela, a menos que a tabela seja marcada com `FORCE ROW LEVEL SECURITY`. Como as tabelas pertencem a `dtechmed_owner`, qualquer conexão com esse papel enxerga e altera tudo, de todas as franquias, ignorando o isolamento inteiro — sem erro, sem aviso, sem rastro.

**Cenário de exploração.** O mais provável não é um invasor: é o próprio deploy. O arquivo `.env` de produção carrega **as duas** URLs, `DATABASE_URL` (app) e `DIRECT_DATABASE_URL` (dono, usada pelas migrações). Colar a URL errada no campo errado — ou um script de manutenção que reaproveite a conexão de migração para uma consulta de negócio — desliga o isolamento silenciosamente. Numa franquia, isso significa um franqueado vendo a carteira do outro, e ninguém percebendo.

**Impacto.** Perda total do isolamento multiempresa, sem sinal visível.

**Como corrigir.** `ALTER TABLE … FORCE ROW LEVEL SECURITY` em todas as tabelas de negócio. A partir daí, nem o dono lê fora do escopo, e um erro de configuração vira erro visível em vez de vazamento silencioso. As migrações continuam funcionando: DDL não passa por RLS.

---

### SEC-005 — A tela de Empresas do Super Admin abre vazia

| | |
|---|---|
| **Severidade** | **Média** |
| **Categoria** | Controle de acesso / defeito funcional |
| **Arquivo** | `src/server/consultas/listas.ts`, função `listarEmpresas()` |
| **Status** | Corrigido em 13/08/2026 — ver §11 |

**Evidência (FATO).** A função consulta `prisma.$queryRaw` direto, sem abrir escopo. A policy de `tenants` exige um dos quatro contextos:

```
 policyname         | cmd    | qual
--------------------+--------+------------------------------------------------------------------
 tenant_self_read   | SELECT | id = app.current_tenant_id() OR app.is_super_admin()
                    |        |   OR app.is_auth_context() OR app.is_worker_context()
```

Sem `comEscopo`, `app.is_super_admin()` é falso. Resultado na tela, logado como Super Admin, com duas empresas no banco:

```
EMPRESAS  0   cadastradas na plataforma
ATIVAS    0   sem suspensão
USUÁRIOS  0   somando todas as franquias
(tabela de empresas vazia)
```

**Descrição do risco.** É o RLS funcionando — mas contra o próprio dono da plataforma. A tela de administração de franquias fica cega: não dá para cadastrar, suspender ou acompanhar nenhuma empresa.

**Impacto.** O módulo de plataforma não opera. Não há vazamento; há indisponibilidade da função mais sensível do produto de franquia.

**Nota positiva (FATO).** Verificado que a tela **não** expõe dado de cliente final mesmo quando funcionar: nenhum nome de clínica e nenhum valor monetário aparece na página. A consulta traz só agregados.

**Como corrigir.** Envolver a consulta em `comEscopo({ tenantId: null, ehSuperAdmin: true, … })`, como já fazem `criarEmpresa` e `alternarBloqueio`.

---

### SEC-006 — A aplicação consegue reescrever uma assinatura já coletada

| | |
|---|---|
| **Severidade** | **Média** |
| **Categoria** | Integridade da trilha de prova |
| **Arquivo** | `prisma/migrations/20260812232600_rls_isolamento_multiempresa/migration.sql` |
| **Status** | Corrigido em 13/08/2026 — ver §11 |

**Evidência (FATO).** Privilégios concedidos ao papel da aplicação:

```
 table_name          | privilegios
---------------------+--------------------------
 assinaturas         | INSERT, SELECT, UPDATE     ← UPDATE presente
 audit_logs          | INSERT, SELECT
 eventos_ordem       | INSERT, SELECT
 movimentos_estoque  | INSERT, SELECT
```

Teste direto, com o escopo correto da empresa:

```
APP tentando alterar o nome de quem assinou:
  linhas alteradas: 1  ← CONSEGUIU

APP tentando alterar um evento da linha do tempo:
  barrado: permission denied for table eventos_ordem
```

**Descrição do risco.** A migração revogou `DELETE` em `assinaturas`, mas não `UPDATE`. A assinatura é justamente a prova de que o cliente entregou o equipamento e de que aprovou o orçamento — e o campo que identifica a pessoa (`assinanteNome`) pode ser reescrito por qualquer caminho da aplicação, incluindo um defeito. Os eventos da linha do tempo, ao lado, estão corretamente protegidos.

**Cenário de exploração.** Requer execução de código na aplicação (defeito explorável ou acesso ao servidor). Não é alcançável por um usuário comum pela interface — não existe tela que atualize assinatura. Por isso a severidade é média e não alta.

**Impacto.** A assinatura perde o valor de prova que o resto do desenho constrói com cuidado.

**Como corrigir.** `REVOKE UPDATE ON assinaturas FROM dtechmed_app`. Nenhum código atual atualiza assinatura, então a revogação não quebra nada — foi conferido.

---

### SEC-007 — O papel dono do banco tem `CREATEDB` em produção

| | |
|---|---|
| **Severidade** | **Média** |
| **Categoria** | Configuração / princípio do menor privilégio |
| **Arquivo** | configuração do banco (não versionada) |
| **Status** | Aberto — comando para a VPS em §11 |

**Evidência (FATO).**

```
 rolname          | rolsuper | rolbypassrls | rolcreatedb | rolcreaterole
------------------+----------+--------------+-------------+---------------
 dtechmed_owner   | false    | false        | true        | false
```

**Descrição do risco.** O `CREATEDB` foi concedido durante o desenvolvimento para o *shadow database* do `prisma migrate dev`. Em produção, quem usa é `prisma migrate deploy`, que **não precisa** dessa permissão. Numa VPS compartilhada com outros dois sistemas, um papel que cria bancos é um papel que pode consumir disco alheio.

**Impacto.** Privilégio além do necessário. Não há caminho de exploração direto pela aplicação — o papel dono não é usado em tempo de execução.

**Como corrigir.** No banco de produção: `ALTER ROLE dtechmed_owner NOCREATEDB`. Manter a permissão apenas no ambiente de desenvolvimento.

---

### SEC-008 — Diretório de anexos legível por qualquer usuário do sistema operacional

| | |
|---|---|
| **Severidade** | **Baixa** |
| **Categoria** | Configuração / VPS compartilhada |
| **Arquivo** | `storage/` (criado em tempo de execução) |
| **Status** | Corrigido em desenvolvimento — repetir na VPS, ver §11 |

**Evidência (FATO).**

```
$ ls -ld storage
drwxr-xr-x 17 root root 4096 Aug 13 04:32 storage
```

**Descrição do risco.** `0755` deixa o diretório e as fotos legíveis por qualquer usuário da máquina. O contexto pesa: a VPS é compartilhada com outros dois sistemas, cada um "em sua gaveta". Se algum deles rodar sob outro usuário e for comprometido, as fotos dos equipamentos e as imagens das assinaturas ficam ao alcance.

**Impacto.** Exposição de imagem de equipamento e de assinatura a um processo vizinho comprometido. **HIPÓTESE:** depende de como os outros dois sistemas rodam na VPS — o que não foi verificado nesta auditoria.

**Como corrigir.** `chmod 700 storage` e garantir que o processo do Node rode sob usuário próprio, não como root. No `docker-compose`, montar o volume com o dono correto.

---

### SEC-009 — Método HTTP não suportado devolve 500 em vez de 405

| | |
|---|---|
| **Severidade** | **Baixa** |
| **Categoria** | Superfície / ruído |
| **Arquivo** | `src/middleware.ts` |
| **Status** | Aberto — tratar no nginx, ver §11 |

**Evidência (FATO).**

```
$ curl -X TRACE http://localhost:3000/     → HTTP 500
```

O middleware tem a lista `METODOS_ACEITOS` e devolve 405 para o que está fora dela, mas o `TRACE` chega ao erro antes disso.

**Descrição do risco.** Um 500 em vez de 405 gera ruído no log e, dependendo do que o servidor devolva no corpo, pode revelar detalhe de pilha. Não foi observado vazamento de pilha na resposta.

**Impacto.** Baixo. Ruído operacional.

**Como corrigir.** Tratar o método no `matcher` do middleware, ou barrar métodos incomuns no nginx antes de chegarem à aplicação.

---

## 4. Resultado das ferramentas automáticas

### 4.1 Ferramentas executadas

**FATO.** As ferramentas não estavam instaladas no ambiente. Foram baixadas para um diretório temporário **fora do repositório** (`scratchpad/ferramentas`), sem alterar `package.json` nem instalar nada de forma permanente no projeto.

| Ferramenta | Versão | Situação |
|---|---|---|
| gitleaks | 8.21.2 | Executada |
| trufflehog | 3.88.0 | Executada |
| semgrep | 1.172.0 | Executada com regras locais (ver 4.5) |
| pip-audit | 2.10.1 | Executada — sem alvo |
| safety | instalada | Não executada — sem alvo |
| npm audit | npm 10.9.7 | Executada |
| **trivy** | — | **Não executada** |
| **osv-scanner** | — | **Não executada** |

**NÃO VERIFICADO — trivy e osv-scanner.** O proxy de saída deste ambiente devolveu `404 Not Found` para os artefatos de release dos dois projetos. Tentativas registradas: trivy v0.57.0, v0.58.0, v0.58.1, v0.59.1 (Linux-64bit e ARM64) e osv-scanner v1.9.1 e v1.9.2. Nenhum baixou. **Recomendo rodar as duas na VPS antes do deploy** — elas cobrem imagem de contêiner e banco OSV, que ficaram fora desta auditoria.

### 4.2 npm audit

**FATO.**

```
$ npm audit
found 0 vulnerabilities

$ npm audit --omit=dev
found 0 vulnerabilities
```

Dependências desatualizadas (não são vulnerabilidades, são versões atrás):

```
Package      Current   Latest
@types/node  22.20.1   26.2.0
pdfkit        0.16.0   0.19.1
typescript     5.9.3    7.0.2
```

### 4.3 gitleaks

**FATO.** Histórico do git — **limpo**:

```
$ gitleaks git .
12 commits scanned.
no leaks found
```

Árvore de trabalho — 22 achados, **todos dentro de `.next/`**, que é artefato de build e está no `.gitignore`. São chaves internas do Next.js em `prerender-manifest.json` e `middleware-manifest.json`, não segredos da aplicação. Nenhum achado em `src/`, `prisma/` ou `scripts/`.

O `.env` foi varrido **separadamente e de propósito**, porque o `gitleaks dir` respeita o `.gitignore` e o teria pulado:

```
$ gitleaks dir <cópia do .env e .env.example>
no leaks found
```

E não está versionado:

```
$ git ls-files --error-unmatch .env
error: pathspec '.env' did not match any file(s) known to git
```

### 4.4 trufflehog

**FATO.**

```
$ trufflehog git file://.
chunks: 682 · bytes: 5.346.056
verified_secrets: 0 · unverified_secrets: 0
```

### 4.5 semgrep

**NÃO VERIFICADO — pacotes de regras da comunidade.** Os conjuntos `p/typescript`, `p/javascript`, `p/nodejs` e `p/secrets` exigem acesso a `semgrep.dev`, que o proxy bloqueou (`403 Forbidden` no túnel). **Recomendo rodar com os pacotes oficiais na VPS.**

**FATO.** Na ausência deles, foi escrito um conjunto local de **12 regras** dirigidas aos riscos concretos deste código: SQL cru sem parâmetro, `tenantId` vindo do cliente, consulta Prisma fora de `comEscopo`, `dangerouslySetInnerHTML`, `eval`/`new Function`, shell com interpolação, comparação de segredo com `===`, hash fraco, aleatório fraco, cookie sem `httpOnly`, caminho de arquivo vindo da URL e segredo indo para o log.

```
Ran 12 rules on 91 files: 12 findings.
```

**Os 12 achados foram verificados um a um e todos são falsos positivos.** Todos vieram da regra `dtm-tenant-vindo-do-formulario`, cujo padrão `{ ..., tenantId: $BODY.tenantId, ... }` casa com qualquer literal que atribua `tenantId` a partir de um objeto — inclusive quando a origem é do servidor. As origens reais, conferidas linha a linha:

| Local | Origem do `tenantId` | Veredito |
|---|---|---|
| `guarda.ts:95` | `ctx.tenantId` (sessão) | falso positivo |
| `sessao.ts:114`, `:151` | `u.tenantId` (banco) | falso positivo |
| `motor.ts:104` | `ordem.tenantId` (linha lida no banco) | falso positivo |
| `worker.ts:132`, `:213` | `job.tenantId` (linha da fila) | falso positivo |
| `motor.integracao.test.ts` (6×) | constante do teste | falso positivo |

Confirmação independente por busca direta: **nenhum ponto do código lê `tenantId` de `FormData`, do corpo do request ou de parâmetro de rota.**

```
$ grep -rn "get('tenantId')\|body.tenantId\|params.tenantId" src --include=*.ts --include=*.tsx
  nenhum
```

As outras 11 regras não produziram achado — inclusive as de `$queryRawUnsafe`, `dangerouslySetInnerHTML`, `eval` e comparação de segredo com `===`.

### 4.6 pip-audit e safety

**FATO.** Não há dependências Python no projeto:

```
$ ls requirements*.txt pyproject.toml Pipfile setup.py
  nenhum manifesto Python no repositório
```

As duas ferramentas estão instaladas e prontas; simplesmente não há alvo. Registrado para não parecer omissão.

---

## 5. Análise de isolamento multiempresa

Esta é a parte que decide se o produto pode virar franquia. Foi a mais testada.

### 5.1 Desenho, em duas camadas independentes

**FATO.** O isolamento não depende de a aplicação lembrar de filtrar. São duas camadas:

1. **Aplicação:** toda consulta de negócio passa por `comEscopo(ctx, fn)`, que abre transação e executa `set_config('app.tenant_id', $1, true)` — parametrizado, porque o Postgres não aceita parâmetro em `SET`. O contexto vem da sessão no servidor.
2. **Banco:** RLS com policy em cada tabela, comparando `tenantId` com `app.current_tenant_id()`.

Se a camada 1 falhar por esquecimento, a camada 2 devolve zero linhas. O contrário também vale: `comEscopo` recusa executar quando não há empresa nem Super Admin no contexto.

### 5.2 Cobertura de RLS

**FATO.** As 24 tabelas de negócio têm RLS ativo e ao menos uma policy:

```
agendamentos · assinaturas · audit_logs(2) · clientes · contadores · documentos
equipamentos · eventos_ordem · faturas · fotos · leads · mensagens_whatsapp
movimentos_estoque · orcamento_itens · orcamentos · ordens · outbox_jobs
pagamentos · pecas · sessoes · templates_mensagem · tenants(2) · usuarios
whatsapp_instances
```

**FATO.** Nenhuma policy de escrita está sem `WITH CHECK`:

```
$ SELECT tablename, policyname, cmd FROM pg_policies
   WHERE cmd IN ('ALL','INSERT','UPDATE') AND with_check IS NULL;
  (zero linhas)
```

Isso importa: `USING` sem `WITH CHECK` deixaria gravar uma linha carimbada com o `tenantId` de outra empresa. As duas metades existem.

**FATO.** Todas as tabelas com coluna `tenantId` têm índice que a inclui — o filtro do RLS não vira varredura sequencial:

```
$ (tabelas de negócio sem índice em tenantId)
  (zero linhas)
```

### 5.3 Ataques executados

**FATO.** Criada uma segunda empresa (`auditoria-vizinha`) com cliente, equipamento, ordem, foto e documento próprios. Depois, **logado como administrador da primeira empresa e com os identificadores exatos em mãos**:

| Ataque | Resultado |
|---|---|
| Abrir o prontuário da ordem da vizinha (`/painel/ordens/<id>`) | **HTTP 404** — barrado |
| Abrir a foto da vizinha (`/api/foto/<id>`) | **HTTP 404** "Foto não encontrada" — barrado |
| Abrir o documento da vizinha (`/api/documento/<token>`) | **HTTP 404** — barrado |
| Consultar `ordens` sem escopo, como a aplicação | **0 linhas** — RLS filtrou |
| Alterar evento da linha do tempo | **permission denied** — barrado |

O 404 é a resposta certa: não confirma nem nega a existência do registro. Para quem tenta o identificador na sorte, é indistinguível de "não existe".

### 5.4 Papéis do banco

**FATO.** `dtechmed_app` — o papel usado em tempo de execução — não é superusuário e não tem `BYPASSRLS`. É a razão de o isolamento valer na prática hoje, mesmo com o SEC-004 aberto.

### 5.5 Superfícies públicas

**FATO.** Duas superfícies funcionam sem sessão, e as duas resolvem a empresa por função `SECURITY DEFINER` com `search_path` fixo — nunca por policy pública:

```
 funcao                     | security_definer | config
----------------------------+------------------+-----------------------------
 empresa_do_token           | true             | search_path=public, pg_temp
 registrar_lead             | true             | search_path=public, pg_temp
 registrar_tentativa_login  | true             | search_path=public, pg_temp
```

O `search_path` fixo importa: sem ele, um schema plantado antes de `public` sequestraria a resolução de nomes dentro de uma função que roda com privilégio de dono.

`app.empresa_do_token()` devolve **apenas o id da empresa** — não nome, não valor, não etapa. O token prova o direito àquela ordem; não vira passe livre.

### 5.6 Veredito

**O isolamento entre franquias se sustentou em todos os testes executados.** A ressalva é o **SEC-004**: o desenho depende, hoje, de a aplicação nunca conectar com o papel dono. Isso é verdade no código atual, mas é uma condição frágil justamente no momento mais propenso a erro — a configuração do `.env` no servidor. Com `FORCE ROW LEVEL SECURITY`, deixa de ser condição e passa a ser garantia.

---

## 6. Escalabilidade

**Alvo declarado:** 30 empresas, 5 usuários cada (150 usuários), até 90 simultâneos, VPS própria.

### 6.1 Volume usado na medição

**FATO.** Gerado volume equivalente a dois anos de operação:

```
 empresas | usuarios | clientes | equipamentos | ordens | tamanho
----------+----------+----------+--------------+--------+---------
    32    |   159    |   1205   |     1205     | 27005  |  26 MB
```

### 6.2 Consultas do painel

**FATO.** `EXPLAIN (ANALYZE, BUFFERS)` com o escopo de uma empresa aberto, sobre as 27 mil ordens:

| Consulta | Tempo | Usa índice |
|---|---|---|
| Esteira (agrupamento por etapa) | **1,19 ms** | sim |
| Fila de um degrau (40 mais paradas) | **0,27 ms** | sim |
| Resumo financeiro | **0,02 ms** | — (tabela pequena) |
| Lista de ordens (60 recentes) | **0,48 ms** | sim |
| Busca por nome de cliente | **0,37 ms** | sim |
| Prontuário (eventos de uma ordem) | **0,07 ms** | sim |

Nenhuma varredura sequencial nas tabelas grandes. O banco não é o gargalo nem perto do alvo.

### 6.3 Carga fim a fim

**FATO.** Requisições reais contra a aplicação em modo de produção, com sessão válida:

| Cenário | p50 | p95 | Vazão | Erros |
|---|---|---|---|---|
| Painel do dia · 90 simultâneas | 1.773 ms | 2.272 ms | 39,2 req/s | **0** |
| Lista de ordens · 90 simultâneas | 1.257 ms | 1.560 ms | 57,3 req/s | **0** |
| Financeiro · 90 simultâneas | 1.424 ms | 1.857 ms | 48,1 req/s | **0** |
| Site (estático) · 90 simultâneas | 364 ms | 386 ms | 229,8 req/s | **0** |
| Painel do dia · **pico de 200** | 3.548 ms | 4.637 ms | 42,3 req/s | **0** |

**Como ler estes números.** "90 simultâneas" significa 90 requisições disparadas no mesmo instante — bem mais agressivo que 90 pessoas usando o sistema. Uma pessoa carrega uma tela do painel a cada 30 a 60 segundos; 150 usuários ativos geram algo entre **2,5 e 5 requisições por segundo**. A vazão medida foi de **39 a 57 req/s** na pior tela.

**A folga medida é de aproximadamente 8 a 20 vezes o uso esperado.** E a medição foi feita num contêiner de desenvolvimento compartilhado e limitado — a VPS dedicada deve entregar mais.

### 6.4 Configuração a ajustar antes do deploy

**FATO.** Configuração atual do PostgreSQL local:

```
 max_connections       100
 shared_buffers        128 MB
 work_mem              4 MB
 effective_cache_size  4 GB
```

**FATO.** A `DATABASE_URL` do projeto fixa `connection_limit=20`.

**HIPÓTESE** (derivada da configuração, não medida na VPS de destino):

- Com **um** processo Node, 20 conexões contra `max_connections=100` é confortável.
- Com o **worker** em processo separado, são dois pools: 40 conexões. Ainda folgado.
- Se um dia rodarem **várias instâncias** do Next para aproveitar mais núcleos, o cálculo passa a ser `instâncias × 20 + worker × 20`. A partir de quatro instâncias, convém um `pgbouncer` em modo transação em vez de aumentar `max_connections`.
- `shared_buffers` em 128 MB é o padrão de instalação. Numa VPS com 4 GB dedicados ao banco, 1 GB é um ponto de partida melhor.

### 6.5 Limites conhecidos

**FATO.** O limite de tentativas de login é **em memória do processo** (`Map` em `src/app/entrar/acoes.ts`, e o mesmo padrão em `src/server/acoes/lead.ts`). Com um processo só — a configuração desta gaveta — funciona, e foi comprovado funcionando:

```
tentativa  1..5: E-mail ou senha incorretos
tentativa  6..8: Muitas tentativas seguidas. Tente de novo em 59 segundos.   ← bloqueio por conta
tentativa  9:    Muitas tentativas. Espere alguns minutos e tente de novo.   ← limite por IP
```

**HIPÓTESE:** se um dia houver mais de uma instância, cada uma contará separado e o teto efetivo será multiplicado pelo número de instâncias. Nesse momento o contador precisa migrar para o banco ou para Redis. O código já traz esse aviso em comentário.

### 6.6 Veredito

**O alvo de 30 empresas, 150 usuários e 90 simultâneos está confortavelmente dentro do que foi medido.** O ponto de atenção para crescimento não é o banco nem a aplicação: é o pool de conexões, quando e se houver mais de uma instância.

---

## 7. O que ficou fora desta auditoria

Listado para não parecer coberto:

- **NÃO VERIFICADO** — trivy e osv-scanner (bloqueados pelo proxy). Cobrem imagem de contêiner e banco OSV.
- **NÃO VERIFICADO** — pacotes de regras da comunidade do semgrep (bloqueados pelo proxy).
- **NÃO VERIFICADO** — a VPS de destino: sistema operacional, nginx, TLS, firewall, isolamento entre as três "gavetas", rotação de logs, backup e restauração.
- **NÃO VERIFICADO** — a integração real com a uazapi. O `UAZAPI_ADMIN_TOKEN` está vazio no ambiente; nenhuma mensagem foi enviada de verdade. O tratamento de erro do cliente HTTP foi lido, não exercitado contra o serviço.
- **NÃO VERIFICADO** — comportamento sob ataque distribuído (DDoS) e proteção de borda.
- **NÃO VERIFICADO** — conformidade com a LGPD do ponto de vista jurídico. Há decisões técnicas que ajudam (documento com hash cego, foto atrás de rota autenticada, trilha de auditoria), mas política de retenção, base legal e resposta a titular não foram avaliadas.
- **NÃO REALIZADO** — teste de intrusão ativo, varredura de portas, fuzzing e qualquer técnica ofensiva.

---

## 8. Plano de correção priorizado

### Antes de subir para produção

| # | Achado | Esforço | Por quê agora |
|---|---|---|---|
| 1 | **SEC-004** — `FORCE ROW LEVEL SECURITY` | Baixo — uma migração | É o que transforma o isolamento de condição em garantia, justo antes da etapa mais propensa a erro de configuração. |
| 2 | **SEC-002** — PDF do cliente devolve 404 | Baixo — repetir o padrão de `empresa_do_token` | Todo documento enviado ao cliente está quebrado. |
| 3 | **SEC-001** — busca de ordens em HTTP 500 | Trivial — trocar um byte | A busca é o que a atendente mais usa. |
| 4 | **SEC-003** — token de 41 bits | Baixo — usar `novoToken()` | O link do cliente é a credencial; hoje ela é adivinhável para alvo escolhido. |
| 5 | **SEC-005** — tela de Empresas vazia | Trivial — envolver em `comEscopo` | Sem ela não dá para administrar franquia. |

### Primeira semana de operação

| # | Achado | Esforço |
|---|---|---|
| 6 | **SEC-006** — revogar `UPDATE` em `assinaturas` | Trivial |
| 7 | **SEC-007** — `ALTER ROLE dtechmed_owner NOCREATEDB` | Trivial |
| 8 | **SEC-008** — `chmod 700 storage` e usuário próprio | Baixo |
| 9 | Rodar **trivy** e **osv-scanner** na VPS | Baixo |
| 10 | Rodar **semgrep** com os pacotes oficiais | Baixo |

### Primeiro mês

| # | Item | Esforço |
|---|---|---|
| 11 | **SEC-009** — método HTTP incomum barrado no nginx | Baixo |
| 12 | Ajustar `shared_buffers` do PostgreSQL na VPS | Baixo |
| 13 | Atualizar `pdfkit` (0.16 → 0.19) | Médio — exige reteste dos PDFs |
| 14 | Verificação de bytes NUL no `typecheck` ou em hook | Baixo |
| 15 | Backup automatizado **com teste de restauração** | Médio |

### Quando houver mais de uma instância

| # | Item |
|---|---|
| 16 | Migrar o limite de tentativas para o banco ou Redis |
| 17 | Avaliar `pgbouncer` em modo transação |

---

## 9. O que já está bem resolvido

Registrado com evidência, para não se perder numa próxima revisão:

- **FATO** — Senhas em Argon2id com os parâmetros do OWASP (19 MiB, 2 iterações, 1 thread).
- **FATO** — Token de sessão guardado apenas como HMAC-SHA256. O valor do cookie **não aparece no banco**: busca pelo prefixo do token real devolveu 0 ocorrências.
- **FATO** — Cookie de sessão com `httpOnly=true`, `secure=true`, `sameSite=Strict`, expiração de 12 horas.
- **FATO** — CSP por requisição com nonce e `strict-dynamic`, sem `unsafe-inline` em script.
- **FATO** — Cabeçalhos presentes: HSTS (1 ano, `includeSubDomains`), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` restritiva. Sem `X-Powered-By`.
- **FATO** — CSRF: POST com `Origin` forjada devolve **403**; com a origem correta, segue.
- **FATO** — Travessia de caminho barrada em `/api/foto` e `/api/documento`.
- **FATO** — Rota privada sem sessão redireciona para `/entrar?destino=…`, e o destino só é aceito se for interno.
- **FATO** — Anti-força-bruta em duas camadas, medido: bloqueio progressivo por conta a partir da 6ª tentativa e limite por IP na 9ª.
- **FATO** — Segredos com tamanho adequado: `SESSION_SECRET` 48 bytes, `ENCRYPTION_KEY` 32 bytes, `DOCUMENT_HASH_SALT` 32 caracteres.
- **FATO** — `.env` não versionado e sem vazamento no histórico do git.
- **FATO** — Zero vulnerabilidades conhecidas nas dependências.
- **FATO** — Nenhum `$queryRawUnsafe`, nenhum `dangerouslySetInnerHTML`, nenhum `eval`.
- **FATO** — Linha do tempo encadeada por hash, com `UPDATE` e `DELETE` revogados da aplicação no banco.
- **FATO** — Aprovação de orçamento não é alcançável por nenhum papel interno, nem pelo Super Admin: a transição existe apenas pela via do portal do cliente.

---

## 10. Regras seguidas nesta auditoria

Conforme combinado antes de começar:

- Nenhum resultado foi inventado. Toda afirmação de **FATO** tem comando e saída registrados.
- Nada foi marcado como seguro sem evidência.
- Nenhum segredo real foi exposto. Os valores do `.env` foram medidos por tamanho, nunca impressos.
- **Nenhum código de aplicação foi alterado durante a auditoria.**
- As ferramentas foram baixadas para diretório temporário fora do repositório, sem tocar em `package.json`.
- Nenhum comando destrutivo foi executado. O `prisma migrate reset` foi recusado pela própria ferramenta por exigir consentimento, e **não** foi forçado.
- Nenhuma migração de produção, nenhuma alteração de infraestrutura.
- O volume de teste (30 empresas, 27 mil ordens) e a empresa `auditoria-vizinha` foram criados **apenas no banco local de desenvolvimento**, para medir escalabilidade e provar o isolamento. Não existem em produção.
- Fato, hipótese e não verificado estão separados e marcados.

---

## 11. Correções aplicadas depois da auditoria

A auditoria em si não alterou uma linha de código — foi a regra combinada, e ela foi cumprida. O que segue aconteceu **depois** do relatório fechado, numa etapa separada e declarada, com o mesmo critério de evidência: cada correção foi medida antes e depois.

Commit das correções: ver histórico do branch, mensagem `fix: correcoes da auditoria de seguranca`.

### 11.1 O que foi corrigido

| Achado | Correção | Prova depois |
|---|---|---|
| **SEC-001** | O byte NUL saiu. A cláusula de documento só entra quando a busca tem dígitos. | `busca "Bella": 1 resultado` · `busca "Lavieen": 1 resultado` (antes: HTTP 500) |
| **SEC-002** | Nova função `app.empresa_do_documento()` resolve a empresa pelo token; a rota abre `comEscopo` com o id devolvido. | `HTTP 200 · application/pdf · 3.101 bytes · %PDF-` (antes: 404) |
| **SEC-003** | `@default(cuid())` removido dos dois tokens. A aplicação grava `novoToken()`. | tokens agora com **43 caracteres base64url (256 bits)** e sem prefixo comum |
| **SEC-004** | `FORCE ROW LEVEL SECURITY` nas 24 tabelas de negócio. | dono sem escopo: **0 ordens** (antes: 4) |
| **SEC-005** | `listarEmpresas()` passou a abrir escopo de Super Admin. | tela mostra `EMPRESAS 1 · USUÁRIOS 7 · ORDENS 4` (antes: tudo zero) |
| **SEC-006** | `REVOKE UPDATE ON assinaturas`. | `permission denied for table assinaturas` (antes: 1 linha alterada) |
| **SEC-008** | `chmod 700 storage`. | `drwx------` (antes: `drwxr-xr-x`) |

Um detalhe de tipagem que vale registrar: **remover o `@default(cuid())` fez o compilador apontar sozinho todos os pontos que criavam ordem ou documento** — três arquivos de aplicação e três de teste. O token deixou de ser algo que se pode esquecer.

### 11.2 A regressão que a própria correção causou — e como foi pega

Aplicar o `FORCE ROW LEVEL SECURITY` **quebrou as duas superfícies públicas**, e isso não era óbvio.

`SECURITY DEFINER` faz a função rodar com o privilégio do dono. Antes do FORCE isso bastava, porque o dono não era submetido às policies. Depois do FORCE, o dono passou a ser submetido como qualquer outro — e as funções que atendem o portal e o PDF pararam de enxergar a linha que precisavam ler:

```
app.empresa_do_documento(<token válido>) → NULL   ← PDF do cliente morto
app.empresa_do_token(<token válido>)     → NULL   ← portal do cliente morto
```

Se a verificação parasse em "o dono agora vê 0 ordens, ótimo", o sistema teria ido para produção com o portal e todos os PDFs quebrados.

A saída **não** foi afrouxar o FORCE, nem abrir policy pública, nem dar `BYPASSRLS` ao papel da aplicação. Foi elevar o contexto pelo tempo exato de uma consulta, dentro da própria função, restaurando o valor anterior em seguida. A cláusula `SET` na definição da função seria mais elegante, mas o PostgreSQL exige superusuário para fixar parâmetro personalizado desse jeito — e o dono deste banco, de propósito, não é superusuário.

O alcance continua estreito: `empresa_do_token` e `empresa_do_documento` devolvem **apenas o id da empresa**. Nem nome, nem valor, nem caminho de arquivo. Quem chama abre o escopo normal com esse id, e daí em diante todas as policies voltam a valer.

Depois da correção:

```
app.empresa_do_documento → cmsr1f2gi0001us7dpdxr8xq8
app.empresa_do_token     → cmsr1f2gi0001us7dpdxr8xq8

/api/documento/<token válido>  → HTTP 200, application/pdf
/api/documento/<token falso>   → HTTP 404
/os/<token válido>             → HTTP 200
/os/<token falso>              → HTTP 404
```

A mesma elevação foi aplicada a `registrar_lead` e `registrar_tentativa_login`, que escrevem em `leads` e `usuarios` e teriam parado pelo mesmo motivo.

### 11.3 Efeito colateral saudável nos testes

Três pontos dos testes de integração limpavam o banco com a conexão do dono, contando com o privilégio implícito. Com o FORCE, pararam de funcionar — e passaram a **declarar a intenção** com `set_config('app.is_super_admin', 'on', false)`.

O teste que comprova a detecção de adulteração foi ajustado no mesmo espírito, e a história que ele conta ficou mais forte: agora o atacante do cenário precisa de credencial de dono **e** de saber como o escopo funciona — e ainda assim a corrente de hash o denuncia.

### 11.4 Verificação completa depois de tudo

**FATO.**

```
Testes:            111 de unidade + 39 de integração  → todos passando
Typecheck:         limpo
Build de produção: compilado com sucesso

Jornada completa no navegador (do telefonema ao caixa):  21 de 21 verificações
Apps de campo e portal no celular:                       11 de 11 verificações
Site no desktop e no celular + formulário:               13 de 13 verificações
```

### 11.5 O que continua aberto, e é para a VPS

Não dá para corrigir daqui, porque depende do servidor de produção:

| Achado | Comando |
|---|---|
| **SEC-007** | `ALTER ROLE dtechmed_owner NOCREATEDB;` no banco de produção |
| **SEC-008** | Repetir `chmod 700` no volume de anexos e rodar o Node com usuário próprio, não root |
| **SEC-009** | Barrar métodos HTTP incomuns no nginx, antes de chegarem à aplicação |
| — | Rodar **trivy** e **osv-scanner**, que o proxy deste ambiente bloqueou |
| — | Rodar **semgrep** com os pacotes oficiais |
| — | Ajustar `shared_buffers` do PostgreSQL para a memória da VPS |

### 11.6 Contagem final

| Severidade | Encontrados | Corrigidos | Abertos |
|---|---|---|---|
| Crítica | 0 | — | 0 |
| Alta | 4 | **4** | 0 |
| Média | 3 | 2 | 1 (SEC-007, comando para a VPS) |
| Baixa | 2 | 1 | 1 (SEC-009, tratar no nginx) |
| **Total** | **9** | **7** | **2** |

Os dois que restam não são alcançáveis a partir do repositório: um é comando no banco de produção, o outro é configuração do nginx. Os dois estão no guia de deploy.
