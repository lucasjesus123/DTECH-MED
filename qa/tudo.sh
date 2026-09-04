#!/usr/bin/env bash
# =============================================================================
# A BATERIA INTEIRA, NA ORDEM CERTA.
# =============================================================================
# Ela vivia em /var/tmp e por isso morria a cada reinício de máquina: a prova
# de que o sistema funciona estava sempre a um reinício de deixar de existir.
# Agora mora no repositório, junto do que ela testa.
#
# A ORDEM NÃO É GOSTO. A suíte de integração faz TRUNCATE no banco, então ela
# roda por último. E o banco é semeado do zero antes da fase 2, para que duas
# execuções seguidas sejam comparáveis de verdade — sem isso, as sobras de uma
# passada reprovam a seguinte, e a reprovação parece defeito do produto.
#
# COMO RODAR
#   bash qa/tudo.sh
#
# O QUE ELA PRECISA
#   · o servidor de desenvolvimento de pé em 127.0.0.1:3111
#   · um Postgres de ensaio; o caminho dele vem de QA_PG_ENV
#   · playwright e axe-core instalados globalmente
#
# NADA AQUI TOCA EM PRODUÇÃO. Todo endereço aponta para 127.0.0.1 e o banco é
# apagado e semeado do zero — é por isso que a bateria só roda em máquina de
# desenvolvimento, e é por isso que o TRUNCATE abaixo é seguro.
# =============================================================================
set -uo pipefail

# Onde este arquivo está, seja qual for o diretório de quem o chamou.
AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RAIZ="$(dirname "$AQUI")"
cd "$RAIZ"

# Configuração da máquina, com o padrão do ambiente de ensaio.
BASE="${QA_BASE:-http://127.0.0.1:3111}"
PG_ENV="${QA_PG_ENV:-/var/tmp/pgdemo/env}"
PG_SUBIR="${QA_PG_SUBIR:-/var/tmp/pgdemo/pg.sh}"
PG_HOST="${QA_PG_HOST:-127.0.0.1}"
PG_PORTA="${QA_PG_PORTA:-5599}"
PG_USER="${QA_PG_USER:-postgres}"
PG_BANCO="${QA_PG_BANCO:-dtechmed}"
LOGS="${QA_LOGS:-$(mktemp -d)}"

export NODE_PATH="$(npm root -g)"
export QA_BASE

FALHAS=0
marcar() { if [ "$1" -ne 0 ]; then FALHAS=$((FALHAS+1)); echo "   ✗ $2"; else echo "   ✓ $2"; fi; }
psqlq() { psql -h "$PG_HOST" -p "$PG_PORTA" -U "$PG_USER" -d "$PG_BANCO" "$@"; }

# As tabelas que a semeadura zera. Manter esta lista em dia importa: uma tabela
# nova que fique de fora acumula linhas entre execuções, e a bateria começa a
# reprovar por sobra de dado — que é o modo mais confuso de falhar, porque
# parece defeito do produto.
TABELAS="tenants, usuarios, sessoes, clientes, equipamentos, ordens, eventos_ordem, fotos,
 assinaturas, orcamentos, orcamento_itens, pecas, movimentos_estoque, faturas, pagamentos,
 agendamentos, documentos, outbox_jobs, mensagens_whatsapp, templates_mensagem,
 whatsapp_instances, leads, audit_logs, contadores, lancamentos, recorrencias,
 compromissos, modelos_documento, colunas_quadro, emprestimos_ferramenta,
 contratos_manutencao, visitas_preventivas"

