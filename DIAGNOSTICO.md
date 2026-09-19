# Diagnóstico do DTECH MED

Levantamento de 19 de setembro de 2026, sobre o branch `fix/rede-de-seguranca`, no commit de trabalho atual. Cinco cadeiras leram o sistema: segurança, qualidade, performance, plataforma, e esta, que consolida os quatro dossiês e escreve o mapa, a arquitetura, o estado e o plano.

**Nada foi corrigido.** Nenhum arquivo do repositório foi criado, alterado ou removido. Nenhum comando escreveu no banco, no git ou no `.env`. Nenhum pacote foi instalado. Nenhum script de `infra/` foi executado. Você disse que queria aprovar antes, e é isso que está de pé: um relatório e nenhuma mudança.

São 81 achados. O documento não foi feito para ser lido de uma vez. As seções 1, 2 e 3 explicam o sistema e dizem o que preservar ao mexer; a seção 4 lista os problemas com arquivo e linha, para o programador conferir; a seção 5 é a ordem de conserto. Se você tem quinze minutos, leia a seção 5 e volte depois.

Os quatro dossiês completos ficam em `outputs/c6c00720-270e-4892-afe6-32f9eafbae36/_team/`, um por cadeira. Quando o detalhe de um achado couber melhor lá, este relatório aponta para lá em vez de repeti-lo.

## Como ler cada achado

Três etiquetas, a mesma convenção do `AUDITORIA_SEGURANCA.md` que já existe neste repositório.

| Etiqueta | O que significa |
|---|---|
| **FATO** | Um comando foi rodado e a saída lida, ou o arquivo foi aberto exatamente na linha citada. |
| **HIPÓTESE** | O código foi lido e a lógica seguida. O caminho não foi executado. |
| **NÃO VERIFICADO** | Fora do alcance desta etapa. Listado para não parecer coberto. |

Nenhum valor de segredo aparece neste documento. Onde a evidência exigia citar uma senha, uma chave ou uma string de conexão, o que está escrito é o arquivo e a linha. Quem for corrigir abre o arquivo.

## O que não foi verificado, e o buraco é grande

`node_modules/` não existe nesta máquina, e instalar pacote estava proibido nesta etapa, porque uma instalação local seria ela própria uma alteração no repositório. A consequência atravessa o relatório inteiro e precisa ficar na primeira página:

- **Nada foi executado.** Nem `npm run typecheck`, nem `npm run lint`, nem a suíte de testes, nem a bateria `qa/`, nem o servidor, nem uma única requisição. Todo achado aqui é leitura de código, de migração ou de configuração.
- **Nenhum milissegundo foi medido.** Não houve Lighthouse, não houve `EXPLAIN ANALYZE`, não houve `npm run build`. A seção de performance conta idas ao banco, linhas trazidas e arquivos carregados, que são coisas que se contam lendo. Ela não afirma tamanho de ganho nenhum, de propósito.
- **Nenhuma dependência foi conferida contra vulnerabilidade conhecida.** Sem árvore instalada e sem consulta à base pública de vulnerabilidades, este relatório **não nomeia nenhum CVE e não atribui nenhum CVSS**. A superfície de dependências está **inauditada**, e inauditada não é o mesmo que limpa. Os comandos que faltaram são `npm ci --ignore-scripts` e `npm audit --audit-level=high`.
- **A documentação da versão instalada do Next 16 não pôde ser lida**, porque ela vive dentro de `node_modules/`. O `AGENTS.md` deste repositório manda conferir ali antes de chamar qualquer coisa de errada no framework. Por isso nenhum achado deste relatório acusa uma convenção de versão, e onde o comportamento do Next pesa na gravidade, o achado está marcado HIPÓTESE.
- **O servidor de produção não foi tocado.** Ficaram de fora os privilégios efetivos no banco, a permissão do volume de anexos, as imagens Docker paradas na VPS, os registros de DNS, o ensaio de restauração de backup e o uso real de CPU e memória.
- **`src/generated/prisma` ficou fora de escopo** por decisão do enunciado. São 116.794 linhas geradas pelo Prisma, não escritas por ninguém. A única linha que elas merecem aqui é que o cliente gerado está versionado dentro de `src/`, o que é a convenção do gerador do Prisma 7 e está corretamente refletida no `Dockerfile:129-133`.

## Uma advertência sobre o método deste relatório

Nesta auditoria os achados foram checados com mais rigor que as ausências. Quem levantou isso foi a própria cadeira de segurança, contra o próprio trabalho: três varreduras dela produziram um "isto não existe" que não se sustentou, duas pegas por ela mesma e uma pega na revisão. A lição, nas palavras dela, é que afirmar que algo não existe exige ler o arquivo inteiro, não refinar a expressão de busca.

Para você isso significa uma regra prática. Confie mais no "isto está quebrado" do que no "isto não existe", e ao consertar cada item, reconfira a ausência antes de agir sobre ela. Os falsos positivos que foram derrubados durante o trabalho estão registrados no dossiê de segurança, na seção "O que parecia achado e não era", e valem a leitura de quem for mexer.

## A pergunta que só o servidor responde

Um item deste relatório pode ter como resposta "há segredo exposto agora", e ele não se responde a partir do repositório.

O commit `df74532`, de 16 de agosto de 2026, fechou um buraco em que a construção da imagem Docker copiava o `.env` de produção para dentro dela. Nenhum valor real chegou ao repositório, e o `.dockerignore:7-21` descreve o defeito e a correção. Se alguma imagem construída antes daquela data ainda existir num registry ou parada na VPS, ela carrega o `.env` daquele dia congelado numa camada, com a chave que decifra os tokens de WhatsApp de todas as franquias. Trocar a senha depois não muda o que está congelado.

Isso se resolve em minutos com `docker images -f dangling=true` na VPS, e é o primeiro item do plano da seção 5. Está registrado como SEG-P04.

---

# 1. Mapa

## O que o sistema faz, e para quem

O DTECH MED existe para que o dono de uma assistência técnica consiga responder, a qualquer momento e sem abrir quatro telas, onde está cada aparelho que passou pela mão dele. O produto é um sistema de gestão multiempresa para assistência técnica de equipamentos médicos, odontológicos, estéticos e hospitalares, construído desde o começo para virar franquia: cada franquia é uma empresa dentro do mesmo sistema, e nenhuma enxerga a outra.

O `README.md` conta a origem da escolha, e ela explica a forma do produto. O sistema anterior navegava por módulo, sete assuntos lado a lado, e o equipamento ficava sem história; o resultado foram 173 ordens vencidas e 32 orçamentos parados sem ninguém saber. Aqui a espinha é a jornada do equipamento. Cada aparelho tem um prontuário com a história inteira numa página, o painel abre mostrando em que etapa cada um está parado e há quanto tempo, e o cliente é avisado no WhatsApp a cada passo sem ninguém precisar lembrar.

## As quatro superfícies

Quatro faces num código só, com quatro públicos diferentes.

| Superfície | Endereço | Para quem | Como se entra |
|---|---|---|---|
| Site | `/` | Cliente que precisa consertar um aparelho | Aberto, sem login |
| Painel | `/painel` | Central, gestão, técnicos, financeiro | Login com e-mail e senha |
| Aplicativo de campo | `/app/motorista`, `/app/tecnico` | Quem trabalha na rua e na bancada | Login, instalável no celular |
| Portal do cliente | `/os/<token>`, `/orcamento/<token>` | Cliente acompanha e aprova | Link com token, sem login, com confirmação de CPF ou CNPJ |

São 48 telas no total (`page.tsx`), das quais 34 no painel, 6 no aplicativo de campo e as demais no site, no portal e nas telas de entrada. O aplicativo de campo é um site instalável (PWA), com service worker próprio em `public/sw.js`. Não é aplicativo de loja, e isso é escolha, não limitação acidental.

## Os papéis, conferidos no código

A lista real está em `prisma/schema.prisma:36-44` e a hierarquia que decide quem alcança o quê está em `src/server/auth/guarda.ts:27-35`. São sete papéis, e o peso de cada um está escrito:

| Papel | Peso | O que ele faz |
|---|---|---|
| `SUPER_ADMIN` | 100 | Dono da plataforma. Cadastra as empresas e o administrador de cada uma. É o único sem empresa. |
| `ADMIN_EMPRESA` | 80 | Responsável pela franquia. Cria os usuários dela. |
| `GESTOR` | 60 | Aprova orçamento, aprova serviço, dá a baixa final. |
| `FINANCEIRO` | 40 | Lança pagamento e fecha fatura. |
| `ATENDENTE` | 30 | Central: cadastra cliente, gera ordem de retirada, agenda. |
| `TECNICO` | 20 | Bancada: recebe, fotografa, lauda, executa, finaliza. |
| `MOTORISTA` | 10 | Rua: retira e entrega, coleta assinatura. |

Duas coisas valem registrar, porque mudam como o sistema se comporta na prática.

A primeira é que o papel não é a única pergunta. Ao lado dele existe a pergunta sobre a aba: `exigirNivel` responde se o papel alcança a tela, e `exigirAba` responde se aquela tela foi dada àquela pessoa (`src/server/auth/guarda.ts:88`). Um financeiro cujo administrador marcou só o Financeiro tem papel para abrir a Preventiva e mesmo assim não abre, porque não foi isso que combinaram. As duas perguntas são feitas em toda tela sensível, e é por isso que esconder o item no menu não é a proteção.

A segunda é que o super admin **perde** o atalho ao visitar uma franquia. Quando o dono da plataforma entra numa empresa, `src/server/auth/sessao.ts:253` desliga a marca de super admin, e dali em diante o isolamento passa a ser feito pelo banco e não pela disciplina de quem escreveu a consulta.

## A jornada: onze passos na tela, dezoito travas no motor

Aqui é preciso corrigir um número que circula na documentação do próprio projeto. **A esteira tem 18 etapas, não 16.** O `README.md:26` fala em 16 passos e está vencido: ele não foi atualizado quando a esteira cresceu. A fonte de verdade é `prisma/schema.prisma:48-70`, que numera 18 etapas mais 3 ramos alternativos, e o `PROCESSOS.md:9` acerta ao dizer 18.

Ao mesmo tempo, a tela não mostra 18. Ela mostra 11, e isso também é deliberado. `src/server/ordem/roteiro.ts:5` documenta a tradução entre as duas contagens, e a razão está escrita ali: as 18 etapas existem porque cada uma é uma trava, um ponto em que o sistema confere assinatura, foto, orçamento ou pagamento antes de deixar a ordem andar. Só que ninguém trabalha contando 18. O dono do sistema descreveu o dia dele em onze passos, e são esses onze que ele diz em voz alta ao telefone.

Os onze passos, como a janela da O.S. os apresenta:

| Passo | Nome | Quem põe a mão | O que acontece |
|---|---|---|---|
| 1 | Orçamento | central | O valor combinado com o cliente antes de existir ordem. Não tem etapa no banco, porque ainda não há ordem. |
| 2 | Abertura da O.S. | central | Cliente, aparelho e defeito entram no sistema. Sai a ordem de retirada em PDF. |
| 3 | Retirada ou envio | central | Decide-se quem leva o aparelho até a bancada: motorista da casa, ou o cliente despacha. |
| 4 | Dia e motorista | central | A parada marcada no calendário, com motorista escolhido. |
| 5 | Motorista a caminho | motorista | A parada aparece no aplicativo dele, com endereço e cliente. |
| 6 | Retirado e assinado | motorista | Foto no local e assinatura do cliente na tela do celular. |
| 7 | Recebimento e laudo | técnico e gestão | Entrada com no mínimo seis fotos, laudo escrito, orçamento enviado, cliente aprova pelo link. Cinco etapas do motor moram aqui. |
| 8 | Manutenção | técnico | O conserto. Peça usada baixa do estoque, e a gestão confere antes de liberar. |
| 9 | Pagamento | financeiro | A fatura montada e recebida, inteira ou em partes. O aparelho só é liberado com ela quitada. |
| 10 | Entrega a caminho | motorista | A parada de entrega marcada, motorista na rua com o aparelho consertado. |
| 11 | Entregue | motorista e gestão | Foto na entrega, assinatura de quem recebeu, baixa final da gestão. A garantia começa a contar daqui. |

Três ramos saem do caminho e o encerram: orçamento reprovado, devolvido sem reparo e cancelado. A régua para no último passo por onde o aparelho realmente passou e diz o motivo, em vez de fingir que a ordem continua andando.

Quando o cliente despacha o aparelho pelo correio em vez de o motorista buscar, quatro passos mudam de redação e as travas continuam as mesmas. Um roteiro que insiste em dizer "motorista a caminho" para um aparelho que veio de transportadora mente em quatro telas seguidas, inclusive na do cliente.

## O que mais o sistema faz, além da esteira

A jornada é a espinha, e pendurado nela há bastante coisa que o negócio usa todo dia:

