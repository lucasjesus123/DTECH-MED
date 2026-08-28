# O que falta construir, e onde cada coisa entra

Este documento existe porque a lista de pedidos chegou como seis telas novas, e
seis telas novas num menu de doze itens é como um sistema deixa de ser navegável.
Ele responde, para cada pedido, uma pergunta antes de qualquer código: **onde
isso mora?**

## A regra que organiza tudo

```
┌──────────────────────────────────────────────────────────────┐
│  O que responde à MESMA PERGUNTA vira ABA, não item de menu. │
└──────────────────────────────────────────────────────────────┘
```

Ela já reduziu quatro entradas a uma (Agenda de rota, Ao vivo, App do motorista
e App do técnico viraram **Rota**), e já organizou o Financeiro em cinco abas
sem criar nenhum item novo. Aplicada aos seis pedidos, ela produz **um único
item de menu novo** — o resto entra onde o assunto já mora.

### O resultado no menu

| grupo | hoje | depois |
|---|---|---|
| Hoje | Painel do dia | Painel do dia · **Calendário** |
| O trabalho | Ordens · Acompanhar · Rota | igual |
| Comercial | Contatos do site | **Comercial** (abas: Contatos · Orçamentos) |
| Cadastros | Clientes · Equipamentos · Estoque | igual |
| Dinheiro | Financeiro | igual |
| Retaguarda | Preventiva · WhatsApp | igual |
| Equipe | Pessoas e acessos · Trilha | igual |

Doze itens viram treze. Sem a regra, seriam dezoito.

---

## A ordem de construção, e por quê

A fila não é por tamanho nem por gosto: é por **quanto cada uma destrava o dia**
e por **quanto uma depende da outra**.

### 1 · Acompanhar em cartões  ✅ FEITO
*Enhancement da tela que existe. Nenhum item novo.*

É a tela mais olhada do dia e a que menos responde. Hoje ela lista; a referência
que você mandou mostra **cartões com o estágio da rota e a prova** — foto,
assinatura, quem pegou.

Vem primeiro porque é a menor das seis e porque melhora o que já está em uso
todos os dias. Nada depende dela.

**O que muda:** cada cartão passa a carregar o estágio da esteira, a foto da
retirada e o nome de quem assinou. O que hoje exige abrir a ficha passa a ser
lido de relance.

### 2 · Estoque com foto  ✅ FEITO
*Enhancement da tela que existe. Nenhum item novo.*

Você foi direto: *"a aba de estoque não está legal"*. O cadastro de peça precisa
de foto — da peça e do equipamento — e o controle precisa fechar: entrada,
saída, saldo, e o vínculo com a ordem que consumiu.

Vem em segundo porque o mecanismo de foto **já existe** (as ordens têm fotos, o
site tem fotos) e porque o estoque alimenta o orçamento, que vem depois.

**O que muda:** peça ganha foto e ficha; a listagem vira catálogo; o movimento
de estoque mostra de qual ordem saiu.

### 3 · Clientes: ficha completa  ✅ FEITO
*Enhancement da tela que existe. Nenhum item novo.*

A ficha do cliente hoje é cadastro. Precisa virar **retrato**: equipamentos
dele, histórico de ordens, quanto deve (somando fatura de serviço e lançamento
avulso — o Financeiro já sabe calcular isso), contratos, e os filtros que
respondem pergunta em vez de listar tudo.

Vem em terceiro porque o Financeiro já entrega o número de dívida por cliente
(`maioresDevedores`), então metade do trabalho está feita.

### 4 · Comercial: o funil de orçamentos  ✅ FEITO
*Vira aba dentro de Comercial, ao lado de Contatos do site.*

Orçamento já existe — ele nasce dentro da ordem. O que falta é **vê-los juntos**:
quantos aguardam resposta, quantos foram aprovados, quantos foram recusados e
por quê.

Contatos e Orçamentos são o mesmo funil em dois tempos — *lead → orçamento →
ordem*. Por isso viram abas de uma tela chamada **Comercial**, e não dois itens
de menu.

**Depende de:** nada novo. Lê o que já está gravado.

### 5 · Calendário estratégico
*O único item de menu novo, no grupo Hoje.*

Junta numa grade de mês tudo que tem data e ainda vai acontecer:

- paradas de rota (retirada e entrega)
- preventivas vencendo
- contas a pagar e a receber vencendo
- contratos terminando

Vem em quinto porque **precisa que as anteriores existam** para ter o que
mostrar — um calendário que só sabe de rota é meia resposta, e meia resposta
sobre a agenda é pior que nenhuma.

**Por que é item de menu e não aba:** ele não é o recorte de nenhuma outra tela.
Ele atravessa cinco assuntos, e a pergunta que responde — *"o que vem por aí"* —
não é feita de dentro de nenhuma delas. Fica em **Hoje**, ao lado do Painel do
dia: um mostra o agora, o outro mostra o depois.

### 6 · Gerador de contrato e nota promissória
*Ação dentro de Clientes e de Ordens. Nenhum item novo.*

O sistema já gera documento em PDF e já colhe assinatura pelo portal. Falta o
molde do **contrato de prestação** e o da **nota promissória**, com o
preenchimento vindo do cadastro em vez de digitado.

Vem por último porque é o que mais depende: precisa da ficha de cliente completa
(item 3) para preencher sozinho, e do orçamento (item 4) para saber o valor.

**Por que não é item de menu:** ninguém acorda querendo "abrir o gerador de
contratos". A pessoa está na ficha de um cliente, ou numa ordem, e de lá emite o
documento daquele cliente. Documento é ação sobre algo, não destino.

---

## O que NÃO vai ser feito, e por quê

**Menu com submenu.** Resolveria o tamanho da lista e criaria um problema pior:
esconder metade da navegação atrás de um passar de mouse. Aba mostra as irmãs;
submenu esconde.

**Uma tela "Relatórios" que junta tudo.** Cada assunto relata a si mesmo, onde
mora. Relatório de dinheiro no Financeiro, de serviço nas Ordens. Uma tela de
relatórios central vira o lugar onde ninguém acha o que quer.

**Rotina noturna gerando coisa sozinha.** Vale para a geração de recorrências e
vai valer para a de preventivas: automatismo escondido é ótimo até criar a coisa
errada, e aí ninguém sabe quando, por quê, nem quem olhava. Botão com o número
do que vai acontecer, e a trilha guardando quem apertou.

---

## Como cada uma termina

Nenhuma entra como pronta sem:

1. **`tsc` e `eslint` limpos** — a trava mais barata que existe.
2. **Um roteiro em `qa/`** que use a tela como uma pessoa usaria, e confira no
   banco que o que a tela disse aconteceu de verdade.
3. **Acessibilidade** — axe-core sem violação séria, inclusive com formulários
   abertos.
4. **Celular de 390 px** — nenhuma tela rola de lado.
5. **Os dois temas** — claro e escuro, sem texto invisível.
6. **A bateria inteira verde** depois da mudança, não só o roteiro novo.

O ponto 6 é o que separa "funciona" de "não quebrou nada". Foi ele que pegou a
regressão em que a fila de faturamento sumiu atrás de uma aba e travou a esteira
na etapa 14.
