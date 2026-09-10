# REDESENHO — o sistema "Azul Máquina" (`ui_v2`)

Este documento é o mapa do redesenho: o que entrou, onde cada coisa mora, como
se liga, e — na §6 — as **duas mudanças de regra de negócio que foram decididas
pelo dono**, com o que cada uma trocou e como reverter.

---

## 1. Como ligar (e como desligar)

A flag é **por empresa**, na coluna `tenants."uiV2"`.

```sql
-- Ligar para uma empresa
UPDATE tenants SET "uiV2" = true WHERE slug = 'dtechmed-lajeado';

-- Desligar (volta todo mundo dessa empresa para o painel antigo, na hora)
UPDATE tenants SET "uiV2" = false WHERE slug = 'dtechmed-lajeado';
```

O padrão é `false`. **Nenhuma empresa muda de tela por causa da migração** — quem
liga é gente, uma de cada vez.

Com a flag ligada, quem entra é levado para:

| Papel | Vai para |
|---|---|
| MOTORISTA | `/campo` (app de campo) |
| TÉCNICO | `/sistema/bancada` |
| Demais | `/sistema` — ou a primeira tela que o acesso dela alcança |

Com a flag desligada, `/sistema` e `/campo` devolvem para `/painel` e
`/app/motorista`. Os dois sistemas convivem no mesmo deploy.

---

## 2. Onde cada coisa mora

```
src/app/sistema/              o painel novo (mesa)
  tokens.css                  ← A PALETA INTEIRA. Único lugar com cor.
  layout.tsx                  AppShell: lateral agrupada, barra, migalha
  page.tsx                    Painel = Radar do papel
  ordens/, bancada/, rotas/, clientes/, equipamentos/
  conferencia/, financeiro/, preventiva/, relatorios/
  admin/                      telas de obra — travadas no escuro
src/app/campo/                o app de campo (PWA)

src/components/sistema/       as peças de montar
  pecas.module.css            o CSS dos componentes
  shell.module.css            o CSS da moldura
  (nenhuma cor literal aqui — tudo vem de app/sistema/tokens.css)

src/lib/esteira.ts            ← A ESTEIRA DE 13 ESTADOS e o botão-da-vez
src/server/sistema/
  navegacao.ts                o menu + RBAC (papel × marcação de abas)
  guarda.ts                   a guarda de cada página
  radar.ts                    as filas ("o que fazer agora")
src/server/acoes/sistema.ts   o disparo dos saltos fundidos
```

**O backend não foi reescrito.** Toda ação passa pelo motor que já existia
(`src/server/ordem/motor.ts` + `maquina-estados.ts`), pelas consultas que já
existiam (`src/server/consultas/*`) e pelas ações que já existiam
(`src/server/acoes/*`). O redesenho é front-end e orquestração.

---

## 3. A esteira: 18 etapas no banco, 13 degraus na tela

> **Menos cliques, mesma auditoria.**
> O front funde a EXPERIÊNCIA; o backend preserva os EVENTOS.

`src/lib/esteira.ts` mapeia cada `EtapaOrdem` num degrau da esteira enxuta e
resolve o botão-da-vez. Quando um botão vale por dois saltos, ele dispara os
dois **em sequência, pelo motor** — dois `EventoOrdem`, dois autores, dois
horários, encadeados por hash como sempre.

A linha do tempo da O.S. mostra **um carimbo por evento real**. É ali que se
confere que a fusão não custou auditoria.

### As fusões, e até onde cada uma vai

| Degrau | Botão | Saltos | Observação |
|---|---|---|---|
| Aberta | **Agendar coleta** | 2 | gerar ordem de retirada + agendar |
| Coletado | **Receber na bancada** | 1 | funde assumir + entrada + 6 fotos numa folha |
| Em análise | **Emitir laudo + orçamento** | 2 | técnico e gestão — ver §6.1 |
| Manutenção concluída | **Aprovar conferência** | 2 | conferir + liberar |
| Entregue | **Dar baixa final** | 1 | só a que ainda deve: a paga encerra sozinha (§6.2) |

**A fusão é elástica**: ela caminha enquanto o motor deixa e para no primeiro
"não", com o rótulo do que realmente vai acontecer. Em "Aprovar conferência" o
técnico lê "Enviar para conferência" e a gestora lê "Aprovar conferência" —
ninguém vê um botão que promete o que não vai entregar.