- **Cadastro e carteira.** Clientes pessoa física e jurídica, equipamentos com número de série, e a ficha do cliente somando o que ele deve.
- **Comercial.** Proposta do passo 1 com link próprio para o cliente aprovar, e orçamento pós-laudo com itens de peça, serviço, deslocamento e taxa.
- **Estoque.** Peça, insumo e ferramenta tratados como três coisas diferentes, porque são três contas diferentes: a peça é vendida na O.S., o insumo é gasto no trabalho, e a ferramenta volta. Reserva na aprovação do orçamento, baixa na entrada em manutenção, e empréstimo de ferramenta com quem levou.
- **Financeiro.** Fatura com pagamento fracionado (parte no pix hoje, parte em dinheiro amanhã), contas a pagar e a receber com recorrência e parcelamento, fechamento de caixa, e relatórios.
- **Agenda e rua.** Calendário com paradas de retirada e entrega, compromissos livres, e acompanhamento ao vivo da posição do motorista.
- **Preventiva.** Contrato de manutenção por equipamento, com periodicidade, e as visitas geradas a partir dele.
- **Documentos.** Geração de PDF com moldes que a empresa edita, e até cinco ordens de serviço diferentes que podem sair sozinhas na etapa que a empresa escolher.
- **Rastreabilidade.** A folha que responde ao cliente, ao fabricante e à vigilância sanitária quem mexeu naquele aparelho, com as provas agrupadas por dia.
- **Comunicação.** Aviso automático no WhatsApp do cliente a cada etapa, e aviso no celular da equipe (push).
- **Site institucional editável.** O conteúdo do site público é editado pelo painel, com versionamento.
- **Uma previsão.** A única lógica preditiva do sistema responde "esta O.S. vai furar o prazo?", condicionada apenas na etapa em que ela está (`src/server/ia/prazo.ts`). Ela recusa responder com amostra pequena e nunca sai sem dizer a confiança ao lado.

## O que o sistema não faz, e alguém poderia supor que faz

Esta lista existe para você não descobrir uma ausência no meio de uma reunião com um franqueado.

- **Não emite nota fiscal e não conversa com a SEFAZ.** A fatura do sistema é o registro do que foi cobrado. O documento fiscal sai por fora, em outro lugar.
- **Não recebe dinheiro.** Pix, boleto, cartão e cheque são rótulos que o operador escolhe ao lançar o recebimento, junto do código da maquininha que ele digita na mão (`src/app/painel/financeiro/faturas.tsx:371`). Não há gateway de pagamento, não há conciliação bancária automática, e nada confirma sozinho que o dinheiro entrou.
- **Não compra peça e não tem cadastro de fornecedor.** `fornecedor` é um campo de texto solto na peça (`prisma/schema.prisma:1242`). O estoque registra entrada, saída, reserva e empréstimo; não registra pedido de compra, cotação nem recebimento de mercadoria.
- **Não tem login para o cliente.** O portal funciona por link com token e confirmação de documento. Não há senha de cliente, não há área "meus aparelhos" e não há histórico consolidado do lado dele.
- **Não tem aplicativo nas lojas.** `/app/motorista` e `/app/tecnico` são páginas web instaláveis. Não existe projeto iOS nem Android neste repositório, e portanto não há exigência de loja a cumprir.
- **Não trabalha offline para escrever.** O aplicativo de campo abre sem sinal e explica a situação, e isso é bem feito. Mas assinatura, foto e mudança de etapa só valem confirmadas pelo servidor, e o service worker recusa fingir que salvou (`public/sw.js:15-24`). É decisão consciente, escrita: um "salvo" mentiroso em campo faria o motorista ir embora achando que registrou.
- **Não faz integração contábil nem folha de pagamento.**
- **Não tem ambiente de teste.** Isto merece destaque porque é o que mais surpreende. O que o guia de publicação chama de "endereço de ensaio" nunca foi um ambiente separado: é o mesmo sistema, a mesma gaveta, o mesmo banco e o mesmo arquivo de segredos, alcançado por um segundo nome de domínio durante a virada. Está registrado como ORG-P11 e é a causa raiz de outros três achados.

---

# 2. Arquitetura

## A pilha, com versão

Tudo isto está declarado em `package.json` e fixado em `package-lock.json`, com hash de integridade em todas as doze dependências diretas de produção.

| Camada | O que é | Versão |
|---|---|---|
| Framework web | Next.js, com App Router e Server Actions | 16.3.0 |
| Interface | React, TypeScript estrito, Tailwind | 19.2.8 · 5.8 · 4.0 |
| Acesso a banco | Prisma com adaptador node-postgres | 7.9.1 |
| Banco | PostgreSQL | 16 |
| Senhas | Argon2id (`@node-rs/argon2`) | 2.0.2 |
| Validação de entrada | zod | 4.4.3 |
| Imagens | sharp | 0.35.3 |
| PDF | pdfkit | 0.16.0 |
| Aviso no celular | web-push | 3.6.7 |
| WhatsApp | uazapi, por API HTTP | provedor externo |
| Execução | Node | 22 ou mais |
| Empacotamento | Docker multi-estágio, docker compose, Caddy na borda | |

O sistema tem cerca de 70 mil linhas escritas à mão: 38.721 em `src/app`, 27.237 em `src/server`, 3.663 em `src/lib`. São 211 commits no branch atual e 280 em todas as referências, e 556 arquivos rastreados pelo git.

## O mapa de pastas

```
src/
  app/          38.7k linhas — TODAS as telas e as rotas HTTP.
                  page.tsx (48 telas), componentes de tela, e as 6 rotas
                  de API. As quatro superfícies moram aqui, cada uma no
                  próprio diretório: /, /painel, /app, /os e /orcamento.
  server/       27.2k linhas — a regra do negócio. Nada de React aqui.
    acoes/        31 arquivos — TODA escrita do sistema entra por aqui.
    consultas/    18 arquivos — TODA leitura de painel sai daqui.
    ordem/        o motor da esteira, a máquina de estados, o roteiro,
                  a trilha de prova e a garantia. É a lei do produto.
    auth/         sessão, guardas de papel e de aba, recuperação de senha.
    financeiro/   fatura, baixa, estorno.
    estoque/      movimento, reserva, ferramenta.
    documentos/   geração de PDF.
    outbox/       o worker da fila de automação.
    whatsapp/     montagem da mensagem e a conversa com o provedor.
    push/         aviso no celular.
    arquivos/     upload, miniatura e leitura do acervo.
    ia/           a previsão de estouro de prazo.
    preventiva/   contrato e visita.
    plataforma/   configuração da plataforma.
  lib/          3.7k linhas — o que é puro e testável: dinheiro, datas,
                  criptografia, documentos, número da O.S., ambiente.
                  `db.ts` mora aqui, e é o coração do isolamento.
  components/   155 linhas. UM arquivo. Ver a seção 3.
  generated/    116.8k linhas GERADAS pelo Prisma. Não é código humano.
  middleware.ts porteiro das rotas privadas e origem da política de
                  segurança de conteúdo, com nonce por requisição.
prisma/         schema (2.281 linhas, 41 modelos) e 41 migrações.
worker/         14 linhas: só o ponto de entrada do processo da fila.
qa/             47 arquivos, 10.9k linhas — a bateria de ponta a ponta
                  que dirige um navegador de verdade. A rede real.
infra/          Dockerfile auxiliar, Caddy, nginx, Postgres, backup e os
                  seis scripts de publicação.
scripts/        ferramentas manuais: prova de RLS, limpeza, cenário demo.
```

Duas observações sobre esse mapa, e as duas voltam na seção 3. A primeira é que `src/components` tem um arquivo e 155 linhas, enquanto `src/app` tem 38,7 mil: os componentes de tela estão escritos dentro de `src/app`, ao lado das páginas. São 97 arquivos com `'use client'` em `src`, e o maior deles tem 2.144 linhas. A segunda é que `src/server/acoes` e `src/server/consultas` concentram juntos 17,5 mil linhas com um único arquivo de teste entre os dois.

## O banco: 41 modelos, dez assuntos

A regra que organiza o schema está escrita nas primeiras linhas dele e vale a pena citar, porque explica a forma de tudo: a Ordem é a espinha dorsal, e orçamento, fotos, peças, pagamento e entrega não são ilhas, são fatos pendurados nela. Quase toda tabela aponta para `ordemId`. A segunda regra é `tenantId` em toda tabela de negócio, sem exceção.

São 41 modelos e 41 migrações. (O número 42 que circulava vem de contar o `migration_lock.toml`, que não é migração.) Agrupados por assunto:

| Assunto | Modelos | Para quê |
|---|---|---|
| Plataforma e acesso (5) | `Tenant`, `User`, `Sessao`, `RecuperacaoSenha`, `ConfigPlataforma` | As franquias, as pessoas, as sessões abertas e a configuração do dono da plataforma. |
| Carteira e contratos (5) | `Cliente`, `Equipamento`, `Lead`, `ContratoManutencao`, `VisitaPreventiva` | Quem compra, o que ele tem, quem pediu contato pelo site, e a preventiva contratada. |
| A esteira (3) | `Ordem`, `EventoOrdem`, `ColunaQuadro` | A ordem de serviço, cada passo dela na linha do tempo, e como a empresa organizou o quadro. |
| Comercial (4) | `Proposta`, `PropostaItem`, `Orcamento`, `OrcamentoItem` | O orçamento do passo 1, antes de existir ordem, e o orçamento pós-laudo. Separados de propósito. |
| Estoque (4) | `Peca`, `MovimentoEstoque`, `EmprestimoFerramenta`, `PecaRetirada` | Saldo, entrada e saída, ferramenta que saiu com alguém, e a peça retirada do aparelho. |
| Dinheiro (4) | `Fatura`, `Pagamento`, `Lancamento`, `Contador` | A cobrança da O.S., cada recebimento dela, as contas a pagar e a receber, e a numeração sequencial. |
| Agenda e rua (4) | `Agendamento`, `Compromisso`, `Recorrencia`, `PosicaoRota` | A parada com motorista e hora, o compromisso livre do dia, a repetição, e o rastro do GPS. |
| Prova (4) | `Foto`, `Assinatura`, `Documento`, `AuditLog` | O que sustenta a discussão meses depois. Todas com escrita irreversível no banco. |
| Comunicação (5) | `OutboxJob`, `MensagemWhatsapp`, `TemplateMensagem`, `WhatsappInstance`, `PushInscricao` | A fila, o que já saiu, os textos, o número de cada franquia e os celulares inscritos. |
| Moldes e site (3) | `ModeloDocumento`, `ConteudoSite`, `ConteudoSiteVersao` | Os moldes de documento que a empresa edita e o conteúdo do site institucional, versionado. |

A história de migrações é puramente aditiva. Em 41 migrações não existe um único `DROP TABLE` nem `DROP COLUMN`. Isso é uma notícia melhor do que parece, e a seção 3 explica por quê.

## Como as partes conversam

O desenho é mais simples do que a contagem de linhas sugere, e a escolha central é uma só: **quase toda escrita do sistema passa por Server Actions, não por API REST.** São 114 funções exportadas em 32 módulos que começam com `'use server'`, contra apenas 6 rotas de API. Isso importa para a segurança, porque cada função exportada de um módulo desses é um endereço que o navegador chama direto.

```
  NAVEGADOR (painel, app de campo, portal do cliente)
      |
      |  Server Action  (src/server/acoes/*, 31 arquivos)
      |    lê a sessão do cookie, deriva a empresa dela,
      |    confere o papel, valida a entrada com zod
      v
  comEscopo()  (src/lib/db.ts:92)
      |    abre uma TRANSAÇÃO e carimba nela a empresa,
      |    o usuário e a marca de super admin
      v
  POSTGRES  com Row Level Security em 41 de 41 tabelas
      |
      |  quando a ordem MUDA DE ETAPA, o motor
      |  (src/server/ordem/motor.ts) enfileira o trabalho
      |  DENTRO da mesma transação
      v
  outbox_jobs   <---- fila no banco, com chave de dedupe
      |
      |  processo SEPARADO, de propósito
      v
  WORKER  (src/server/outbox/worker.ts)
      |    toma até 10 trabalhos com FOR UPDATE SKIP LOCKED
      |
      +--> pdf.gerar         ->  pdfkit  -> arquivo no acervo + linha em `documentos`
      +--> whatsapp.enviar   ->  uazapi  -> mensagem no WhatsApp do cliente
      +--> proposta.whatsapp ->  uazapi  -> o orçamento do passo 1
      +--> push.enviar       ->  web-push -> aviso no celular da equipe
```

Três decisões desse desenho merecem ser entendidas por quem decide o que consertar.

**A fila existe para o site não travar.** O comentário no topo de `src/server/outbox/worker.ts:11-16` diz a razão em duas linhas: gerar PDF e falar com a API do WhatsApp são operações lentas e sujeitas a travar, e dentro do processo web um provedor fora do ar viraria página que não carrega. O worker roda em processo separado por isso. Existe um caminho que não obedece a essa regra, a emissão manual de documento, e ele está registrado como PERF-11.

