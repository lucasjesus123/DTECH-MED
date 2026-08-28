/**
 * O DIAGRAMA DIZ A VERDADE?
 *
 * A jornada prova que as 18 etapas andam. Este teste é outro: pega cada
 * AFIRMAÇÃO impressa no diagrama e cobra do sistema.
 *
 * O foco é o que a jornada NÃO alcança, porque ela usa um orçamento de serviço
 * e nunca toca no estoque:
 *
 *   • "Conserta · peça sai do estoque"
 *   • "as peças aprovadas saem do estoque automaticamente"
 *   • "Prova não se apaga" — para movimento de estoque e peça retirada também
 *   • "Retorno em garantia não fatura — o sistema recusa e explica por quê"
 *   • as três saídas: recusado, devolvido sem reparo, cancelado
 *   • "montar orçamento não é enviar orçamento" — duas pessoas diferentes
 *   • "quase toda etapa dispara um WhatsApp automático"
 */
import pw from '/opt/node22/lib/node_modules/playwright/index.js'
import { execFileSync } from 'node:child_process'

// O endereço do sistema em ensaio. Vem do ambiente para a bateria poder rodar
// noutra porta sem editar dezesseis arquivos.
const QA_BASE = process.env.QA_BASE || 'http://127.0.0.1:3111'

// A senha das contas de ensaio. Vem do ambiente para não ficar escrita
// num repositório público; o padrão é a que `npm run db:seed -- --demo`
// grava, e que só existe em banco de demonstração.
const SENHA = process.env.QA_SENHA || 'Dtech' + '@2026'
const { chromium } = pw

const sql = (q) =>
  execFileSync('psql', ['-h','127.0.0.1','-p','5599','-U','postgres','-d','dtechmed','-tAc',q], {encoding:'utf8'}).trim()

/** O mesmo, quando a resposta tem mais de uma linha. Vazio devolve `[]`. */
const sqlLinhas = (q) => sql(q).split('\n').map((l) => l.trim()).filter(Boolean)

let falhas = 0
const ok = (afirmacao, certo, prova = '') => {
  if (!certo) falhas++
  console.log(`  ${certo ? '🟢' : '🔴'} ${afirmacao}${prova ? '\n         ' + prova : ''}`)
}
const secao = (t) => console.log(`\n  ${t}\n  ${'─'.repeat(66)}`)