semear() {
  [ -x "$PG_SUBIR" ] || [ -f "$PG_SUBIR" ] && bash "$PG_SUBIR" >/dev/null 2>&1
  psqlq -tAc "TRUNCATE $TABELAS RESTART IDENTITY CASCADE;" >/dev/null 2>&1
  set -a; . "$PG_ENV"; set +a
  SEED_SUPERADMIN_PASSWORD="${QA_SENHA_SUPER:-Ensaio@2026x}" npm run db:seed -- --demo >/dev/null 2>&1

  # E O CENÁRIO, que é o que faltava aqui.
  #
  # `db:seed --demo` cria a empresa, a equipe, os clientes e o catálogo de
  # peças — e NENHUMA ORDEM. Até hoje as ordens da fase 2 eram as que os
  # próprios roteiros iam criando: a `jornada.mjs` fazia a sua, a `fluxos.js`
  # fazia as dela, e quem rodasse depois herdava o que sobrou.
  #
  # Isso acopla os roteiros pela ORDEM em que rodam, que é o acoplamento mais
  # difícil de enxergar. O `documentos.mjs` foi o primeiro a pagar: sozinho ele
  # passava, e dentro da bateria reprovava dizendo "sem botão Emitir contrato"
  # — acusando a tela. A tela estava certa. Não havia nenhuma ordem com
  # orçamento aprovado e saldo em aberto, porque a `jornada.mjs` leva a dela
  # até FINALIZADO (quitada) e mais ninguém deixava uma devendo.
  #
  # `cenario-demo.mts` monta 23 ordens em seis etapas diferentes, PELO MOTOR —
  # com linha do tempo, eventos encadeados, fotos e assinaturas de verdade. São
  # 19 segundos que trocam "o que sobrou da execução anterior" por um ponto de
  # partida igual toda vez.
  npx tsx scripts/cenario-demo.mts >/dev/null 2>&1
  # O super admin nasce com senha aleatória e obrigação de trocar; os roteiros
  # precisam de uma senha conhecida e de entrar direto.
  node -e "
    const { hash } = require('@node-rs/argon2');
    const s = process.env.QA_SENHA_SUPER || 'Ensaio@2026x';
    hash(s,{memoryCost:19456,timeCost:2,parallelism:1}).then(h=>{
      require('child_process').execFileSync('psql',['-h',process.env.PGH,'-p',process.env.PGP,
        '-U',process.env.PGU,'-d',process.env.PGD,'-c',
        \"UPDATE usuarios SET \\\"senhaHash\\\"='\"+h+\"', \\\"trocarSenha\\\"=false WHERE papel='SUPER_ADMIN'\"],
        {stdio:'pipe'})})" 2>/dev/null
}
export PGH="$PG_HOST" PGP="$PG_PORTA" PGU="$PG_USER" PGD="$PG_BANCO"

echo ""
echo "═══ FASE 1 · CÓDIGO ═══"
npx tsc --noEmit                        >/dev/null 2>&1; marcar $? "tsc --noEmit"
npm run lint                            >/dev/null 2>&1; marcar $? "eslint ."
npm test                                >"$LOGS/t.log" 2>&1
marcar $? "$(grep -oE 'Tests +[0-9]+ passed' "$LOGS/t.log" | grep -oE '[0-9]+' | head -1) testes unitários"
# =============================================================================
# O AUDIT PRECISA DA REDE — e "não deu para verificar" NÃO É "está seguro", nem
# é "está inseguro".
# =============================================================================
# `npm audit` consulta o registro. Quando a rede cai no meio, ele sai com código
# de erro igual ao de quando ACHA vulnerabilidade — e a bateria pintava de
# vermelho uma conferência que nem chegou a acontecer.
#
# As duas leituras erradas são igualmente ruins: alguém corrige o que não está
# quebrado, ou aprende a ignorar o vermelho do audit. A regra da casa é a mesma
# do laudo: o que não deu para verificar vira NÃO VERIFICADO, com o motivo.
npm audit --omit=dev >"$LOGS/audit.log" 2>&1
CODIGO_AUDIT=$?
if [ "$CODIGO_AUDIT" -ne 0 ] && grep -qiE 'ENOTFOUND|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|socket hang up|network|request to .* failed|ERR_SOCKET|proxy' "$LOGS/audit.log"; then
  echo "   ? npm audit (produção) — NÃO VERIFICADO: a consulta ao registro falhou (rede)"
else
  marcar $CODIGO_AUDIT "npm audit (produção)"
fi

# As quatro travas que valem para o repositório inteiro, não só para o que
# mudou hoje. Elas são baratas e pegam a classe de erro que passa despercebida
# em revisão de diff.
test "$(grep -rn '\$queryRawUnsafe\|\$executeRawUnsafe' src --include=*.ts | grep -vc generated)" = "0"
marcar $? "nenhuma SQL concatenada"
test "$(grep -rn 'catch\s*{\s*}' src --include=*.ts --include=*.tsx | grep -vc generated)" = "0"
marcar $? "nenhum catch vazio"
test "$(grep -rn '\bprisma\.\w' src --include=*.ts --include=*.tsx | grep -v generated | grep -vc 'src/lib/db.ts')" = "0"
marcar $? "nenhum cliente Prisma sem escopo"

echo ""
echo "═══ FASE 2 · SISTEMA EM USO ═══"
semear
cd "$AQUI"
node jornada.mjs        >"$LOGS/j.log" 2>&1; marcar $? "as 18 etapas · $(grep -o '[0-9]*/[0-9]* conferências' "$LOGS/j.log" | head -1)"
node carteira.mjs       >"$LOGS/c.log" 2>&1; marcar $? "a carteira de clientes tem dono · 16 conferências"
node isolamento.mjs     >"$LOGS/i.log" 2>&1; marcar $? "isolamento entre franquias · 12 conferências"
node portal-chutes.mjs  >"$LOGS/p.log" 2>&1; marcar $? "o portal freia chute de CPF · 4 conferências"
node busca500.mjs       >"$LOGS/b.log" 2>&1; marcar $? "buscar por CPF não derruba tela · 15 combinações"
node restantes.mjs      >"$LOGS/r.log" 2>&1; marcar $? "telas fora do alcance do robô · 7 conferências"
node caixa.mjs          >"$LOGS/x.log" 2>&1; marcar $? "o caixa: contas, parcelas, recorrências e gráficos"
node financeiro.mjs     >"$LOGS/fin.log" 2>&1; marcar $? "os quatro cartões fecham, e editar derruba a aprovação"
node inicio.mjs         >"$LOGS/y.log" 2>&1; marcar $? "recorrência retroativa: começa em, e gera mês passado"
node acompanhar.mjs     >"$LOGS/ac.log" 2>&1; marcar $? "o cartão diz onde o aparelho está, e mostra a prova"
node catalogo.mjs       >"$LOGS/cat.log" 2>&1; marcar $? "foto de peça e de equipamento: sobe, troca, sai, e não vaza"
node cliente.mjs        >"$LOGS/cli.log" 2>&1; marcar $? "a ficha do cliente: dinheiro, aparelhos, histórico e cadastro"
node comercial.mjs      >"$LOGS/com.log" 2>&1; marcar $? "o funil de orçamentos: última versão, ordem da urgência, taxa"
node calendario.mjs     >"$LOGS/cal.log" 2>&1; marcar $? "o calendário junta as fontes da operação — e não tem dinheiro para ninguém"
node documentos.mjs     >"$LOGS/doc.log" 2>&1; marcar $? "contrato pelo total, promissória pelo saldo, e o técnico sem o botão"
node lancar.mjs         >"$LOGS/lan.log" 2>&1; marcar $? "as telas que só mostravam passam a receber — e o motorista sem dinheiro"
node fundo-caixa.mjs    >"$LOGS/a.log" 2>&1; marcar $? "o caixa no celular, no teclado e no leitor de tela"
node a11y.mjs           >"$LOGS/ax.log" 2>&1; marcar $? "acessibilidade (axe-core) em 21 telas, com o papel que usa cada uma"
node equipamento.mjs    >"$LOGS/eq.log" 2>&1; marcar $? "o catálogo e a O.S. se falam: puxar, amarrar, e não duplicar"
node quadro.mjs         >"$LOGS/qd.log" 2>&1; marcar $? "o quadro: colunas da empresa, cartão que anda, e nada some"
node estoque.mjs        >"$LOGS/es.log" 2>&1; marcar $? "estoque: peça, insumo e ferramenta — e emprestar não baixa saldo"
node calendario-visoes.mjs >"$LOGS/cv.log" 2>&1; marcar $? "o calendário em cinco visões, e o lugar não se perde"
node clientes-acoes.mjs >"$LOGS/ca.log" 2>&1; marcar $? "a carteira: editar, chamar, arquivar — e arquivar não apaga"
node dashboard-operacao.mjs >"$LOGS/dop.log" 2>&1; marcar $? "o dashboard em gráficos: as bases batem com o banco, e o motorista sem dinheiro"
node busca-barra.mjs     >"$LOGS/bb.log" 2>&1; marcar $? "a busca da barra: número, nome do cliente, e a última O.S. dele"
node modelos-documento.mjs >"$LOGS/md.log" 2>&1; marcar $? "modelos: cinco por tipo, e a O.S. que sai sozinha para o cliente"
# Só LÊ o desenho — não cria nem apaga nada. Podia estar em qualquer ponto da
# fase 2; fica aqui porque varre as mesmas telas que os roteiros de cima
# acabaram de povoar, e tela vazia esconde card com sombra.
node azul-fase4.mjs     >"$LOGS/az4.log" 2>&1; marcar $? "Azul Máquina: a aura atrás de tudo, nenhum card com sombra, e a linha em 38px"
node azul-fase5.mjs     >"$LOGS/az5.log" 2>&1; marcar $? "a esteira: rampa sem verde, o gargalo certo, e o motorista sem dinheiro"
node azul-fase6.mjs     >"$LOGS/az6.log" 2>&1; marcar $? "o Dashboard na ordem certa: o problema do dia primeiro, e um herói só"
node diagrama.mjs       >"$LOGS/d.log" 2>&1; marcar $? "o diagrama confere com o sistema · 23 afirmações"
QA_BLUEPRINT=blueprint.json node engine/fluxos.js >"$LOGS/f.log" 2>&1
grep -q '11/11 fluxos' "$LOGS/f.log"; marcar $? "fluxos do diagrama · $(grep -o '[0-9]*/[0-9]* fluxos do diagrama' "$LOGS/f.log" | head -1)"

# O DISPARO DE PONTA A PONTA MEXE NO BANCO: ele abre O.S. próprias e as faz
# andar pelo motor de verdade, com a fila e o worker. Por isso vem DEPOIS de
# todo mundo que confere tela contra banco — inclusive do diagrama e dos
# fluxos — e antes só da integração, que apaga tudo mesmo.
cd "$RAIZ"
set -a; . "$PG_ENV"; set +a
npx tsx qa/disparo-do-modelo.mts >"$LOGS/dm.log" 2>&1
marcar $? "o disparo automático: motor, fila, PDF do modelo e aviso com o link"
cd "$RAIZ/qa"

echo ""
echo "═══ FASE 3 · INTEGRAÇÃO (apaga o banco: por último) ═══"
cd "$RAIZ"
set -a; . "$PG_ENV"; set +a
npm run test:integracao >"$LOGS/int.log" 2>&1
marcar $? "$(grep -oE 'Tests +[0-9]+ passed' "$LOGS/int.log" | grep -oE '[0-9]+' | head -1) testes de integração"

echo ""
if [ "$FALHAS" -eq 0 ]; then
  echo "  ══ BATERIA INTEIRA VERDE ══"
else
  echo "  ══ $FALHAS BLOCO(S) COM FALHA ══"
  echo "  os registros de cada bloco: $LOGS"
fi
exit "$FALHAS"