**O trabalho é enfileirado dentro da mesma transação que muda a etapa.** Se a transição não commitar, o aviso não existe. Se ela commitar, o aviso está garantido. E a chave de dedupe é única no banco, então uma transação repetida por retentativa de rede não vira dois avisos no celular do cliente.

**A leitura do painel é separada da escrita.** `src/server/consultas/` tem 18 arquivos e 7,2 mil linhas de consulta, boa parte em SQL cru bem escrito. Nenhum deles tem teste, e sete dos achados deste relatório moram ali.

## O isolamento entre empresas, que é o coração do produto

Esta é a parte que protege a franquia do vizinho, e vale entender o mecanismo porque ele decide a gravidade de vários achados.

São duas camadas independentes, e a intenção é que se uma falhar a outra segure. **Na aplicação**, toda consulta de negócio passa por `comEscopo()` (`src/lib/db.ts:92`), que abre uma transação e carimba nela três coisas: a empresa da sessão, o usuário, e se aquela sessão é do dono da plataforma. O `tenantId` nunca chega pelo formulário; se chegasse, bastaria trocar um campo para operar sobre a franquia do vizinho. **No banco**, Row Level Security (a trava dentro do próprio Postgres, que vale mesmo se o programa errar) está ligada nas 41 tabelas, com `FORCE ROW LEVEL SECURITY` nas 41, o que alcança até o dono das tabelas. A aplicação conecta com um papel criado sem superusuário, sem `BYPASSRLS`, sem `CREATEDB` e sem `CREATEROLE` (`infra/postgres/init/01-papel-da-aplicacao.sh:52-59`), e é essa separação que faz a trava valer.

Dois detalhes do desenho são melhores do que o comum e explicam por que o isolamento aguenta. O carimbo é feito com `set_config(..., true)`, local à transação, e não na conexão: o pool reaproveita conexões entre requisições, e se a empresa fosse definida na conexão, a próxima requisição herdaria a empresa da anterior. Esse é exatamente o vazamento que o desenho torna impossível. E o carimbo é feito por parâmetro, nunca interpolando o identificador na string, porque interpolar ali abriria uma porta de injeção justamente no mecanismo que existe para fechar portas.

Há quatro janelas estreitas que abrem exceção, e cada uma libera uma coisa só: o contexto de autenticação (leitura de usuários e sessões no login, quando ainda não se sabe a empresa), o contexto do worker (só a fila), o contexto da plataforma (só a configuração) e o escopo de super admin. Todas estão em `src/lib/db.ts` e cada uma tem policy correspondente no banco.

O ponto fraco do mecanismo é único e está nomeado neste relatório. A marca de super admin é o interruptor que desliga o filtro, e quem controla o contexto controla esse interruptor. Existe exatamente uma função no sistema que recebe esse contexto de fora em vez de derivá-lo da sessão, e ela é o achado SEG-01 / BUG-01.

---

# 3. Estado

## O que está bem feito, e é difícil de fazer

Esta lista não é cortesia, e ela é a parte mais importante desta seção. Um relatório que só reclama faz o dono quebrar o que estava bom. Cada item abaixo é algo que a maioria dos sistemas parecidos erra.

**O isolamento entre empresas é feito pelo banco, não pela boa vontade do código.** Row Level Security em 41 de 41 tabelas, com `FORCE` em todas. Nas 17 tabelas criadas depois da migração de endurecimento, o `FORCE`, a policy de empresa e o `GRANT` explícito nasceram juntos, no mesmo bloco. O modo de falha clássico aqui é a correção aplicada ao que existia e esquecida no que veio depois, e a cadeira de segurança procurou exatamente por isso. Não aconteceu. Zero regressões.

**O super admin perde o atalho ao visitar uma franquia** (`src/server/auth/sessao.ts:253`). É a diferença entre trancar a porta e pedir para não entrarem, e quase ninguém faz.

**A autorização está onde tem que estar.** As 114 ações de servidor foram conferidas uma a uma, e 113 derivam a identidade de dentro. São duas perguntas diferentes e as duas são feitas: se o papel alcança, e se aquela tela foi dada àquela pessoa.

**Zero injeção de SQL, e não por sorte.** Nenhuma ocorrência de `$queryRawUnsafe` ou `$executeRawUnsafe` em `src/`, `worker/` ou `scripts/`. Todo SQL cru usa parâmetro.

**A trilha de prova tem valor de prova.** Cada evento da linha do tempo é encadeado por hash ao anterior, com canonicalização das chaves do JSON para o detector não gritar sem motivo. No banco, `UPDATE` e `DELETE` estão revogados em `assinaturas`, `audit_logs`, `eventos_ordem`, `fotos`, `movimentos_estoque` e `pecas_retiradas`. Nem um defeito no código reescreve a trilha.

**Upload tratado pelos bytes, não pelo nome.** O `sharp` reescreve toda imagem recebida, o que descarta o EXIF com a localização de casa do técnico e qualquer coisa enxertada no fim do arquivo. E o caminho do arquivo nunca vem da URL: ele vem da linha no banco, lida dentro do escopo da empresa.

**O proxy de imagem do Instagram não é um proxy aberto.** Lista fechada de domínios conferida no host já interpretado, só https, teto de tamanho, e recusa do que não volta como imagem. É a melhor defesa contra requisição forjada do lado do servidor que se esperaria encontrar aqui.

**As agregações do painel são SQL cru, e bom.** `src/server/consultas/painel.ts:98-112` conta oito etapas numa passada só, e `painel.ts:130-145` resolve "a última versão do orçamento de cada ordem, somada por etapa" com uma junção lateral em vez de um laço de consultas. Este é o lugar onde a maioria dos sistemas tem o problema clássico de uma consulta por linha, e aqui não tem: a cadeira de performance procurou nas 18 consultas e **não encontrou nenhum caso**.

**A fila foi desenhada para crescer.** `FOR UPDATE SKIP LOCKED` permite dois workers lado a lado sem um esperar o outro, e a chave de dedupe única impede que retentativa vire mensagem duplicada. São as duas decisões difíceis de uma fila, e as duas estão certas.

**Rede nunca acontece dentro de transação, e está escrito por quê.** `src/server/push/avisos.ts:80-82` diz em duas linhas que o envio não recebe a transação porque rede dentro de transação segura conexão de banco esperando a Apple responder.

**Índices parciais escritos à mão onde o schema declarativo não alcança.** A fila só dos pendentes, as ordens só das abertas, a rota só do que está em rua. Índice parcial é conhecimento que quase nenhum projeto deste porte aplica.

**A configuração se recusa a subir errada.** `src/lib/env.ts` valida na partida e falha com a frase que diz o que falta. Os valores de fachada usados na construção da imagem são recusados em execução (`src/lib/env.ts:134-162`), e a defesa está implementada, não apenas documentada.

**A infraestrutura é de qualidade incomum.** A imagem Docker é multi-estágio, não carrega código-fonte nem ferramenta de construção, e roda como usuário sem privilégio. O Postgres fica preso em loopback. O script de publicação confere, depois de migrar, que **todas** as tabelas têm RLS forçado e que **toda** policy de escrita tem `WITH CHECK`. O script de faxina se recusa a rodar limpeza geral do Docker, porque numa VPS compartilhada isso apagaria o banco do vizinho. E o script que publica o domínio tem desfazer automático: guarda a configuração anterior, valida, e restaura sozinho se algum vizinho cair.

**Os comentários de `infra/` e do `Dockerfile` são documentação de incidente.** Cada bloco longo explica um defeito que já aconteceu: o comando que derrubou três sites, o migrador que rodou de imagem velha por três publicações seguidas, o teste de saúde que declarava o banco pronto no meio da inicialização. Quem "limpar" esses comentários apaga o único registro desses aprendizados.

**Onde existe teste, ele é bom.** A máquina de estados tem 28 casos cobrindo saltos proibidos, papéis e pré-condições. O motor tem 21 casos de integração que incluem isolamento entre franquias e a jornada inteira. O dinheiro tem 23 casos, incluindo o centavo do parcelamento. E a bateria `qa/` abre um navegador de verdade, entra com cada papel, preenche formulário e confere no banco se o que a tela disse aconteceu, cobrindo a jornada ponta a ponta com foto e assinatura reais, o isolamento entre franquias, e acessibilidade em 21 telas. Isso é a parte difícil, feita.

## O que está bagunçado

**Não existe nada entre escrever o código e descobrir que ele quebrou.** Não há integração contínua no branch de trabalho: `lint`, `typecheck` e `test` estão escritos no `package.json` e nada os executa sem alguém digitar. Não há registro estruturado, não há rastreio, não há métrica, não há alerta. Se o sistema cair às duas da manhã, quem descobre é o cliente na manhã seguinte. E não há volta: a configuração do proxy tem desfazer automático, o resto da publicação não tem nenhum.

**Não existe onde errar.** Um único ambiente, com um único banco e um único arquivo de segredos. Testar uma migração, conferir se o WhatsApp dispara, ensaiar uma mudança de risco: tudo acontece onde estão as ordens de serviço reais. Enquanto o sistema está novo e com pouco dado, isso não cobrou nada.

**A camada com mais linhas não tem teste nenhum.** As 18 consultas que alimentam todos os painéis somam 7,2 mil linhas e zero testes. O worker e a fila somam 692 linhas e zero testes. A geração de documento, 863 linhas e zero testes. E a correspondência com os defeitos é forte demais para ser coincidência: **22 dos 27 bugs deste relatório vivem em módulos sem um único teste de unidade**, incluindo os três que trocam a ordem do trabalho do dia, datam errado a folha de prova e fazem dinheiro sumir da fatura.

**Duas travas anunciadas nunca podem reprovar.** A bateria `qa/` promete quatro verificações de repositório, e duas delas são cegas para a forma em que o erro aparece: a que deveria pegar acesso ao banco fora do escopo da empresa não casa com a sintaxe usada em todos os nove casos existentes, e a que procura bloco de tratamento de erro vazio não casa com a forma mais comum de escrevê-lo. Trava que sempre passa é pior que trava nenhuma, porque cria confiança sem lastro. É o RS-01, e para mim é o achado mais desconfortável do relatório.

**O único teste das ações de servidor testa uma cópia do código.** `src/server/acoes/proposta.test.ts` redefine dentro de si a função que diz testar. Os cinco casos continuarão verdes no dia em que alguém mudar a regra de desconto ou de arredondamento dentro da ação de verdade.

**O mesmo número tem fórmulas diferentes em telas diferentes.** "A receber" é calculado de dois jeitos (com e sem multa e juros), e "ordem aberta" tem quatro definições distintas em quatro consultas. O dono soma os números da própria tela e eles não fecham, e isso corrói a confiança no painel inteiro mais rápido que qualquer erro grande.

**A conta de fuso horário foi resolvida no JavaScript e não atravessou para o SQL.** Nenhuma das 92 colunas de data e hora do banco guarda fuso. `src/lib/datas.ts` existe inteiro para impedir essa classe de erro e narra os três sintomas que ela já causou, e mesmo assim tudo que acontece depois das 21h em Lajeado é contado no dia seguinte em 14 pontos de consulta e em 2 pontos da folha de rastreabilidade. A mesma tela de calendário mostra a parada em dois dias diferentes conforme a visão que a pessoa escolhe.

**Os componentes de tela vivem onde não se acham.** `src/components` tem um arquivo e 155 linhas. `src/app` tem 38,7 mil linhas e 96 arquivos de componente de cliente, o maior com 2.144 linhas, importado de forma estática por uma tela de lista. Arquivo de 2 mil linhas não é seguro de mexer, e é isso que torna PERF-15 possível.

**A documentação envelheceu mais devagar que o trabalho.** O `README.md` conta 16 passos onde o banco tem 18, manda copiar um arquivo de configuração que hoje está sobrescrito, e diz que o sistema tem 111 testes de unidade quando existem 234 declarados. O `PROCESSOS.md` acerta a estrutura e é anterior a 61 commits. Nenhum dos três documentos avisa que os outros existem.

**Dezenove chamadas de registro soltas, em nove arquivos, e oito delas concentradas no worker.** O subsistema mais opaco do sistema é justamente o que escreve mais mensagens sem estrutura e sem identificador de correlação. Quando um cliente liga dizendo que o orçamento não chegou, o caminho para descobrir por quê é ler o registro do contêiner com olho humano, e passados cinquenta dias aquele registro já rodou fora do teto de 50 MB e não existe mais.

## O placar da auditoria anterior, hoje

Existe um `AUDITORIA_SEGURANCA.md` na raiz, de 13 de agosto de 2026, com 901 linhas sobre o commit `8069c2a`. Ele encontrou nove problemas, quatro deles altos, e registrou sete como corrigidos. Passaram-se cinco semanas e dezenas de commits, e os nove foram reverificados um a um no código de hoje.

