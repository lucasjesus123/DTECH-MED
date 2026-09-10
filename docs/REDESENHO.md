# REDESENHO — o sistema "Azul Máquina" (`ui_v2`)

Este documento é o mapa do redesenho: o que entrou, onde cada coisa mora, como
se liga, e — no fim — as **duas decisões de regra de negócio que ainda esperam
um sim ou um não**.

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
| Em análise | **Emitir laudo + orçamento** | 2 (gestão) / 1 (técnico) | ver §6 |
| Manutenção concluída | **Aprovar conferência** | 2 | conferir + liberar |
| Entregue | **Dar baixa final** | 1 | ver §6 |

**A fusão é elástica**: ela caminha enquanto o motor deixa e para no primeiro
"não", com o rótulo do que realmente vai acontecer. O técnico lê "Emitir
laudo"; a gestora lê "Emitir laudo + orçamento". Ninguém vê um botão que promete
o que não vai entregar, e nenhuma regra foi afrouxada para caber no desenho.

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

## 6. ⚠️ AS DUAS DECISÕES QUE ESPERAM RESPOSTA

O documento de direção diz: *"Se qualquer fusão exigir mudança de regra de
negócio no backend, liste a mudança e peça confirmação antes de aplicar. O
default é: front funde a experiência, backend preserva os eventos."*

Foi exatamente isso que foi feito. As duas fusões abaixo **não** foram aplicadas
por inteiro, porque aplicá-las mudaria quem pode o quê. Elas funcionam hoje pelo
caminho conservador, e cada uma tem um custo escrito.

### 6.1 — "Emitir laudo + orçamento" num clique, para o TÉCNICO

**Como está hoje:** o técnico fecha o laudo (`EM_ANALISE → ORCAMENTO_INTERNO`) e
a O.S. cai na fila da gestão, que envia ao cliente com um clique.

**O que a direção pede:** um botão só, para quem emite o laudo.

**A mudança que isso exige:** permitir `TECNICO` na transição
`ORCAMENTO_INTERNO → ORCAMENTO_ENVIADO` (`maquina-estados.ts`).

**O que se ganha:** um clique e uma espera a menos por O.S. Numa oficina onde o
técnico e o dono são a mesma pessoa, a fila intermediária não serve para nada.

**O que se perde:** hoje o valor que sai para o cliente passa pela mesa de quem
responde pelo negócio. O comentário do próprio motor diz que essa é *"a trava
que importa"* — a que impede um serviço de R$ 3.000 virar R$ 300 sem ninguém
olhar. Numa equipe de cinco pessoas isso não é burocracia.

**Recomendação:** manter como está. Se o dono quiser o clique único, o caminho
menos arriscado é uma configuração por empresa (oficina pequena liga, oficina
com equipe não liga) — e não uma mudança na tabela de transições para todo mundo.

### 6.2 — A entrega auto-finalizar quando a O.S. já está paga

**Como está hoje:** o motorista entrega e assina (`EM_ROTA_ENTREGA → ENTREGUE`).
A O.S. entra na fila de Conferência da gestão, que dá a baixa final com um
clique. A tela de Conferência mostra essas entregas junto com o resto, para não
sumirem.

**O que a direção pede:** *"Se já `PAGO`, auto-finaliza."*

**A mudança que isso exige:** o motor passar a executar
`ENTREGUE → FINALIZADO` **sozinho**, sem autor humano, quando a fatura estiver
quitada. Hoje essa transição é da gestão e não existe transição automática
nenhuma no sistema.

**O que se ganha:** a gestão para de dar baixa em O.S. que não tem nada
pendente. É trabalho de conferir o que já está conferido.

**O que se perde:** o primeiro evento sem autor humano da trilha. A pergunta que
a folha de rastreabilidade existe para responder — *"quem fez isso?"* — passaria
a ter uma resposta nova: "o sistema". Não é errado, mas é uma decisão de
projeto, e o lugar de tomá-la é aqui e não num commit.

**Recomendação:** aplicar, **com o evento carimbado como automático** — autor
"Sistema", motivo "entrega assinada com fatura quitada", e o horário de sempre.
Assim a baixa deixa de ser trabalho manual sem virar um buraco na trilha.

### 6.3 — Um detalhe menor, já resolvido pelo caminho conservador

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
