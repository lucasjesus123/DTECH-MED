# A bateria

O que prova que o DTECH MED funciona. Roda o sistema como um humano roda:
abre o navegador, entra com cada papel, preenche formulário, salva, e confere
no banco se o que a tela disse realmente aconteceu.

```bash
bash qa/tudo.sh
```

## Por que ela mora aqui

Ela vivia em `/var/tmp`. A cada reinício de máquina, sumia — a prova de que o
sistema funciona estava sempre a um reinício de deixar de existir, e reescrevê-la
custava mais do que escrevê-la da primeira vez. Agora versiona junto do que ela
testa: quem muda uma tela vê no mesmo diff o teste que a cobre.

## O que ela precisa

| | |
|---|---|
| servidor de desenvolvimento | de pé em `127.0.0.1:3111` |
| Postgres de ensaio | o `.env` dele em `QA_PG_ENV` |
| playwright e axe-core | instalados globalmente (`npm i -g playwright axe-core`) |

Nada aqui toca em produção. Todo endereço aponta para `127.0.0.1`, e o banco é
**apagado e semeado do zero** — é por isso que a bateria só roda em máquina de
desenvolvimento.

## Ajustes por ambiente

Tudo tem padrão; mexa só no que for diferente na sua máquina.

| variável | padrão | o que é |
|---|---|---|
| `QA_BASE` | `http://127.0.0.1:3111` | onde o sistema responde |
| `QA_PG_ENV` | `/var/tmp/pgdemo/env` | o `.env` do Postgres de ensaio |
| `QA_PG_SUBIR` | `/var/tmp/pgdemo/pg.sh` | o que levanta o Postgres |
| `QA_PG_PORTA` | `5599` | porta do Postgres de ensaio |
| `QA_SENHA` | a do `db:seed --demo` | senha das contas de ensaio |
| `QA_LOGS` | um diretório temporário | onde ficam os registros de cada bloco |

**A senha não está escrita nos arquivos.** O repositório é público, e credencial
em repositório público é credencial vazada — mesmo sendo de banco de
demonstração, porque alguém sempre reaproveita a mesma em produção. Os arquivos
de configuração trazem `${QA_SENHA}`, e o motor resolve em tempo de execução.

## As três fases, e por que nesta ordem

**1 · Código.** Tipos, lint, testes unitários, auditoria de dependências, e
quatro travas que valem para o repositório inteiro: nenhuma SQL concatenada,
nenhum `catch` vazio, nenhum cliente Prisma fora do escopo de empresa. São
baratas e pegam a classe de erro que passa despercebida em revisão de diff.

**2 · Sistema em uso.** O navegador de verdade. Cada roteiro está listado
abaixo.

**3 · Integração.** Por último **porque apaga o banco**. Inverter a ordem faria
a fase 2 rodar contra um banco vazio, e todo roteiro reprovaria por falta de
dado — a forma mais confusa de falhar, porque parece defeito do produto.

## Os roteiros

| arquivo | o que prova |
|---|---|
| `jornada.mjs` | as 18 etapas da esteira, ponta a ponta, com foto e assinatura de verdade |
| `diagrama.mjs` | cada afirmação do diagrama do sistema confere com o que o código faz |
| `engine/fluxos.js` | os 11 caminhos do diagrama, clicando botão por botão |
| `isolamento.mjs` | uma franquia não alcança nada da outra — nem ficha, nem busca, nem foto |
| `carteira.mjs` | todo cliente tem dono, e a carteira respeita o papel de quem olha |
| `portal-chutes.mjs` | o portal do cliente freia tentativa de adivinhar CPF |
| `busca500.mjs` | nenhuma combinação de busca derruba a tela |
| `restantes.mjs` | as telas que o robô de varredura não alcança sozinho |
| `caixa.mjs` | contas a pagar e a receber, parcelas, baixa, recorrências e gráficos |
| `inicio.mjs` | recorrência retroativa: "começa em", e gerar um mês já passado |
| `acompanhar.mjs` | o cartão diz onde o aparelho está, e mostra a prova |
| `catalogo.mjs` | foto de peça e de equipamento: sobe, troca, sai, e não vaza para a outra franquia |
| `cliente.mjs` | a ficha do cliente: dinheiro, aparelhos, histórico e cadastro |
| `comercial.mjs` | o funil de orçamentos: só a última versão, a ordem da urgência, a taxa |
| `calendario.mjs` | o calendário junta cinco fontes — e o motorista não vê dinheiro |
| `documentos.mjs` | contrato pelo total, promissória pelo saldo em aberto, e o técnico sem o botão |
| `lancar.mjs` | as telas que só mostravam passam a receber: compromisso, conta pelo dia, contato à mão, e a aprovação do Financeiro |
| `ler-pdf.mjs` | não é roteiro: extrai o texto de dentro de um PDF, para os testes conferirem o que está ESCRITO e não só que um arquivo saiu |
| `fundo-caixa.mjs` | o caixa no celular, no teclado e no leitor de tela |
| `a11y.mjs` | acessibilidade (axe-core) em 21 telas, cada uma com o papel que a usa |

## Como escrever um roteiro que não reprova sozinho

Um teste que reprova ao acaso ensina a ignorar reprovação — o pior estrago
possível numa bateria. Três regras, todas aprendidas errando:

**Espere a CONDIÇÃO, nunca um tempo fixo.** `avancar` em `jornada.mjs` dormia
2400 ms depois de clicar. O servidor de desenvolvimento compila rota sob
demanda, então a mesma transição às vezes leva 1 s e às vezes 3 — e em quatro
passadas caíram três conferências diferentes, todas passando quando repetidas.
Hoje ele lê a etapa, clica, e observa o banco até ela mudar.

**Semeie do zero antes de cada passada.** Sobra de execução anterior reprova a
seguinte de um jeito que parece defeito do produto: uma ordem antiga na fila de
faturamento faz o roteiro clicar no `.first()` errado.

**Não herde o dado de outro roteiro.** É o acoplamento mais difícil de enxergar,
porque não aparece em nenhum arquivo: os roteiros ficam presos à ORDEM em que
rodam. O `documentos.mjs` foi o primeiro a pagar — sozinho passava, na bateria
reprovava dizendo "sem botão Emitir contrato", acusando a tela. A tela estava
certa: não existia nenhuma ordem com orçamento aprovado e saldo em aberto,
porque o `db:seed --demo` não cria ordens e a `jornada.mjs` leva a dela até
quitada. Hoje o `semear()` roda também o `scripts/cenario-demo.mts`, que monta 23
ordens em seis etapas pelo motor — todo roteiro começa do mesmo lugar.

**Não rode duas passadas ao mesmo tempo.** Elas compartilham o banco, e o
`TRUNCATE` de uma apaga o mundo da outra no meio do caminho.