| Achado | Gravidade original | Situação hoje |
|---|---|---|
| SEC-001 busca derruba a página | Alta | **Corrigido e continua corrigido.** FATO. |
| SEC-002 PDF do WhatsApp devolve 404 | Alta | **Corrigido e continua corrigido** no código. A resposta HTTP não foi verificada, porque não há servidor. |
| SEC-003 token do portal com 41 bits | Alta | **Corrigido, continua corrigido, e estendido.** Hoje são 256 bits, e a entidade `Proposta`, criada depois daquela auditoria, já nasceu com token forte. A correção virou hábito. |
| SEC-004 falta `FORCE ROW LEVEL SECURITY` | Alta | **Corrigido, continua corrigido, e estendido.** A migração original cobriu 24 tabelas; hoje são 41 de 41. |
| SEC-005 tela de Empresas abre vazia | Média | **Corrigido e continua corrigido.** |
| SEC-006 aplicação reescreve assinatura | Média | **Corrigido e continua corrigido** no código. Nenhuma migração posterior desfaz a revogação. O privilégio efetivo no banco não foi verificado. |
| SEC-007 papel dono com `CREATEDB` | Média | **Nunca corrigido, e não verificável daqui.** Depende do banco de produção. |
| SEC-008 diretório de anexos legível por todos | Baixa | **Não verificável daqui.** A causa foi endereçada na imagem: o contêiner não roda como root. A permissão do volume na VPS continua sem conferência. |
| SEC-009 método HTTP incomum devolve 500 | Baixa | **Corrigido depois daquela auditoria.** Barrado nos dois proxies, os dois citando o SEC-009 no comentário. |

**Resumo: sete corrigidos e ainda de pé, um corrigido depois, um aberto e fora de alcance (SEC-007), um não verificável (SEC-008). Nenhuma regressão silenciosa.** Para uma base que andou 61 commits desde então, isso é um resultado bom e diz algo sobre a disciplina de quem mantém o sistema.

## Os documentos do repositório, um por linha

| Documento | Última alteração | Ainda descreve o sistema que está no disco? |
|---|---|---|
| `README.md` | 13/08/2026 | **Parcialmente.** O modelo de isolamento entre empresas continua exato e vale a leitura. A contagem de passos está vencida (16 onde são 18) e a instrução de copiar o gabarito de configuração não funciona mais. |
| `docs/PLANO.md` | 03/09/2026 | **Sim.** É o mais atual dos cinco. Descreve o que falta construir, não o que existe, e nesse papel está de pé. |
| `PROCESSOS.md` | 17/08/2026 | **Na estrutura sim, nos detalhes não.** Acerta as 18 etapas e traz os diagramas da máquina de estados, mas é anterior a 61 commits que incluíram o orçamento do passo 1, os compromissos, os avisos no celular e o aceite do campo. |
| `DEPLOY.md` | 09/09/2026 | **Sim, e é o documento operacional mais confiável do repositório.** 1.287 linhas, da criação do DNS ao ensaio de restauração. É onde está escrita, com honestidade, a ausência de volta para a migração. |
| `design/*.html` | 13/08/2026 | **Não, e nunca foi a intenção.** São protótipos que fixaram a linguagem visual antes do código. Congelaram por desenho. Não trate a divergência como defeito. |

---

# 4. Problemas

Oitenta e um achados, em quatro grupos, ordenados por gravidade dentro de cada um. Cada grupo abre com uma tabela que traz tudo que o critério exige: identificador estável, onde fica com linha conferida, gravidade, risco de mexer e etiqueta de evidência. Depois da tabela vêm em prosa apenas os achados que precisam de explicação, e para os demais o detalhe completo está no dossiê da cadeira, na mesma numeração.

Os identificadores são estáveis e são os que a seção 5 usa. O sufixo `P` (em `ORG-P` e `SEG-P`) marca a origem, a cadeira de plataforma, e foi mantido para que você consiga abrir o dossiê dela e achar o achado pelo mesmo nome. `RS` são os buracos na rede de testes.

Uma leitura de método, antes das listas. Três achados foram encontrados **duas vezes, por cadeiras diferentes e por caminhos independentes**, e isso vale mais que um achado isolado: corroboração independente é a evidência mais forte que uma auditoria estática consegue produzir. Estão marcados na tabela.

## 4.1 Segurança

Dezesseis achados. Nenhum crítico com a informação disponível hoje, quatro altos, e o veredito da cadeira de segurança foi **bloqueado** para assinatura, com um único item bloqueante: SEG-01.

Nenhum CVE é nomeado e nenhum CVSS é atribuído, pela razão declarada na abertura. Onde havia mapeamento de classe de falha verificável, ele está no dossiê.

| ID | O que acontece | Onde | Grav. | Risco de mexer | Evidência |
|---|---|---|---|---|---|
| **SEG-01** | Uma ação do servidor recebe do navegador a permissão que deveria vir da sessão. **Mesmo achado que BUG-01, encontrado por duas cadeiras.** | `src/server/acoes/estoque.ts:260`, `:265`, `:270`, `:281`, `:288`, `:297` | **Alta** | **Baixo** | FATO (código) · HIPÓTESE (exploração) |
| **SEG-02** | O sistema acredita no endereço de rede que o visitante escreve sobre si mesmo | `src/server/auth/guarda.ts:186-189`; `infra/nginx/dtechmed-proxy.conf:15`; `infra/caddy/dtechmed.caddy:104-116` | **Alta** | Baixo | FATO (nginx) · HIPÓTESE (Caddy) |
| **SEG-P01** | Três segredos que, por desenho, não podem ser trocados se vazarem | `infra/gerar-env.sh:178-180`, `:63-65` | **Alta** | **Alto** | FATO (ausência) · HIPÓTESE (consequência) |
| **SEG-P04** | Imagem Docker anterior a 16/08/2026 pode carregar cópia congelada do `.env` | `infra/faxina.sh:109-120`; `.dockerignore:7-21`, `:28-30` | **Alta se existir** | Baixo | **NÃO VERIFICADO** |
| SEG-03 | Os freios de tentativa vivem na memória do processo e zeram sozinhos. **Também visto pela cadeira de qualidade, como BUG-16.** | `src/app/entrar/acoes.ts:37`; `src/app/esqueci/acoes.ts:68`, `:70`; `src/server/acoes/portal.ts:103`; agrava `src/lib/env.ts:85` | Média | Médio | FATO |
| SEG-04 | O gabarito de configuração perdeu as 41 variáveis do projeto | `.env.example`, na árvore de trabalho | Média | Baixo | FATO |
| SEG-05 | Nenhuma verificação de segurança roda no branch onde o trabalho acontece. **Mesma ausência que ORG-P01 e PERF-19.** | ausência de `.github/`; existe em `origin/claude/amazing-lamport-wa18ah:.github/workflows/seguranca.yml` | Média | Médio | FATO |
| SEG-06 | A cópia de segurança do banco sai sem cifrar. **A metade do `env_file` é o mesmo achado que SEG-P02.** | `infra/backup/run-backup.sh:28`; `docker-compose.yml:224` | Média | Baixo (env) · Médio (cifrar) | FATO (script) · HIPÓTESE (impacto) |
| SEG-P02 | O contêiner de backup recebe todos os segredos do sistema | `docker-compose.yml:224`, contra `:36-41`; `infra/backup/run-backup.sh:28`, `:37-38` | Média | Baixo | FATO |
| SEG-P03 | Os segredos vivem num arquivo no disco, sem cofre e sem registro de quem leu | `infra/gerar-env.sh:85`, `:167`; `docker-compose.yml:114`, `:170`, `:208`, `:224` | Média | Médio | FATO |
| SEG-07 | A ação pública do portal devolve o hash do CPF do cliente | `src/server/acoes/portal.ts:61`, `:79`, `:334`, `:341` | Baixa | Baixo | FATO |
| SEG-08 | Ler assinatura e foto exige estar logado, não exige o papel certo | `src/app/api/assinatura/[id]/route.ts:34`; `src/app/api/foto/[id]/route.ts:18`; `src/app/api/catalogo/[tipo]/[id]/route.ts:35` | Baixa | Médio | FATO |
| SEG-09 | A senha do superadmin de ensaio está escrita no roteiro de testes | `qa/tudo.sh:65` | Baixa | Baixo | FATO |
| SEG-10 | Duas partes do caminho de arquivo não passam pela limpeza que as outras passam | `src/server/arquivos/storage.ts:127`, `:174` | Baixa | Baixo | FATO |
| SEG-11 | Seis pacotes sem hash no lockfile, e três forçamentos de versão sem razão escrita | `package-lock.json`; `package.json:59-63` | Baixa | Baixo | FATO |
| SEG-P05 | O `.env` do diretório está com permissão 644 | `.env` na raiz; `infra/subir.sh:44-49` | Baixa | Nenhum | FATO |

### SEG-01 é o bloqueante, e é barato de consertar

**O que acontece na prática.** Um funcionário de qualquer franquia, logado com a conta mais simples que existe no sistema, consegue escrever a foto de catálogo de uma peça de **outra empresa**. Para isso ele não precisa de ferramenta nenhuma além do próprio navegador: precisa saber o identificador da empresa vizinha e o da peça.

O alcance do dado é estreito, e é justo dizer isso. Essa função lê e grava três colunas de foto. Não devolve valor, nem nome de cliente, nem carteira. O que a torna grave não é o que ela vaza hoje. É que ela é a única porta do sistema por onde a trava do isolamento entre franquias pode ser desligada de fora, e essa trava é a razão de ser do produto de franquia. A cadeira de qualidade chegou ao mesmo lugar por outro caminho e acrescentou a consequência que eu considero a pior: a função grava uma linha na trilha de auditoria com o autor que o chamador escolheu, e num sistema cuja razão de existir é responder "quem mexeu neste aparelho", auditoria forjável contamina o produto inteiro.

**Por que é problema.** Toda ação de servidor deste sistema lê a sessão no servidor e deriva dela a empresa. Das 114 funções exportadas dos 32 módulos `'use server'`, **113 cumprem a regra**. Esta recebe a permissão pronta, como primeiro argumento. As anotações de tipo do TypeScript somem na compilação, então nada valida o que chega ali em execução. E o contexto carrega a marca de super admin, que é o interruptor que as políticas de isolamento consultam para decidir se devolvem as linhas de todas as franquias.

A evidência mais forte é que o repositório **já sabe disso**. O arquivo `src/server/consultas/rastro.ts:9-21` existe justamente para não cometer este erro e escreve a regra com todas as letras: função que recebe contexto nunca fica em `acoes/`. A função `anexarFotoDeCatalogo` recebe contexto e está em `acoes/`. É a regra da casa, quebrada num lugar só.

**A premissa que decide tudo, e que precisa ser confirmada antes de qualquer conserto.** Este achado é grave porque o Next 16 registraria toda função exportada de um módulo `'use server'` como um endereço público, invocável com argumentos vindos do navegador. Isso é verdade nas versões conhecidas, mas o `AGENTS.md` deste repositório avisa que esta versão pode divergir, e a documentação da versão instalada não pôde ser lida porque vive dentro de `node_modules/`. **Confirmar essa única premissa decide se o achado é crítico ou se é apenas uma assinatura infeliz.** É uma leitura de cinco minutos numa máquina com as dependências instaladas, e é o passo 1 do plano.

**Risco de mexer: baixo, e é o melhor retorno do relatório.** A função tem exatamente três chamadas, todas dentro do servidor, todas já de posse de uma sessão validada: `estoque.ts:158`, `estoque.ts:331` e `cadastros.ts:297`. A porta correta já existe e já está escrita, em `estoque.ts:319`. A correção é mover a função para um módulo comum de servidor, sem `'use server'` no topo, e os três chamadores continuam importando normalmente. **Apagar o `export` não basta**, porque `cadastros.ts:8` a importa de outro módulo. Quebram junto, se algo quebrar, três caminhos: o envio de foto no cadastro de peça, o envio no cadastro de equipamento e a troca de foto pelo cartão do catálogo, todos exercitados pela mesma tela.

### SEG-02 é uma linha, e derruba o freio do portal

O sistema lê o endereço de rede do visitante do primeiro item de um cabeçalho que o próprio visitante pode escrever, e o proxy da frente **acrescenta** em vez de substituir. O resultado é que o primeiro item é sempre o que o cliente escreveu.

Duas consequências, e a segunda é pior. A trilha de auditoria registra um endereço que a própria pessoa escolheu, e meses depois, quando alguém perguntar de onde vieram as tentativas, a resposta vai ser confiante e falsa. E o freio que a aplicação aplica sobre o chute de CPF no portal público deixa de valer: quem tiver o link de uma ordem pode tentar documento atrás de documento variando um cabeçalho a cada tentativa. O nome do cliente está impresso na própria tela do portal, o que torna o chute dirigido e não cego, e acertar o documento é o que aprova o orçamento.