Quem decide quanto a fusão anda é sempre o motor. Foi por isso que dar ao técnico
o envio do orçamento (§6.1) não custou uma linha no `esteira.ts`: o botão dele
passou de um salto para dois sozinho, no dia em que a transição mudou.

Isso é verificado por teste: `src/lib/esteira.test.ts` percorre **todos os
papéis × todas as etapas** e confirma, contra o próprio `validarTransicao`, que
nenhum botão oferece um salto que o motor recusaria.

### Os desvios não sumiram

Orçamento recusado, devolução sem reparo e cancelamento não são degraus do
caminho feliz e não viram coluna do Kanban — mas aparecem na lista, com chip
próprio. O único jeito de uma O.S. recusada sumir da cabeça de quem deveria
resolvê-la é sumir da tela.

---

## 4. RBAC — as duas travas

O menu novo lê **duas** perguntas, e as duas no servidor:

1. **O papel alcança esta tela?** — `papeis`, em `navegacao.ts`.
2. **A marcação desta pessoa permite?** — cada tela nova aponta para a chave
   equivalente do sistema antigo (`espelha`), e a regra *"a marcação SUBTRAI,
   nunca SOMA"* continua valendo inteira.

A segunda é a que morreria em silêncio: sem ela, ligar a `uiV2` devolveria a
todo mundo o alcance cheio do papel, e a configuração feita pelo administrador
("esta pessoa só vê o Financeiro") seria ignorada sem erro nenhum.

O menu e a guarda de página leem a **mesma** função `podeVer`. Um teste
(`navegacao.test.ts`) garante que o menu nunca ofereça um item que a página vai
recusar.

---

## 5. Contraste — conta, não opinião

`src/app/sistema/tokens.test.ts` lê o `tokens.css` **de verdade** e refaz a
conta de contraste para cada par que aparece na tela, **nos dois temas**. São 70
verificações. Se alguém trocar uma cor e ela cair abaixo do piso, o teste diz
qual par quebrou e por quanto.

Sete problemas reais foram encontrados e corrigidos por esse teste durante a
construção — entre eles três botões (concluir, devolver, cancelar) cujo texto
branco dava 2,2:1 sobre o preenchimento.

Duas regras que saíram daí e valem para sempre:

- **Chip é medido contra o fundo da tela; botão sólido é medido contra o próprio
  rótulo.** Por isso existem `--ok-solida`, `--warn-solida` e `--danger-solida`,
  fixas nos dois temas.
- **A borda de campo de formulário tem piso de 3:1**, não 4,5 — é régua de
  componente de interface. A primeira tentativa dava 1,59:1: existia no código e
  não existia no olho.

---

## 6. As duas mudanças de regra — APLICADAS

O documento de direção manda listar e pedir confirmação quando uma fusão exigir
mudar regra de negócio. As duas abaixo foram listadas, o custo de cada uma foi
posto na mesa, e o dono decidiu aplicar as duas. Ficam registradas aqui, com o
que foi trocado — para que a decisão tenha data e motivo, e não vire "sempre foi
assim".

### 6.1 — O técnico envia o orçamento ao cliente ✅

**O que mudou:** `TECNICO` entrou na transição `ORCAMENTO_INTERNO →
ORCAMENTO_ENVIADO`, em `maquina-estados.ts`.

**O efeito na tela:** "Emitir laudo + orçamento" virou um clique só para quem
escreve o laudo. O botão do técnico passou de um salto para dois **sozinho** —
nenhuma linha do `esteira.ts` mudou, porque quem decide quanto a fusão anda é o
motor, não a lista de receitas.

**O que se ganha:** some a espera entre o laudo pronto e o cliente saber o preço.
Numa oficina onde o técnico e o dono são a mesma pessoa, a fila intermediária
não protegia nada.

**O que se perde, e está escrito:** o segundo par de olhos antes do envio. Era a
trava que impedia um serviço de R$ 3.000 virar R$ 300 sem ninguém olhar.

**O que continua protegendo:** a exigência `ORCAMENTO_MONTADO` (nada de valor
zerado indo para o cliente) e a trilha, que grava quem enviou, com nome e
horário.