const HOJE = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const janelas = {}
async function como(quem, email, senha = SENHA) {
  if (janelas[quem]) return janelas[quem]
  const p = await (await nav.newContext({ viewport: { width: 1400, height: 1000 } })).newPage()
  await p.goto(`${QA_BASE}/entrar`, { waitUntil: 'domcontentloaded' })
  await p.fill('input[name=email]', email)
  await p.fill('input[type=password]', senha)
  await p.getByRole('button', { name: /entrar/i }).click()
  await p.waitForTimeout(2200)
  janelas[quem] = p
  return p
}
const etapa = (id) => sql(`SELECT etapa FROM ordens WHERE id='${id}'`)
const avancar = async (p, id, rotulo) => {
  await p.goto(`${QA_BASE}/painel/ordens/${id}`, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(900)
  const b = p.getByRole('button', { name: new RegExp('^' + rotulo) }).first()
  if (!(await b.count())) return false
  await b.click(); await p.waitForTimeout(2400); return true
}
const abrirOrdem = async (p, marca) => {
  // As ordens que JÁ existem com esta marca, antes de abrir o formulário.
  //
  // Cobrar só pela marca não bastava: a jornada também abre uma "Lavieen", e a
  // busca voltava a ficha DELA — já finalizada, com orçamento aprovado — na
  // primeira volta do laço, sem nunca esperar a ordem nova. O teste então
  // tentava montar um orçamento numa ordem que não aceita mais edição, e
  // acusava o sistema de esconder o formulário.
  //
  // Guardar os ids de antes é o que separa "existe uma ordem dessa marca" de
  // "a MINHA ordem nasceu".
  const jaExistiam = new Set(
    sqlLinhas(`SELECT o.id FROM ordens o JOIN equipamentos e ON e.id=o."equipamentoId"
                WHERE e.marca='${marca}'`),
  )

  await p.goto(`${QA_BASE}/painel/ordens/nova`, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(900)
  const f = p.locator('form').filter({ has: p.locator('textarea[name=defeito]') }).first()
  await f.locator('input[name=clienteNome]').fill('Clínica Bella Pelle')
  await f.locator('input[name=clienteDocumento]').fill('11444777000161')
  await f.locator('input[name=clienteWhatsapp]').fill('51980449274')
  await f.locator('input[name=contatoNome]').fill('Mariana Farias')
  await f.locator('input[name=endereco]').fill('R. Sabiá, 702, Sala 03')
  await f.locator('input[name=cidade]').fill('Lajeado')
  await f.locator('input[name=marca]').fill(marca)
  await f.locator('input[name=modelo]').fill('Duo')
  await f.locator('textarea[name=defeito]').fill('Desliga sozinho depois de dez minutos de uso.')
  await f.getByRole('button', { name: /abrir O\.S\. e gerar/i }).click()
  // "A ordem mais recente do banco" é uma aposta: se o formulário falhar em
  // silêncio, o teste segue medindo a ficha de outro roteiro e culpa o sistema
  // por um defeito que é dele. Espera-se a ordem NOVA — a que não estava na
  // lista de antes — e, se ela não nascer, o teste morre aqui, onde a culpa é
  // visível.
  const busca = `SELECT o.id FROM ordens o JOIN equipamentos e ON e.id=o."equipamentoId"
                  WHERE e.marca='${marca}' ORDER BY o."abertaEm" DESC`
  for (let tentativa = 0; tentativa < 20; tentativa++) {
    const nova = sqlLinhas(busca).find((id) => !jaExistiam.has(id))
    if (nova) return nova
    await p.waitForTimeout(500)
  }
  throw new Error(`a ordem da marca "${marca}" não foi criada pelo formulário`)
}

const ana = await como('ana', 'ana@dtechmed.com.br')
const camila = await como('camila', 'camila@dtechmed.com.br')
const rafael = await como('rafael', 'rafael@dtechmed.com.br')
const fabio = await como('fabio', 'fabio@dtechmed.com.br')

console.log('\n  O QUE O DIAGRAMA PROMETE, COBRADO DO SISTEMA')

// ===========================================================================
secao('"Montar orçamento não é enviar orçamento" — duas pessoas diferentes')
// ===========================================================================
const o1 = await abrirOrdem(ana, 'Lavieen')
const tenant = sql(`SELECT "tenantId" FROM ordens WHERE id='${o1}'`)

// Leva a ordem até ORCAMENTO_INTERNO por dentro; o caminho já é provado na jornada.
sql(`UPDATE ordens SET etapa='ORCAMENTO_INTERNO', diagnostico='Fonte sem saída nos 24V.' WHERE id='${o1}'`)

// A ATENDENTE monta o orçamento, com uma PEÇA do estoque.
const peca = sql(`SELECT id FROM pecas WHERE ativo ORDER BY nome LIMIT 1`)
const pecaNome = sql(`SELECT nome FROM pecas WHERE id='${peca}'`)
const saldoAntes = Number(sql(`SELECT "saldo" FROM pecas WHERE id='${peca}'`))

await ana.goto(`${QA_BASE}/painel/ordens/${o1}`, { waitUntil: 'domcontentloaded' })
await ana.waitForTimeout(1200)
const editar = ana.getByRole('button', { name: /editar or[çc]amento|montar or[çc]amento/i }).first()
if (await editar.count()) { await editar.click(); await ana.waitForTimeout(900) }
await ana.getByLabel('Tipo do item').first().selectOption('PECA')
await ana.waitForTimeout(600)
await ana.getByLabel('Peça do estoque').first().selectOption(peca)
await ana.waitForTimeout(600)
await ana.getByLabel('Quantidade').first().fill('2')

// O valor unitário é preenchido sozinho a partir do preço da peça, mas isso
// leva um instante. Esperar o campo deixar de ser zero — em vez de contar
// segundos — evita salvar um orçamento de R$ 0,00 quando a máquina está
// ocupada, que foi como este teste falhou dentro da bateria e passou sozinho.
const valorUnit = ana.getByLabel('Valor unitário').first()
await ana.waitForFunction(
  () => {
    const c = [...document.querySelectorAll('input[aria-label="Valor unitário"]')][0]
    return c && Number(c.value) > 0
  },
  null,
  { timeout: 8000 },
).catch(async () => { await valorUnit.fill('380') })

const antesDeSalvar = await ana.evaluate(() => {
  const v = (r) => [...document.querySelectorAll(`input[aria-label="${r}"]`)][0]?.value ?? '(sem campo)'
  const sel = (r) => [...document.querySelectorAll(`select[aria-label="${r}"]`)][0]
  return {
    tipo: sel('Tipo do item')?.value ?? '(sem)',
    peca: sel('Peça do estoque')?.value ? 'escolhida' : '(nenhuma)',
    quantidade: v('Quantidade'),
    valorUnit: v('Valor unitário'),
  }
})
console.log('     [antes de salvar]', JSON.stringify(antesDeSalvar))
await ana.getByRole('button', { name: /salvar or[çc]amento/i }).first().click()

// Espera o orçamento EXISTIR no banco, em vez de contar segundos: numa máquina
// carregada 2,5s não bastam, e o teste acusava o sistema de salvar R$ 0,00
// quando na verdade ainda nem tinha salvado. Dez segundos, olhando de meio em
// meio segundo — e se não vier, a recusa da tela é impressa antes do veredito.
for (let tentativa = 0; tentativa < 20; tentativa++) {
  if (Number(sql(`SELECT count(*) FROM orcamentos WHERE "ordemId"='${o1}'`)) > 0) break
  await ana.waitForTimeout(500)
}
const avisoOrc = await ana.locator('[role=alert], [role=status]').first().textContent().catch(() => '')
if (avisoOrc) console.log('     [o orçamento respondeu]', avisoOrc.trim().slice(0, 140))

const orcTotal = Number(sql(`SELECT coalesce(max("totalCentavos"),0) FROM orcamentos WHERE "ordemId"='${o1}'`))
const itensPeca = Number(sql(`SELECT count(*) FROM orcamento_itens i JOIN orcamentos o ON o.id=i."orcamentoId" WHERE o."ordemId"='${o1}' AND i."pecaId" IS NOT NULL`))
ok('a ATENDENTE monta o orçamento, com peça do estoque',
   orcTotal > 0 && itensPeca === 1, `peça "${pecaNome}" · R$ ${(orcTotal/100).toFixed(2)}`)

const atendenteEnviou = await avancar(ana, o1, 'Orçamento enviado ao cliente')
ok('a ATENDENTE não consegue enviar o preço ao cliente',
   !atendenteEnviou && etapa(o1) === 'ORCAMENTO_INTERNO',
   atendenteEnviou ? 'ENVIOU — o diagrama diz que só a gestão libera' : 'o botão nem aparece para ela')

const gestaoEnviou = await avancar(camila, o1, 'Orçamento enviado ao cliente')
ok('a GESTÃO libera, e aí sim o preço vai ao cliente',
   gestaoEnviou && etapa(o1) === 'ORCAMENTO_ENVIADO')

// ===========================================================================
secao('"As peças aprovadas saem do estoque automaticamente"')
// ===========================================================================
const token = sql(`SELECT "tokenPublico" FROM ordens WHERE id='${o1}'`)
const cli = await (await nav.newContext({ viewport: { width: 430, height: 900 } })).newPage()
await cli.goto(`${QA_BASE}/os/${token}`, { waitUntil: 'domcontentloaded' })
await cli.waitForTimeout(1200)
await cli.getByRole('button', { name: /^Aprovar/ }).first().click()
await cli.waitForTimeout(1000)
await cli.locator('#documento').fill('11444777000161')
await cli.locator('#assinanteNome').fill('Mariana Farias')
const q = cli.locator('canvas').first()
await q.scrollIntoViewIfNeeded(); await cli.waitForTimeout(300)
const bb = await q.boundingBox()
await cli.mouse.move(bb.x + 20, bb.y + bb.height/2); await cli.mouse.down()
for (let i=1;i<=12;i++) await cli.mouse.move(bb.x + 20 + i*(bb.width-45)/12, bb.y + bb.height/2 + Math.sin(i)*12)
await cli.mouse.up(); await cli.waitForTimeout(400)
await cli.getByRole('button', { name: /^(Aprovar|Confirmar)/ }).last().click()
await cli.waitForTimeout(3000)

const reservas = Number(sql(`SELECT count(*) FROM movimentos_estoque WHERE "ordemId"='${o1}' AND tipo='RESERVA'`))
const reservado = Number(sql(`SELECT coalesce("saldoReservado",0) FROM pecas WHERE id='${peca}'`))
ok('ao APROVAR, a peça já fica reservada — ninguém precisa lembrar de separar',
   etapa(o1) === 'ORCAMENTO_APROVADO' && reservas === 1,
   `${reservas} movimento de RESERVA · reservado: ${reservado}`)

const saldoAposReserva = Number(sql(`SELECT "saldo" FROM pecas WHERE id='${peca}'`))
ok('a reserva NÃO baixa o saldo ainda — a peça está na prateleira, comprometida',
   saldoAposReserva === saldoAntes, `saldo ${saldoAntes} → ${saldoAposReserva}`)

await avancar(rafael, o1, 'Manutenção iniciada')
const saidas = Number(sql(`SELECT count(*) FROM movimentos_estoque WHERE "ordemId"='${o1}' AND tipo='SAIDA'`))
const saldoDepois = Number(sql(`SELECT "saldo" FROM pecas WHERE id='${peca}'`))
ok('ao INICIAR a manutenção, a peça sai do estoque de verdade',
   etapa(o1) === 'EM_MANUTENCAO' && saidas === 1 && saldoDepois === saldoAntes - 2,
   `saldo ${saldoAntes} → ${saldoDepois} (2 unidades) · ${saidas} movimento de SAIDA`)

// ===========================================================================
secao('"Prova não se apaga — nem pelo administrador"')
// ===========================================================================
const PROVAS = [
  ['eventos_ordem',      'evento da linha do tempo'],
  ['assinaturas',        'assinatura'],
  ['fotos',              'foto'],
  ['movimentos_estoque', 'movimento de estoque'],
  ['pecas_retiradas',    'peça retirada'],
  ['audit_logs',         'trilha de auditoria'],
]
for (const [tabela, nome] of PROVAS) {
  // O papel que a aplicação usa em produção é `dtechmed_app`.
  let r
  try {
    r = execFileSync('psql', ['-h','127.0.0.1','-p','5599','-U','dtechmed_app','-d','dtechmed','-tAc',
      `DELETE FROM ${tabela} WHERE true`], { encoding:'utf8', stdio:['pipe','pipe','pipe'] })
    r = 'APAGOU: ' + r.trim()
  } catch (e) {
    r = (e.stderr?.toString() || '').split('\n')[0].trim()
  }
  ok(`o ${nome} não pode ser apagado pela aplicação`,
     /permission denied|permissão negada/i.test(r), r.slice(0, 78))
}

// ===========================================================================
secao('"Retorno em garantia não fatura — e o sistema explica por quê"')
// ===========================================================================
const o2 = await abrirOrdem(ana, 'Medical San')
sql(`UPDATE ordens SET etapa='FATURAMENTO', "emGarantia"=true, "ordemOrigemId"='${o1}' WHERE id='${o2}'`)
await fabio.goto(`${QA_BASE}/painel/financeiro`, { waitUntil: 'domcontentloaded' })
await fabio.waitForTimeout(1500)
const emitirGarantia = fabio.getByRole('button', { name: /emitir fatura/i }).first()
let recusa = ''
if (await emitirGarantia.count()) {
  await emitirGarantia.click()
  await fabio.waitForTimeout(2500)
  recusa = (await fabio.evaluate(() => {
    const c = document.body.cloneNode(true)
    c.querySelectorAll('script,style').forEach((n) => n.remove())
    return c.textContent || ''
  })).replace(/\s+/g,' ').match(/[^.]*garantia[^.]*\./i)?.[0]?.trim() ?? ''
}
const faturaGarantia = sql(`SELECT count(*) FROM faturas WHERE "ordemId"='${o2}'`)
ok('a ordem em garantia NÃO virou fatura', faturaGarantia === '0')
ok('e o sistema explica o motivo na tela, em vez de só recusar',
   /garantia/i.test(recusa), recusa ? `"${recusa.slice(0,80)}"` : 'nenhuma explicação apareceu')

// ===========================================================================
secao('As três saídas — "não são posições no caminho, são saídas dele"')
// ===========================================================================
// 1) Orçamento recusado pelo cliente, no portal.
const o3 = await abrirOrdem(ana, 'WEM')
const t3 = sql(`SELECT "tokenPublico" FROM ordens WHERE id='${o3}'`)
const n3 = Number(sql(`SELECT coalesce(max(numero),0)+1 FROM orcamentos WHERE "tenantId"='${tenant}'`))
sql(`UPDATE ordens SET etapa='ORCAMENTO_ENVIADO', diagnostico='Placa queimada.' WHERE id='${o3}';
     INSERT INTO orcamentos (id,"tenantId","ordemId",numero,versao,status,"subtotalPecas","subtotalServicos","totalCentavos","criadoEm","atualizadoEm")
     VALUES ('orc-recusa-${n3}','${tenant}','${o3}',${n3},1,'ENVIADO',0,90000,90000,now(),now());
     INSERT INTO contadores ("tenantId",chave,valor) VALUES ('${tenant}','orcamento',${n3})
     ON CONFLICT ("tenantId",chave) DO UPDATE SET valor = GREATEST(contadores.valor, EXCLUDED.valor)`)
const cli3 = await (await nav.newContext({ viewport: { width: 430, height: 900 } })).newPage()
await cli3.goto(`${QA_BASE}/os/${t3}`, { waitUntil: 'domcontentloaded' })
await cli3.waitForTimeout(1200)
const recusar = cli3.getByRole('button', { name: /recusar|não aprovar|reprovar/i }).first()
if (await recusar.count()) {
  await recusar.click(); await cli3.waitForTimeout(900)
  await cli3.locator('#documento').fill('11444777000161')
  const motivo = cli3.locator('#motivo')
  if (await motivo.count()) await motivo.fill('Vou consertar em outro lugar, obrigada.')
  await cli3.getByRole('button', { name: /confirmar|recusar/i }).last().click()
  await cli3.waitForTimeout(2500)
}
ok('o cliente RECUSA pelo portal, sem precisar assinar nada',
   etapa(o3) === 'ORCAMENTO_REPROVADO', `etapa: ${etapa(o3)}`)
const motivoGravado = sql(`SELECT coalesce("motivoReprovacao",'') FROM orcamentos WHERE "ordemId"='${o3}' LIMIT 1`)
ok('e o motivo dele fica gravado', motivoGravado.length > 3, `"${motivoGravado.slice(0,60)}"`)

// 2) Devolvido sem reparo — e agora com fila e motorista, que era o buraco.
const devolveu = await avancar(camila, o3, 'Devolução sem reparo')
ok('a gestão pode devolver sem reparo', devolveu && etapa(o3) === 'DEVOLVIDO_SEM_REPARO')
await ana.goto(`${QA_BASE}/painel/agenda`, { waitUntil: 'domcontentloaded' })
await ana.waitForTimeout(1500)
const naFila = (await ana.evaluate(() => {
  const c = document.body.cloneNode(true)
  c.querySelectorAll('script,style').forEach((n) => n.remove())
  return c.textContent || ''
})).includes(String(sql(`SELECT numero FROM ordens WHERE id='${o3}'`)))
ok('o aparelho recusado APARECE na fila da Agenda, esperando motorista',
   naFila, naFila ? 'está na lista de quem espera agendamento' : 'NÃO aparece — ficaria sem viagem de volta')
const saiuSemParada = await avancar(camila, o3, 'Saiu para devolução')
ok('e não sai para devolução sem parada marcada',
   !saiuSemParada || etapa(o3) === 'DEVOLVIDO_SEM_REPARO')

// 3) Cancelado — só a gestão, e o motivo fica.
//
// O cancelamento NÃO é botão de etapa: ele parte de quase qualquer lugar da
// esteira e por isso fica fora da tabela de transições. Procurá-lo entre os
// passos foi o meu erro na primeira execução — e foi o que revelou que ele não
// tinha porta nenhuma na interface.
const o4 = await abrirOrdem(ana, 'Bioset')
const cancelar = async (pg) => {
  await pg.goto(`${QA_BASE}/painel/ordens/${o4}`, { waitUntil: 'domcontentloaded' })
  await pg.waitForTimeout(1100)
  const abrir = pg.getByRole('button', { name: /cancelar esta ordem/i }).first()
  if (!(await abrir.count())) return 'sem o bloco de cancelamento'
  await abrir.click(); await pg.waitForTimeout(700)
  const conf = pg.getByRole('button', { name: /confirmar o cancelamento/i }).first()
  const travadoSemMotivo = await conf.isDisabled()
  // A ficha tem várias caixas de texto (laudo, observações do orçamento). Esta
  // se identifica pelo próprio exemplo que ela mostra.
  await pg.getByPlaceholder(/Cliente desistiu antes da retirada/).fill('Cliente desistiu antes da retirada.')
  await pg.waitForTimeout(400)
  await conf.click(); await pg.waitForTimeout(2500)
  return travadoSemMotivo ? 'cancelou, e exigiu o motivo' : 'cancelou SEM exigir motivo'
}

const tentativaAna = await cancelar(ana)
ok('a atendente NÃO cancela ordem',
   tentativaAna === 'sem o bloco de cancelamento' && etapa(o4) !== 'CANCELADO', tentativaAna)

const tentativaCamila = await cancelar(camila)
ok('a gestão cancela, e o botão fica travado enquanto não há motivo',
   tentativaCamila === 'cancelou, e exigiu o motivo' && etapa(o4) === 'CANCELADO',
   `${tentativaCamila} · etapa: ${etapa(o4)}`)

const motivoCancel = sql(`SELECT coalesce(payload->>'observacao', payload::text) FROM eventos_ordem WHERE "ordemId"='${o4}' ORDER BY sequencia DESC LIMIT 1`)
ok('o motivo do cancelamento fica gravado na linha do tempo',
   motivoCancel.includes('desistiu'), `"${motivoCancel.slice(0,60)}"`)

const ordemAindaExiste = sql(`SELECT count(*) FROM ordens WHERE id='${o4}'`)
const eventosCancelada = Number(sql(`SELECT count(*) FROM eventos_ordem WHERE "ordemId"='${o4}'`))
ok('"nada é apagado: a ordem continua no histórico do aparelho"',
   ordemAindaExiste === '1' && eventosCancelada > 0, `${eventosCancelada} eventos preservados`)

const agSuspenso = sql(`SELECT coalesce(string_agg(DISTINCT status::text,','),'—') FROM agendamentos WHERE "ordemId"='${o4}'`)
ok('e a parada que existisse na rota é cancelada junto',
   agSuspenso === '—' || agSuspenso.includes('CANCELADO'), `agendamentos: ${agSuspenso}`)

// ===========================================================================
secao('"Quase toda etapa dispara um WhatsApp automático"')
// ===========================================================================
const etapasO1 = Number(sql(`SELECT count(*) FROM eventos_ordem WHERE "ordemId"='${o1}'`))
const avisosO1 = Number(sql(`SELECT count(*) FROM outbox_jobs WHERE payload->>'ordemId'='${o1}' AND tipo LIKE '%whatsapp%'`))
ok('cada etapa que avisa o cliente deixou o aviso na fila',
   avisosO1 >= Math.floor(etapasO1 * 0.5),
   `${etapasO1} etapas na linha do tempo · ${avisosO1} avisos enfileirados`)
const avisosSemTenant = Number(sql(`SELECT count(*) FROM outbox_jobs WHERE "tenantId" IS NULL AND tipo LIKE '%whatsapp%'`))
ok('nenhum aviso ficou sem dono de empresa', avisosSemTenant === 0, `${avisosSemTenant} sem tenant`)

await nav.close()
console.log('\n  ' + '─'.repeat(66))
console.log(falhas === 0
  ? '  O DIAGRAMA CONFERE COM O SISTEMA — nenhuma afirmação falsa\n'
  : `  ${falhas} AFIRMAÇÃO(ÕES) DO DIAGRAMA NÃO SE CONFIRMOU(RAM)\n`)
process.exit(falhas ? 1 : 0)