O tamanho disso depende de qual proxy está no ar, e o número vale mais que o advérbio. A aplicação permite dez erros a cada quinze minutos. Sob nginx, quem contorna esse freio ainda esbarra no do gateway, que é chaveado pelo endereço real da conexão e não se forja: o teto sai de dez tentativas por quinze minutos para cerca de mil e oitocentas, ou seja, cento e oitenta vezes mais, e não infinito. Sob Caddy não há freio de gateway nenhum. **Qual dos dois está em produção não foi verificado.**

O login continua bem protegido nos dois casos, por duas travas independentes que o cabeçalho não alcança: a zona de limite por endereço real e o contador de senha errada por conta, que vive no banco com bloqueio progressivo.

A correção que a cadeira de segurança prefere atua do lado da aplicação, lendo primeiro o cabeçalho de endereço real, que os dois proxies já definem e que não é acrescentável. É uma função de quatro linhas usada em dez lugares, e nenhum deles decide autorização por endereço: todos só gravam ou comparam.

### Os quatro altos restantes, em uma linha cada

**SEG-P01** registra que `ENCRYPTION_KEY`, `DOCUMENT_HASH_SALT` e o par de chaves de aviso no celular não têm caminho de troca: a primeira protege os tokens de WhatsApp de todas as franquias e trocá-la torna ilegível o que já está guardado; o segundo gera o hash de CPF para busca e trocá-lo faz o sistema não encontrar mais nenhum cliente cadastrado; o terceiro, trocado, deixa cada aparelho já inscrito falhando **em silêncio**. O script documenta as três limitações com clareza exemplar, e documentar não é mitigar.

**SEG-P04** é a pergunta do servidor descrita na abertura, e é a única cuja resposta pode ser "há segredo exposto agora".

**SEG-03, SEG-04, SEG-05, SEG-06 e os baixos** estão detalhados no dossiê `sf-security-engineer/relatorio-revisao-seguranca.md`, com o diff de correção proposto para cada um. Nenhum foi aplicado.

## 4.2 Bugs

Vinte e sete achados de correção: número errado na tela, caminho que quebra, registro que duplica, trabalho que se perde. Um crítico condicionado à premissa do SEG-01, onze altos.

| ID | O que acontece | Onde | Grav. | Risco de mexer | Evidência |
|---|---|---|---|---|---|
| **BUG-01** | Uma ação de servidor recebe do cliente a própria credencial, e a trilha de auditoria fica forjável. **É o SEG-01, por outro caminho.** | `src/server/acoes/estoque.ts:260-269`, `:270`, `:281`, `:297`, `:307` | **Crítica** (se a premissa do framework se confirmar) | **Baixo** | HIPÓTESE (premissa de framework) |
| **BUG-02** | Qualquer pessoa logada satisfaz a exigência das seis fotos e destrava a entrada do aparelho | `src/server/acoes/ordem.ts:526-528`, `:531`, `:549`, `:565`; a trava em `src/server/ordem/motor.ts:287` | **Alta** | Médio | HIPÓTESE |
| **BUG-03** | Dois estornos ao mesmo tempo fazem dinheiro sumir da fatura | `src/server/financeiro/servico.ts:147`, `:156`, `:159`; contraste em `:65-80` | **Alta** | **Baixo** | HIPÓTESE |
| **BUG-04** | O estorno não faz a ordem voltar, e o aparelho sai sem estar pago | `src/server/financeiro/servico.ts:141-179`; `src/server/acoes/financeiro.ts:162-181`; `src/server/ordem/motor.ts:375-388` | **Alta** | Médio-alto | HIPÓTESE |
| **BUG-05** | O trabalho que o worker pegou quando caiu nunca mais volta para a fila. **Mesmo achado que PERF-10.** | `src/server/outbox/worker.ts:50-69`, `:549-567`; `prisma/schema.prisma:1575-1576` | **Alta** | **Baixo** | FATO (ausência) · HIPÓTESE (consequência) |
| **BUG-06** | Aviso que estourou as tentativas não tem como ser reenviado | `src/server/outbox/worker.ts:90`, `:92`, `:98`; `prisma/schema.prisma:1572`; `src/app/painel/whatsapp/page.tsx:69-71` | **Alta** | **Baixo** | FATO (aritmética) · HIPÓTESE (efeito) |
| **BUG-07** | A peça reservada nunca é devolvida quando a ordem é cancelada | `src/server/estoque/servico.ts:296`, `:310-314`; quem deveria chamar: `src/server/ordem/motor.ts:495-500` | **Alta** | Médio | FATO (ausência de chamador) · HIPÓTESE |
| **BUG-08** | Qualquer pessoa logada reescreve o laudo, e sem deixar rastro | `src/server/acoes/orcamento.ts:280-282`, `:296-304` | **Alta** | **Baixo** | HIPÓTESE |
| **BUG-21** | As ordens urgentes vão para o fim do quadro, e acima de 500 somem. **Parente de PERF-04.** | `src/server/consultas/quadro.ts:155-157`; `prisma/schema.prisma:678`; `src/server/acoes/ordem.ts:70` | **Alta** | Baixo (ordem) · Médio (recorte) | FATO (tipo e cláusula) · HIPÓTESE (tela) |
| **BUG-22** | O dia vira às 21h nos gráficos e no calendário, e duas visões da mesma tela discordam | `src/server/consultas/calendario.ts:338`, `:344`; `operacao.ts:83`, `:87`, `:129`, `:327`, `:332`; `caixa.ts:436-445`. São 14 sítios; 9 listados | **Alta** | Médio | FATO (sítios) · HIPÓTESE (comportamento) |
| **BUG-23** | A folha de rastreabilidade agrupa as provas pelo dia errado | `src/server/consultas/rastreabilidade.ts:191`, `:268` | **Alta** | **Baixo** | FATO · HIPÓTESE (folha impressa) |
| BUG-09 | Cada retentativa do PDF cria um documento novo, com link público novo | `src/server/documentos/gerar.ts:619-635`; `src/server/outbox/worker.ts:553-564` | Média | Baixo-médio | HIPÓTESE |
| BUG-10 | A mensagem sai duas vezes quando o registro dela falha | `src/server/outbox/worker.ts:454`, `:457`, `:460`; mesmo desenho em `:684`, `:686` | Média | Médio | HIPÓTESE |
| BUG-11 | Dois cliques ao mesmo tempo na mesma ordem viram erro cru na tela | `src/server/ordem/motor.ts:85-90`, `:105-128`; `prisma/schema.prisma:808`; `src/server/acoes/ordem.ts:295-322` | Média | Baixo | HIPÓTESE |
| BUG-12 | Falta de peça na entrada da manutenção derruba a tela em vez de explicar | `src/server/ordem/motor.ts:181-183`; `src/server/estoque/servico.ts:273`; `src/server/acoes/ordem.ts:303` | Média | Baixo-médio | HIPÓTESE |
| BUG-13 | Recebimento aceita qualquer valor, sem teto | `src/server/acoes/financeiro.ts:39`, `:49-51`; `src/lib/dinheiro.ts:156-157` | Média | Baixo | HIPÓTESE |
| BUG-14 | A ordem que avança no recebimento vem do formulário, não da fatura | `src/server/acoes/financeiro.ts:47`, `:109` | Média | Baixo | HIPÓTESE |
| BUG-15 | A aprovação do cliente acontece em três transações, e pode duplicar a assinatura | `src/server/acoes/portal.ts:193`, `:243-272`, `:274-285`, `:290` | Média | Médio-alto | HIPÓTESE |
| BUG-16 | O freio contra chute de CPF vive na memória do processo. **É o SEG-03, pelo lado da qualidade.** | `src/server/acoes/portal.ts:103`, `:105-123`, `:126-129` | Média | Médio | HIPÓTESE |
| BUG-24 | "A receber" tem duas fórmulas diferentes no mesmo produto | `src/server/consultas/painel.ts:315-316` contra `caixa.ts:184-185`; a ficha do cliente segue a forma curta em `ficha-do-cliente.ts:182` | Média | Baixo | FATO |
| BUG-25 | Faturas canceladas entram no faturamento e no ranking de clientes | `src/server/consultas/operacao.ts:326-329`, `:284`; o enum ignorado em `prisma/schema.prisma:142-147` | Média | Baixo | FATO |
| BUG-26 | Quatro definições diferentes de "ordem aberta" na mesma tela | `src/server/consultas/painel.ts:110`, `:327`, `:448`; `operacao.ts:182` | Média | Médio | HIPÓTESE |
| BUG-27 | Consultas que trazem tudo para mostrar pouco. **Fronteira com PERF-14 e PERF-15.** | `src/server/consultas/painel.ts:431-462`, consumido em `:476`; `propostas.ts:152-156`; `caixa.ts:583`, `:609`; `estoque.ts:92` | Média | Baixo | FATO (painel) · HIPÓTESE (demais) |
| BUG-17 | Atualizar uma linha que a trava do banco esconde vira erro do servidor | `src/server/acoes/orcamento.ts:296`, `:333`; o padrão correto em `src/server/acoes/estoque.ts:299-300` | Baixa | Baixo | HIPÓTESE |
| BUG-18 | Um aviso de celular sem resposta pode parar a fila inteira | `src/server/push/avisos.ts:97-104`; os vizinhos que acertam: `src/server/whatsapp/uazapi.ts:65-66`, `src/server/acoes/cep.ts:51-54` | Baixa | Baixo | HIPÓTESE |
| BUG-19 | A tela de contatos quebra para o dono da plataforma | `src/server/acoes/contatos.ts:189` | Baixa | Baixo | HIPÓTESE |
| BUG-20 | Código morto no worker: uma checagem repetida que ensina a duvidar de qual vale | `src/server/outbox/worker.ts:420-421`, `:526`; a mesma checagem já em `:376` | Baixa | Baixo | HIPÓTESE |

### Os cinco que eu explicaria ao dono numa reunião

**BUG-03 faz dinheiro sumir sem deixar rastro.** O arquivo do financeiro declara, como primeira das três invariantes que o carregam, que a baixa relê o valor pago do banco dentro da transação, porque somar sobre o número que estava na tela apaga o pagamento que outro operador registrou nesse meio-tempo. A função que dá baixa cumpre e trava a linha. A função que estorna, quatro dezenas de linhas abaixo, no mesmo arquivo, não trava nada. Uma fatura paga em duas linhas, estornada nas duas quase ao mesmo tempo por duas pessoas, fica dizendo que uma delas ainda entrou. **O conserto é copiar a trava que já existe quarenta linhas acima**, e `estornar` tem um único chamador em produção.

**BUG-04 entrega o aparelho sem o pagamento que o próprio sistema exigiu.** O caminho de ida está bem amarrado: a ordem só chega a faturada quando o motor confere no banco que a fatura está quitada. O caminho de volta não existe. O gestor estorna porque o pix não caiu ou o cheque voltou, a fatura volta a aberta, **a ordem continua faturada**, e dali segue para a entrega. Ninguém é avisado. O caminho de risco baixo não é criar transição de recuo, que mexeria no arquivo que o projeto chama de lei: é barrar a saída, acrescentando a conferência da fatura à pré-condição da entrega.

**BUG-06 perde avisos de cliente de forma permanente por uma queda banal.** A espera entre tentativas dobra a cada falha, e na sexta o trabalho é descartado. Somando, **cerca de quinze minutos e meio de provedor fora do ar bastam para descartar tudo que estava na fila naquela janela.** A franquia que desconecta o número do WhatsApp por meia hora para trocar de aparelho perde todos os avisos do período, definitivamente: a chave de dedupe é única no banco e o trabalho descartado continua ocupando a chave, então repetir a mesma transição não gera aviso novo. Não existe botão de reenvio no sistema inteiro. A tela conta os descartados e diz que estouraram as tentativas, e para por aí. A honestidade da tela é boa; a falta de conserto é o defeito.

**BUG-21 inverte a fila do trabalho do dia.** O quadro ordena por prioridade em ordem decrescente, e a coluna é texto livre, não uma lista ordenada. Os dois únicos valores que o produto usa são `NORMAL` e `ALTA`, e em ordem de texto decrescente `NORMAL` vem antes de `ALTA`. **O cartão marcado como urgente desce para o fim da lista.** Pior: a mesma consulta corta em 500 ordens sem separar as encerradas, então numa empresa com mais de 500 ordens no total as urgentes são as primeiras a cair fora. O comentário logo acima, nas linhas 140-149, afirma o oposto com todas as letras, e é isso que torna o problema difícil de descobrir: quem for investigar o sumiço vai ler o comentário e procurar em outro lugar. **A ordenação é uma linha.**