**Como reverter:** tirar `P.TECNICO` da lista `papeis` daquela transição. É uma
palavra, e a fila da gestão volta no mesmo instante — o rótulo do botão do
técnico volta a "Emitir laudo" sem ninguém tocar em tela nenhuma.

### 6.2 — A entrega paga encerra sozinha ✅

**O que mudou:** o motor passou a executar `ENTREGUE → FINALIZADO` por conta
própria quando a fatura da ordem está quitada.

**Onde mora:** `finalizarSePago`, em `motor.ts`, chamada depois — e fora — da
transação da entrega. São dois fatos distintos, com dois horários e dois
registros: "o cliente recebeu" e "a ordem foi encerrada". Amarrá-los na mesma
transação faria a falha do segundo desfazer o primeiro, e o primeiro é a
assinatura de alguém.

**O evento fica carimbado como automático**, que era a condição da recomendação:

| campo | valor |
|---|---|
| `autorId` | `null` — nenhuma pessoa do banco tem id nulo |
| `autorNome` | `Sistema` |
| `descricao` | "Baixa automática: entrega assinada com a fatura já quitada." |
| `payload` | `{ automatico: true, regra: 'entrega_assinada_fatura_quitada' }` |

A pergunta que a folha de rastreabilidade existe para responder — *"quem fez
isso?"* — continua tendo resposta. Ela passou a ser "o sistema, por esta regra".

> Sobre o `autorPapel`: a coluna exige um `Papel` e registra **sob que
> autoridade** o passo foi dado (a regra ocupa o lugar de um clique da gestão).
> Ele não diz quem agiu — isso está no nome, e é o nome que a trilha mostra.

**A autorização é NOMINAL, não um modo administrador.** Existe uma lista
`AUTOMATICAS` em `maquina-estados.ts` com os pares `de → para` que o motor pode
dar sozinho. Hoje ela tem **um** item. O sinal `viaSistema` não autoriza mais
nada: um teste tenta usá-lo para faturar sem o financeiro, aprovar orçamento no
lugar do cliente, liberar sem conferência e dar entrada sem fotos — e as quatro
tentativas precisam falhar.

**O que NÃO encerra sozinho:** entrega sem fatura quitada, e devolução sem
reparo (que chega em ENTREGUE sem nada a cobrar). Nas duas sobra uma conferência
humana, e elas continuam caindo na fila de Conferência com o botão de sempre.

**O pior caso desta automação é o sistema de ontem:** se a baixa não acontecer
por qualquer motivo, a entrega já valeu e a O.S. fica em ENTREGUE, esperando a
gestão — exatamente como antes.

**Como reverter:** esvaziar a lista `AUTOMATICAS`.

### 6.3 — Um detalhe menor, resolvido pelo caminho conservador

"Agendar entrega" na direção aparece como um passo da esteira. No backend, quem
move a O.S. de `FATURADO` para `EM_ROTA_ENTREGA` é o **motorista, ao sair** — e a
transição exige que a parada exista. Então o botão "Agendar entrega" **cria a
parada e não avança a etapa**, o que é o comportamento correto: a O.S. não pode
dizer "saiu para entrega" antes de alguém sair.

---

## 7. O que ficou fora, e por quê

- **Edição de usuários e acessos** continua na tela antiga. Criar acesso é a ação
  mais perigosa do sistema, e a regra de "a marcação subtrai" mora inteira lá,
  com o motivo escrito ao lado de cada caixa desligada. Reescrever aquilo para
  ganhar consistência visual é a troca errada.
- **Conectar o número do WhatsApp** e **editar o cadastro da empresa** também —
  pelo mesmo motivo. As telas novas mostram o estado e levam para lá.
- **"Simular com O.S. real"** no gerador de modelos: a paleta de variáveis, o
  toggle Bruto/Preenchido e o preview vivo estão prontos; a simulação com uma
  ordem de verdade exige montar os valores pelo mesmo caminho da geração do PDF.
  A tela **diz** que está usando exemplos do catálogo, em vez de fingir.
- **O site institucional não foi tocado.** Nem uma linha. A paleta violeta do
  `globals.css` continua servindo o site e o painel antigo; o Azul Máquina vive
  escopado em `[data-ui='v2']`.