**BUG-23 data errado a folha que vai ao auditor.** A folha de rastreabilidade agrupa fotos, assinaturas e documentos por dia, e o dia é tirado do instante em UTC. Uma foto tirada às 22h e um evento das 18h do mesmo dia de trabalho caem em grupos diferentes, e o bloco de provas é impresso na linha do dia errado. `src/lib/datas.ts:7-9` foi escrito exatamente para eliminar esse padrão e narra os três sintomas que ele já causou neste sistema. Ele reapareceu em dois lugares, no documento que o próprio projeto define como a prova apresentada ao cliente, ao fabricante e à vigilância sanitária. **São duas linhas, e a função certa já existe e já é usada no resto do sistema.**

## 4.3 Performance

Dezenove achados. Nenhum quebra com o volume de hoje. Todos quebram sozinhos quando a primeira franquia passar de alguns milhares de ordens, e quebram de um jeito que parece problema de internet: a tela demora, depois a tela erra, depois ninguém sabe dizer por quê.

Nenhum número de milissegundo aparece aqui, porque nada foi medido. O que aparece é contagem de idas ao banco, de linhas trazidas e de arquivos carregados.

| ID | O que acontece | Onde | Grav. | Risco de mexer | Evidência |
|---|---|---|---|---|---|
| **PERF-19** | Não existe portão automático nenhum, então qualquer conserto desta lista pode voltar sem ninguém perceber. **Mesma ausência que ORG-P01 e SEG-05.** | ausência de `.github/workflows/`; `package.json:13`, `:14`, `:22` | **Alta** | Baixo | FATO · NÃO VERIFICADO (portão fora do repositório) |
| **PERF-01** | Cada consulta de tela prende uma conexão do banco inteira, e uma tela pede seis ao mesmo tempo | `src/lib/db.ts:92-108`; `src/app/painel/financeiro/page.tsx:348`; `src/app/painel/page.tsx:96-104`; `infra/gerar-env.sh:103`; `src/app/painel/estoque/page.tsx:81`, `:326`, `:370` | **Alta** | **Alto** | FATO · HIPÓTESE (ponto de estouro) |
| **PERF-02** | A tela mais aberta do painel ordena por uma coluna que não tem índice | `src/server/consultas/listas.ts:79`; `prisma/schema.prisma:752-760`. Mesma ordenação em mais 7: `listas.ts:493`, `:577`, `painel.ts:238`, `campo.ts:229`, `comercial.ts:328`, `quadro.ts:156`, `modelos.ts:99` | **Alta** | **Baixo** | FATO · NÃO VERIFICADO (plano do banco) |
| **PERF-03** | A folha de rastreabilidade varre o registro de auditoria inteiro, e ele nunca é limpo | `src/server/consultas/rastreabilidade.ts:145-161`; `prisma/schema.prisma:1769-1772`; `src/app/painel/equipamentos/[id]/rastreabilidade/page.tsx:12` | **Alta** | **Baixo** | FATO · HIPÓTESE |
| **PERF-04** | O quadro corta em 500 sem separar as encerradas, e o corte derruba as abertas de hoje. **Parente de BUG-21.** | `src/server/consultas/quadro.ts:151-171`, `:140-149`, `:199-233` | **Alta** | Médio | FATO · HIPÓTESE |
| **PERF-05** | Anexar fotos abre uma transação por foto e decodifica cada imagem três vezes, tudo em fila | `src/server/acoes/ordem.ts:540-562`, `:564-566`; `src/server/arquivos/storage.ts:83`, `:108`, `:114` | **Alta** | Médio | FATO · NÃO VERIFICADO (tempo) |
| **PERF-06** | O rastro do motorista grava uma transação por pulso do GPS e joga 24 de cada 25 no lixo | `src/app/app/motorista/rastro.tsx:86-113`, `:112`; `src/server/acoes/rastro.ts:40`, `:69-94` | **Alta** | **Baixo** | FATO · HIPÓTESE (frequência) |
| PERF-07 | As fotos da O.S. e a grade do Instagram podem estar sendo baixadas de novo a cada abertura | `next.config.ts:86-87`; `src/app/api/foto/[id]/route.ts:42`; `src/app/api/insta-imagem/route.ts:94`; `src/app/instagram-feed.tsx:140`; o registro do caso anterior em `src/app/foto-site/[slot]/route.ts:14-20` | Média | Médio | FATO (contradição) · NÃO VERIFICADO (cabeçalho entregue) |
| PERF-08 | A sessão é lida do banco três vezes a cada tela do painel | `src/app/painel/layout.tsx:43`, `:66`; `src/app/painel/page.tsx:37`, `:51`; `src/server/auth/guarda.ts:41`, `:91`; `src/server/auth/sessao.ts:110-126` | Média | **Baixo** | FATO |
| PERF-09 | A fila anda um trabalho por vez, e cada um espera a resposta do WhatsApp | `src/server/outbox/worker.ts:550-567`, `:506-509`; `src/server/whatsapp/uazapi.ts:66`; `src/lib/env.ts:65-66` | Média | Médio | FATO · NÃO VERIFICADO (vazão) |
| PERF-10 | Trabalho que o worker pegou e não terminou nunca volta para a fila. **É o BUG-05.** | `src/server/outbox/worker.ts:50-70`, `:579-592` | Média | **Baixo** | FATO |
| PERF-11 | O PDF é gerado dentro da requisição na emissão manual, contra a regra que o worker documenta | `src/server/acoes/documentos.ts:144-151`; a regra em `src/server/outbox/worker.ts:11-16`; `src/server/documentos/gerar.ts:58`, `:95`; `next.config.ts:29` | Média | Médio | FATO · NÃO VERIFICADO (tempo) |
| PERF-12 | A home pública consulta o banco a cada visita, e o comentário no código diz que não | `src/app/page.tsx:94`, `:86-88`, `:103-104`; `src/server/conteudo.ts:34-38` | Média | Baixo | FATO |
| PERF-13 | A home faz leitura síncrona de disco por foto, no caminho da requisição | `src/app/foto.tsx:74-85`, `:15-22`; `src/server/arquivos/storage.ts:282`; `src/app/page.tsx:292`, `:419`, `:613`, `:690` | Baixa | Baixo | FATO · NÃO VERIFICADO (custo) |
| PERF-14 | Duas filas do Financeiro vêm sem limite de linhas | `src/server/consultas/caixa.ts:581-593`, `:607-625`; a regra da casa em `listas.ts:13-15`; `prisma/schema.prisma:1854-1858` | Baixa | Baixo | FATO |
| PERF-15 | O catálogo inteiro de peças vai para o navegador, junto de um componente de 2.144 linhas | `src/server/acoes/assistente.ts:509-525`; `src/app/painel/ordens/janela-os.tsx:1`; importada de forma estática em `tabela.tsx:6` e `abrir-os.tsx:5`; `src/app/painel/ordens/page.tsx:9-10` | Baixa | Baixo (janela) · Médio (teto no catálogo) | FATO · NÃO VERIFICADO (tamanho em KB) |
| PERF-16 | A busca por equipamento não consegue usar o índice de trigrama criado para ela, e não tolera acento | `src/server/consultas/listas.ts:70-72`; `prisma/migrations/20260812232600_rls_isolamento_multiempresa/migration.sql:297-298` e `:294-295`; `prisma/schema.prisma:617` | Baixa | Baixo | FATO |
| PERF-17 | Duas telas se recarregam sozinhas o tempo todo, e cada recarga refaz a tela inteira no servidor | `src/app/painel/rota/ao-vivo/atualiza-sozinho.tsx:32-47`; `src/app/app/motorista/atualiza.tsx:38-57`; `src/app/painel/rota/ao-vivo/page.tsx:11`; `src/app/app/motorista/page.tsx:14` | Baixa | Médio | FATO |
| PERF-18 | A busca de CEP tenta dois provedores em série, com três segundos cada | `src/server/acoes/cep.ts:49-62`, `:68`, `:33-37` | Baixa | Baixo | FATO |

### O que sustenta os três primeiros

**PERF-19 é o único achado desta lista que não degrada nada sozinho e, ao mesmo tempo, garante que todos os outros possam voltar.** Os três comandos de verificação existem, estão escritos no `package.json`, e nada no repositório os executa. O índice que faltar pode ser acrescentado hoje e removido daqui a seis meses por uma migração descuidada, e ninguém fica sabendo. A descoberta acontece do pior jeito possível: a tela trava na mão do usuário, meses depois, e ninguém liga o travamento à mudança que o causou. Vale duas vezes num produto que vai virar franquia. Há uma dependência que precisa ficar dita: **o orçamento de tempo por tela não pode ser fixado agora**, porque exige uma primeira medição, e a primeira medição exige as dependências instaladas e a aplicação no ar. Fixar limiar antes de medir é inventar número.

**PERF-01 é o único achado da lista que já produziu falha observada em produção neste projeto, e está registrado no próprio código.** O comentário em `src/app/painel/page.tsx:96-99` conta que, com doze abas abertas, quatro carregamentos em trinta e seis morriam por não conseguir abrir transação. A equipe consertou aquela tela juntando quatro blocos numa transação só. As outras telas continuam como estavam, e a aba de relatórios do Financeiro dispara seis ao mesmo tempo, o que somado à leitura de sessão e ao selo do WhatsApp do layout ocupa oito conexões simultâneas de um pool de vinte, para uma pessoa só. O risco de mexer é alto porque `comEscopo` é a trava que sustenta o isolamento e 305 chamadas dependem dela. **O caminho de menor risco não toca em `comEscopo`**: é repetir nas outras telas o agrupamento que já foi feito numa.

**PERF-02 é a correção de melhor relação entre esforço e retorno da lista.** A lista de ordens pede as sessenta mais recentes, ordenando por uma coluna que não tem índice, e o banco precisa reunir todas as ordens que passam no filtro para saber quais são as sessenta. Com trezentas ordens isso é invisível; com trinta mil, é uma ordenação de trinta mil linhas a cada abertura de tela, por pessoa. É um índice, uma linha de schema, sem mudança de comportamento. O cuidado é operacional: a migração que cria índice em tabela grande precisa ser escrita à mão para não travar a tabela durante a publicação, como as seis que já existem no repositório.

## 4.4 Organização

Dezenove achados: doze da cadeira de plataforma sobre entrega e operação, sete da cadeira de qualidade sobre a rede de testes.

| ID | O que acontece | Onde | Grav. | Risco de mexer | Evidência |
|---|---|---|---|---|---|
| **ORG-P01** | Nada confere o código antes de ele virar imagem. **Mesma ausência que SEG-05 e PERF-19.** | ausência de `.github/`; `package.json:13`, `:14`, `:22`; `.git/hooks/` sem gancho ativo | **Alta** | Baixo | FATO |
| **ORG-P02** | O sistema não conta nada sobre si mesmo: nenhum rastreio, nenhuma métrica, nenhum registro estruturado | `package.json:27-57`; ausência de `src/instrumentation.ts`; `docker-compose.yml:92-96`; 19 chamadas de `console.*` em 9 arquivos, 8 delas em `src/server/outbox/worker.ts` | **Alta** | Médio | FATO (ausência) · HIPÓTESE (custo de diagnóstico) |
| **ORG-P03** | Nada avisa ninguém quando o sistema cai | ausência de destino de alerta em `infra/`, `docker-compose.yml` e `package.json`; a rota já existe em `src/app/api/health/route.ts:18` | **Alta** | **Baixo** | FATO |
| **ORG-P05** | A checagem de isolamento roda depois de o sistema já estar no ar, e não desfaz | `infra/subir.sh:99` contra `:168-173`; a função que só imprime e sai em `:29` | **Alta** | Médio | FATO (ordem) · HIPÓTESE (comportamento em falha) |
| **ORG-P06** | A publicação da aplicação não tem volta | `DEPLOY.md:945`; ausência em `infra/subir.sh`; o contraste em `infra/publicar-dominio.sh:222-232` | **Alta** | Médio | FATO |
| **ORG-P08** | O backup tem três fragilidades, e nenhuma aparece até o dia de usar | `infra/backup/run-backup.sh:30`, `:56`; `docker-compose.yml:226`; `DEPLOY.md:498` | **Alta** | **Baixo** | FATO (laço e volume) · NÃO VERIFICADO (backup da VPS e ensaio) |
| **ORG-P11** | Não existe ambiente de teste: o ensaio é a produção com outro nome | `DEPLOY.md:144`, `:570`, `:794`; `infra/virar-dominio.sh:87-94`; `docker-compose.yml:116`, `:172`, `:210`; ausência de `docker-compose.override.yml` e de `.env.staging` | **Alta** | Médio | FATO (inexistência) · HIPÓTESE (leitura do guia) |
| **ORG-P12** | O domínio de ensaio pode continuar apontando para o sistema | `infra/caddy/dtechmed.caddy:74-81`; `DEPLOY.md:790-805`, `:818`, `:822` | **Alta se existir** | **Baixo** | **NÃO VERIFICADO** |
| **RS-01** | A trava que promete "nenhum cliente Prisma sem escopo" nunca pode disparar | `qa/tudo.sh` (a verificação); os nove usos que ela não vê: `src/app/api/health/route.ts:18`, `src/app/api/documento/[token]/route.ts:30`, `src/server/conteudo.ts:36`, `src/server/outbox/worker.ts:590`, `src/server/auth/recuperacao.ts:159` e `:248`, `src/server/acoes/lead.ts:89`, `src/server/acoes/portal.ts:50` e `:323` | **Alta** | **Baixo** | FATO |
| **RS-02** | O único teste das ações de servidor testa uma cópia do código | `src/server/acoes/proposta.test.ts:14-36`, contra `src/server/acoes/proposta.ts:120-130` | **Alta** | **Baixo** | FATO |
| ORG-P04 | O teste de saúde diagnostica e ninguém age sobre ele | `docker-compose.yml:143-148`, `:113` | Média | Baixo-médio | FATO · HIPÓTESE |
| ORG-P07 | O arquivo que ensina a configurar o sistema foi substituído por outro, de outro produto | `.env.example` na árvore de trabalho contra `git show HEAD:.env.example`; `README.md:79` | Média (alta para quem instala) | **Baixo** | FATO |
| ORG-P09 | A esteira tem três contagens diferentes em três documentos | `README.md:26` (16); `PROCESSOS.md:9` (18); `prisma/schema.prisma:48-70` (18 + 3 ramos); `src/server/ordem/roteiro.ts:5` (11 na tela) | Média | **Baixo** | FATO |
| RS-03 | A bateria de ponta a ponta dorme 315 vezes por tempo fixo, em vez de esperar a condição | `qa/jornada.mjs:50`, `:86`, `:365`, `:377`; `qa/diagrama.mjs:27`; `qa/lancar.mjs:17`; `qa/financeiro.mjs:16`; `qa/estoque.mjs:16`. São 315 em 40 roteiros; 8 listados | Média | Baixo por arquivo · Alto se feito de uma vez | FATO (contagem) · NÃO VERIFICADO (instabilidade real) |
| ORG-P10 | Documentação congelada contra um código que andou 61 commits | `README.md`, `PROCESSOS.md`, `docs/PLANO.md`, `DEPLOY.md`, `design/*.html`. O detalhe na seção 3 | Baixa-média | Nenhum | FATO |
| RS-05 | O README conta 111 testes de unidade; existem 234 blocos declarados | `README.md` (tabela de comandos), contra a contagem no disco | Baixa | Nenhum | FATO (blocos) · NÃO VERIFICADO (o que a suíte imprime) |
| RS-07 | A trava "nenhum catch vazio" não casa com a forma mais comum de escrever um | `qa/tudo.sh` (a verificação); a ocorrência em `src/app/consentimento-arranque.ts:46` | Baixa | Baixo | FATO |
| RS-04 | As camadas onde estão os bugs são exatamente as que não têm teste. Leitura que atravessa a lista, não achado com correção própria | `src/server/consultas/` (7.198 linhas, 0 testes); `src/server/outbox/` (692, 0); `src/server/acoes/` (10.266, 1 e ele testa uma cópia) | Leitura | Não se aplica | HIPÓTESE (correspondência) |
| RS-06 | O que a bateria `qa/` de fato protege, e os quatro eixos que ela não alcança por natureza | `qa/tudo.sh` (38 roteiros); `qa/README.md` | Julgamento | Não se aplica | Julgamento declarado |

### Os dois que mudam o valor de todo conserto que vier depois

**RS-01 é o achado mais desconfortável deste relatório.** A bateria anuncia uma trava que garante que nenhum acesso ao banco escape do escopo da empresa. Rodando exatamente o comando que ela usa, o resultado é zero e a trava passa. Rodando a busca pela sintaxe que o projeto de fato usa, aparecem nove acessos crus ao banco fora do escopo. A expressão da trava casa letra, número e sublinhado, e **não casa o cifrão**, que é justamente como todo acesso cru começa neste projeto. A trava foi escrita para pegar exatamente essa classe de erro e é cega para a forma em que ela aparece.

Os nove usos de hoje parecem deliberados: chamam funções do banco que convertem token em empresa, e cada um tem comentário explicando. **O defeito não é que existam. É que a casa acredita ter um alarme que impede o décimo de aparecer sem revisão**, e o décimo não precisa vir com comentário. Trava que sempre passa é pior que trava nenhuma, porque cria confiança sem lastro. O trabalho real não é a expressão: é revisar os nove e decidir quais entram numa lista explícita de exceções, cada uma com o motivo.

**RS-02 é a correção com melhor relação entre esforço e retorno de toda a seção.** O único arquivo de teste de um diretório com 10.266 linhas redefine dentro de si a função que diz testar, e testa essa cópia. A cópia e o original coincidem hoje, e é por isso que o problema é invisível: os cinco testes continuarão verdes no dia em que alguém mudar o desconto, o arredondamento ou a regra do preço negativo dentro da ação de verdade. A função é pura, não depende de sessão nem de banco, e extraí-la para uma função exportada do mesmo módulo é trabalho de horas.

### O que a bateria `qa/` protege, e os quatro eixos que ela não alcança

Isto é julgamento, e está declarado como tal. A bateria de 47 arquivos e 10,9 mil linhas é a rede de segurança real deste projeto, e é melhor do que a contagem de arquivos de teste sugere. Ela cobre a jornada inteira com foto e assinatura reais, o isolamento entre franquias, o freio de chutes do portal, os quatro cartões do financeiro, e acessibilidade em 21 telas com o papel que usa cada uma.

O que ela não protege, e que ninguém mais protege, são quatro eixos que roteiro de navegador não alcança por natureza:

1. **Concorrência.** Todo roteiro é uma pessoa de cada vez. BUG-03, BUG-11 e BUG-15 passariam verdes.
2. **Falha de dependência.** Nenhum roteiro derruba o provedor de WhatsApp, o servidor de aviso ou o banco no meio de uma operação. BUG-05, BUG-06, BUG-09, BUG-10 e BUG-18 passariam verdes.
3. **Entrada forjada.** Os roteiros dirigem o navegador, então mandam o que a tela manda. BUG-01 e BUG-02 passariam verdes.
4. **O tempo passando.** Nenhum roteiro cancela uma ordem com peças reservadas e volta depois para conferir o saldo livre. BUG-07 passaria verde.

Isso não é crítica à bateria. É o argumento para onde o próximo teste deve nascer: não em mais roteiros de tela, e sim em testes de integração que exercitem corrida, retentativa e entrada hostil contra um banco de verdade. A cadeira de qualidade propôs os dez primeiros testes a escrever, e **dez testes pequenos pegam onze dos trinta e quatro achados do dossiê dela**. A lista está em `sf-qa-engineer/dossie-bugs-e-rede-de-seguranca.md`.

---

# 5. Plano

## Os três primeiros itens, e por que são esses três

**1. Confirmar a premissa que decide o achado mais grave.** Numa máquina com as dependências instaladas, abrir `node_modules/next/dist/docs/` e confirmar se o Next 16 registra toda função exportada de um módulo `'use server'` como um endereço público invocável com argumentos vindos do navegador. É uma leitura de minutos. Ela decide se SEG-01 / BUG-01 é um achado crítico de escalada de privilégio entre franquias ou apenas uma assinatura infeliz, e nada mais deveria começar antes disso. Se a premissa cair, o item sai da primeira onda e a correção continua valendo como higiene, sem urgência.

**2. Rodar dois comandos na VPS.** `docker images -f dangling=true` responde SEG-P04, e é a única pergunta deste relatório cuja resposta pode ser "há segredo de produção exposto agora". `dig +short conexevolution.online` responde ORG-P12, e diz se existe um segundo nome de domínio vivo chegando ao mesmo sistema, com o mesmo login e os mesmos dados de cliente. Vinte minutos ao todo. Se as duas respostas forem negativas, os dois achados saem da lista e você planeja o resto com a cabeça limpa.

**3. SEG-01 / BUG-01 e SEG-02, no mesmo mexido.** O primeiro é o único item que impede a assinatura de segurança, e é o mais barato de corrigir entre os graves: uma função movida de arquivo, três chamadores ajustados, nenhuma tela mudando de comportamento. O segundo é uma linha e devolve o freio do portal público e a honestidade da trilha de auditoria. Os dois são de risco baixo, os dois fecham o mesmo tipo de buraco (uma decisão de confiança tomada no lugar errado), e fazê-los juntos custa uma verificação só.

Esses três vêm primeiro por uma razão que não é a gravidade: **são os únicos que mudam o próprio plano.** Os dois primeiros podem apagar itens da lista, e o terceiro é o que desbloqueia a assinatura de segurança. Tudo o mais pode ser reordenado sem prejuízo; esses três não.

## As ondas

Esforço em horas ou dias de uma pessoa que já conhece o repositório. Onde um item precisa ficar sozinho num mexido para ser reversível, está dito.

### Onda 0 — as três perguntas. Meio dia, nenhum arquivo tocado.

| Item | Esforço | Impacto para o negócio | Risco | Pré-requisito |
|---|---|---|---|---|
| Premissa do SEG-01 / BUG-01 | 30 min | Decide se existe um achado crítico | Nenhum | Uma máquina com `npm ci` rodado |
| SEG-P04 (imagens paradas) | 10 min | Pode revelar segredo exposto hoje | Nenhum para olhar. Limpar só pelo `faxina.sh`, que protege os vizinhos | Acesso à VPS |
| ORG-P12 (DNS do ensaio) | 5 min | Pode revelar um segundo caminho aberto ao sistema | Nenhum | Acesso ao painel de DNS |
| Rodar `typecheck`, `lint` e `test` na mão, e anotar o resultado | 1 h | Diz se a suíte já está vermelha, o que muda a estimativa da onda 4 | Nenhum | Dependências instaladas |

O último item não é cerimônia. Se a suíte já estiver vermelha, ligar a verificação automática deixa de ser tarefa de meio dia e vira tarefa de dois dias, e é melhor descobrir isso agora.

### Onda 1 — a fronteira de confiança e as travas que mentem. 1 a 2 dias, risco baixo.

| Item | Esforço | Impacto | Risco | Pré-requisito |
|---|---|---|---|---|
| SEG-01 / BUG-01 | 2 a 4 h | Fecha a única porta por onde o isolamento entre franquias pode ser desligado de fora, e devolve valor de prova à trilha de auditoria | **Baixo.** Três chamadas, todas dentro do servidor. Quebram junto: envio de foto no cadastro de peça, no de equipamento e a troca pelo cartão do catálogo | Onda 0, item 1 |
| SEG-02 | 1 h | Devolve o freio do portal contra chute de CPF, e faz o endereço da trilha voltar a significar algo | **Baixo.** Função de quatro linhas em dez pontos de uso, nenhum decide autorização por endereço | Nenhum |
| RS-01 | 4 a 6 h | O alarme volta a poder disparar. A maior parte do tempo é revisar os nove usos existentes e decidir quais viram exceção declarada | Baixo | Nenhum |
| RS-02 | 2 a 3 h | O cálculo que define o que a casa cobra passa a ter teste de verdade | Baixo. A função é pura | Nenhum |

Os quatro cabem no mesmo mexido. RS-01 e RS-02 vêm junto com os dois primeiros de propósito: consertar bug com a rede furada é consertar no escuro, e essas duas correções mudam o valor de todo teste que vier depois.

### Onda 2 — os números errados na tela. 2 a 3 dias, risco baixo, e avise antes.

| Item | Esforço | Impacto | Risco | Pré-requisito |
|---|---|---|---|---|
| BUG-21 (ordenação) | 1 h | O cartão urgente volta ao topo do quadro. É a fila que a operação usa para decidir o que fazer primeiro | Baixo. É a única ordenação por prioridade do projeto | Nenhum |
| BUG-23 | 1 h | A folha de rastreabilidade para de datar a prova num dia em que ela não foi produzida | Baixo. Duas linhas, e a função certa já existe. Confira contra `qa/azul-rastreabilidade.mjs` | Nenhum |
| BUG-24 | 2 h | Dashboard e Financeiro passam a mostrar o mesmo valor a receber | Baixo. O número do Dashboard vai **subir** para o que o Financeiro já mostrava | Avisar quem acompanha |
| BUG-25 | 1 h | Faturamento e ranking de clientes param de contar fatura anulada | Baixo. O faturamento vai **cair** | Avisar quem acompanha |
| BUG-26 | 3 a 4 h | Os números do Dashboard passam a fechar entre si | Médio. O risco não é técnico: os quatro números mudam ao mesmo tempo | BUG-24 e BUG-25 no mesmo lote |
| BUG-19, BUG-17, BUG-20 | 2 h | Higiene. A tela de contatos para de quebrar para o dono da plataforma | Baixo | Nenhum |

O cuidado desta onda inteira é de comunicação, não de código. Quatro números da tela mudam de valor no mesmo dia, e quem acompanha o painel diariamente vai precisar saber por quê. Escreva o aviso antes de subir.

### Onda 3 — o fuso horário, sozinho. 1 a 2 dias, e não vai junto com nada.

| Item | Esforço | Impacto | Risco | Pré-requisito |
|---|---|---|---|---|
| BUG-22 | 1 a 2 dias | Todo gráfico de operação e de caixa passa a contar o dia certo, e as duas visões do calendário param de discordar | **Médio.** São 14 pontos, e cada um muda um número que alguém já usa para decidir | Onda 2 concluída e comunicada |

Este fica sozinho por uma razão prática. Mexer nos 14 de uma vez faz todos os gráficos mudarem no mesmo dia, sem ninguém saber se a mudança foi a correção ou a operação. O caminho é corrigir um, conferir contra o banco, e só então seguir. Vir depois da onda 2 também é deliberado: se os números já mudaram uma vez naquela semana, misturar as duas causas torna impossível explicar qualquer coisa.

### Onda 4 — o portão, o alerta e o backup. 2 a 3 dias, risco baixo, não toca no produto.

| Item | Esforço | Impacto | Risco | Pré-requisito |
|---|---|---|---|---|
| ORG-P03 | 2 h | "Descobrimos pelo cliente na manhã seguinte" vira "descobrimos em um minuto". A rota de saúde já existe e já consulta o banco | **Baixo.** Monitor externo, não toca em nenhuma linha do sistema | Nenhum |
| ORG-P08 | 4 h | O backup passa a ter relógio de verdade e cópia fora da máquina. É o único achado cuja falha é irreversível | Baixo | Nenhum |
| ORG-P01 / SEG-05 / PERF-19 | 4 a 8 h, ou 2 dias se a suíte estiver vermelha | Nada volta em silêncio. Sem isso, cada conserto desta lista compra melhora temporária pelo preço de melhora permanente | Baixo tecnicamente. O risco é ligar o portão com a suíte vermelha e a equipe aprender a ignorá-lo | Onda 0, item 4. Ligue primeiro o que já passa hoje |
| SEG-P02 / SEG-06 (a metade do `env_file`), ORG-P07, ORG-P09, RS-05 | 1 h no total | Quatro edições pequenas e independentes: tirar os segredos do contêiner de backup, restaurar o gabarito de configuração, corrigir a contagem de passos e a de testes no README | Baixo. Confirme com `docker compose config` antes de subir | Nenhum |

Uma nota sobre o limite honesto desta onda. **Não existe portão contra regressão de performance hoje, e não vai existir ao fim dela.** O que se liga aqui são os três comandos que já estão escritos. O orçamento de tempo por tela exige uma primeira medição, que exige as dependências instaladas e a aplicação no ar, e fixar limiar antes de medir é inventar número. Isso fica no plano como tarefa da onda 7, não como resolvido.

### Onda 5 — dinheiro, fila e estoque. 3 a 4 dias, risco variado.

| Item | Esforço | Impacto | Risco | Pré-requisito |
|---|---|---|---|---|
| BUG-03 | 2 h | Dois estornos simultâneos param de apagar pagamento. O caixa do dia volta a fechar | **Baixo.** O padrão certo está quarenta linhas acima, no mesmo arquivo. Um chamador em produção | Nenhum |
| BUG-05 / PERF-10 | 3 a 4 h | O aviso que ficou preso na queda do worker volta para a fila. Hoje ele some para sempre e nada acusa | **Baixo.** Uma consulta a mais no início de cada volta. O cuidado é o prazo: curto demais faz dois workers pegarem o mesmo trabalho | Nenhum |
| BUG-06 | 4 h | Meia hora de WhatsApp fora do ar deixa de custar todos os avisos do período. Precisa de teto maior de tentativas **e** de uma ação de reenfileirar que limpe a chave de dedupe | Baixo | BUG-05 primeiro |
| BUG-07 | 6 a 8 h | A peça reservada volta à prateleira quando a ordem é cancelada. Hoje o saldo livre encolhe para sempre | **Médio.** Precisa de uma variante que receba a transação, como já foi feito para a função irmã. E há um segundo defeito no corpo da função, em `servico.ts:310-314` | Nenhum |
| BUG-13, BUG-14 | 3 h | Recebimento com teto, e a ordem que avança passa a vir da fatura e não do formulário | Baixo | Nenhum |
| BUG-04 | 4 a 6 h | O aparelho para de sair para entrega com a conta em aberto | **Médio-alto** se feito pelo caminho elegante. Faça pelo caminho barato: **não mude a etapa**, barre a saída acrescentando a conferência da fatura à pré-condição da entrega. Não toque na tabela de transições | BUG-03 |
| BUG-02, BUG-08 | 6 a 8 h | A exigência das seis fotos deixa de ser contornável, e o laudo passa a ter dono registrado | **Médio** para BUG-02: a mesma função é chamada por duas telas com papéis diferentes, e apertar demais trava o técnico que tira foto de entrega. **Baixo** para BUG-08 | Onda 1 |

### Onda 6 — índices e memória de requisição. 1 a 2 dias, risco baixo, não muda comportamento.

| Item | Esforço | Impacto | Risco | Pré-requisito |
|---|---|---|---|---|
| PERF-02 | 3 h | A tela mais aberta do painel para de piorar a cada mês | **Baixo.** Índice não muda resultado. A migração precisa ser escrita à mão para não travar a tabela na publicação | Nenhum |
| PERF-03 | 3 h | A folha de rastreabilidade para de varrer o registro de auditoria inteiro | Baixo. O mesmo cuidado de migração | Nenhum |
| PERF-08 | 2 h | Três leituras idênticas de sessão por tela viram uma. A técnica já está em uso em outro ponto do projeto | Baixo | Nenhum |
| PERF-16 | 3 h | A busca por marca, modelo e número de série passa a usar índice | Baixo | Nenhum |

Os quatro cabem no mesmo mexido. A limpeza periódica do registro de auditoria fica de fora porque não é decisão técnica: é decisão de negócio sobre quanto tempo de trilha a empresa precisa guardar para atender a vigilância sanitária. Decida isso separado, e não dentro de um conserto de performance.

### Onda 7 — tirar trabalho da requisição, e o ambiente. 1 a 2 semanas.

| Item | Esforço | Impacto | Risco | Pré-requisito |
|---|---|---|---|---|
| PERF-06 | 3 h | O celular do motorista para de mandar posição que o servidor vai descartar. Alivia o pool e a bateria | Baixo. O freio do servidor continua exatamente onde está | Sozinho, toca código que o campo usa todo dia |
| PERF-05 | 1 dia | O técnico para de esperar com o botão parado ao enviar doze fotos | Médio. Junte as inserções numa transação e decodifique uma vez só. **Não paralelize as fotos**: o processamento de imagem pode prender o processo web inteiro | Sozinho |
| ORG-P11 | 1 a 3 dias | Um lugar para errar. É decisão sua antes de ser tarefa: máquina pequena separada, ou segunda gaveta que sobe só para testar e desce depois | **Médio**, e o perigo tem nome: uma segunda gaveta que compartilhe o volume do banco ou o arquivo de segredos não é ambiente de teste, é um segundo caminho para a produção, e seria pior que não ter nenhum | Decisão sua |
| ORG-P05 | 3 h | O script de publicação passa a derrubar a gaveta quando a checagem de isolamento reprovar, em vez de imprimir um aviso e sair | Médio | **ORG-P11.** Hoje não há onde ensaiar essa mudança sem ensaiá-la na produção |
| ORG-P06 (só a metade barata) | 4 h | Etiquetar a imagem anterior e poder voltar a ela num comando. Resolve a volta do código; a da migração é decisão de arquitetura | Médio | ORG-P11 |
| PERF-19 (a segunda metade) | 4 h | Fixar o orçamento de tempo por tela, com número medido | Baixo | Onda 4, e uma primeira medição com a aplicação no ar |

### Onda 8 — o resto, sem pressa

PERF-01 (agrupar as consultas por tela, começando pelo Financeiro) **fica sozinho num mexido**, e a prova de isolamento por RLS tem de rodar antes e depois: é o achado de maior alcance e de maior risco da lista de performance. PERF-09, PERF-11, PERF-04, PERF-14, PERF-15, BUG-09, BUG-10, BUG-11, BUG-12, BUG-15, BUG-18, BUG-27, SEG-03/BUG-16, SEG-04, SEG-07, SEG-09, SEG-10, SEG-11, SEG-P05, ORG-P02, ORG-P04, RS-03 e RS-07 entram aqui, cada um com o detalhe no dossiê da cadeira. ORG-P02 (o registro estruturado com identificador de correlação, e só depois o rastreio) é o maior deles, 16 horas ou mais, e só faz sentido depois que a verificação automática existir.

## O que eu recomendo não mexer agora, e por quê

**O motor da esteira e a máquina de estados** (`src/server/ordem/motor.ts` e `maquina-estados.ts`). São o arquivo que o projeto chama de lei e o que concentra a maior densidade de teste. BUG-11, BUG-12 e BUG-15 passam por ali, e os três têm uma correção de fora, no chamador, que resolve o que a pessoa vê sem tocar no núcleo. A correção bonita dentro do motor pode esperar até existir teste de concorrência para provar que ela não quebrou nada, que é exatamente o teste que hoje não existe.

**SEG-P01, a rotação de segredo.** Resolver de verdade exige versionar as chaves, guardar qual chave cifrou cada registro e recifrar aos poucos, e isso mexe em como todo dado sensível é lido no sistema inteiro. É trabalho de arquitetura, e a primeira onda tem coisas de risco muito menor e retorno maior. Fica na lista de riscos aceitos, com seu nome ao lado.

**SEG-P03, o cofre de segredos.** Mesma razão, e o ganho só aparece quando houver mais de um operador com acesso ao servidor.

**ORG-P04, o reinício automático do contêiner.** Faça depois de ORG-P03. Reinício automático antes de haver alerta esconde a causa em vez de resolver o problema.

**PERF-17, a frequência das telas que se atualizam sozinhas.** Uma tela "ao vivo" que atrasa um minuto não é ao vivo. O caminho certo é transportar menos por atualização, não atualizar menos, e isso é redesenho, não ajuste.

**PERF-12, cachear a home pública.** Exige amarrar a invalidação na ação de salvar, e o próprio código defende que a mudança feita pelo painel apareça na visita seguinte, sem "espere cinco minutos". Enquanto essa amarração não existir, a decisão honesta é deixar como está e corrigir o comentário que afirma o contrário.

**PERF-18, a busca de CEP.** Mexer nele sozinho não paga a viagem. Vale se alguém já estiver naquele arquivo.

**As 315 esperas por tempo fixo da bateria (RS-03), de uma vez.** São 315 pontos em 40 roteiros, e converter todos num mexido é risco alto sem retorno proporcional. O caminho é medir quais reprovam em passadas repetidas e converter só esses, começando pelas esperas acima de dois segundos, que são poucas e são as que mais custam tempo de bateria. Nenhuma reprovação foi observada, porque a bateria não pôde ser rodada.

**`infra/nginx/*.conf`.** Parece código morto e não é. Fica guardado de propósito, para o dia em que o projeto ganhar máquina própria, e diz isso na primeira linha.

**`design/*.html`.** Divergem do sistema porque congelaram em 13 de agosto, por desenho. Não são defeito.

**`src/generated/prisma`.** Código gerado. Não é dívida e não deve ser contado como tal.

**A reconstrução obrigatória do migrador e a recusa do script de faxina a rodar limpeza geral.** As duas parecem inconveniências e as duas são cicatrizes: a primeira existe porque por três publicações seguidas as migrações rodaram a partir de uma imagem velha e a publicação passou verde com uma tabela faltando; a segunda porque numa VPS compartilhada a limpeza geral apagaria o banco do vizinho. Acrescentar uma opção "por conveniência" em qualquer das duas reabre um defeito que já custou caro.

## Os riscos que ficam, e quem precisa decidir

Nenhum destes foi aceito por ninguém ainda, porque esta etapa não teve contraparte humana. Cada um precisa de um nome ao lado antes do próximo envio para produção.

| O que fica | Por quê | Quem decide |
|---|---|---|
| Os 81 achados, todos | Isto é auditoria, não conserto. Nada foi aplicado | Você |
| A superfície de dependências, inteira | Não auditada. Sem rede e sem árvore instalada | Você, ao decidir se roda `npm audit` antes do próximo envio |
| Imagens Docker anteriores a 16/08/2026 | Podem carregar o `.env` daquela data. Não verificável daqui | Quem tem acesso ao registry e à VPS |
| SEC-007 e SEC-008 da auditoria anterior | Dependem do banco e do volume de produção | Quem administra a VPS |
| A não rotação de `SESSION_SECRET` e `ENCRYPTION_KEY` | Não há registro de que já tenham sido trocados | Você |
| O adversário considerado | A análise adotou o adversário da classe do produto, descrito em `sf-security-engineer/threat-model.md`, porque nenhum estava declarado. Se você tiver outro em mente, um concorrente com recursos ou um ex-funcionário com acesso ao servidor, a gravidade de vários achados sobe | Você |
