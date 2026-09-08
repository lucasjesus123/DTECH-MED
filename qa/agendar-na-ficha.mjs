// =============================================================================
// AGENDAR NA FICHA — a agenda do MOTORISTA na hora de marcar, e o calendário
// =============================================================================
// O pedido do dono:
//
//   "aqui ao clicar agendar precisa abrir a data disponivel do MOTORISTA
//    - ja vinculando no calendario"
//
// O que existia: o passo "Retirada agendada" era RECUSADO pelo motor com a
// mensagem "Marque a parada na Agenda de rota antes". Mensagem correta e
// inútil — mandava a pessoa decorar o número da O.S., abrir outra tela, achar a
// ordem na fila, marcar, e voltar.
//
// O que este roteiro confere, e a ordem importa:
//
//   1. O BOTÃO ABRE, NÃO RECUSA. Clicar no passo que exige parada abre a janela
//      de marcação. Nenhum alerta vermelho na tela.
//
//   2. A JANELA NÃO PROMETE "LIVRE". Esta é a conferência de honestidade, e ela
//      é sobre uma palavra: o sistema não sabe a jornada de ninguém, não sabe
//      quanto dura uma parada nem a distância entre dois endereços. Pintar um
//      dia de "disponível" seria promessa que quem marca é que teria de
//      cumprir. O que a janela mostra é QUANTAS paradas já existem — fato.
//
//   3. E O NÚMERO É O DO BANCO. Cada motorista aparece com a sua carga, e aqui
//      ela é conferida contra `agendamentos`. Um contador que conta errado é
//      pior que contador nenhum: ele decide o dia de alguém.
//
//   4. O DIA MOSTRA O QUE AQUELE MOTORISTA JÁ TEM. Escolhido o dia, a lista tem
//      exatamente as paradas dele naquele dia — conferidas por número de O.S.
//
//   5. MARCAR ANDA A ESTEIRA. A parada nasce com o motorista e o dia escolhidos,
//      a ordem sai de ORDEM_RETIRADA_GERADA para RETIRADA_AGENDADA, e a trilha
//      registra. É a mesma `agendar` da Agenda de rota.
//
//   6. E APARECE NO CALENDÁRIO, no dia escolhido — que é a segunda metade do
//      pedido ("já vinculando no calendário").
//
//   7. COM A PARADA FEITA, O BOTÃO VOLTA A SER BOTÃO. A janela só existe
//      enquanto ela resolve alguma coisa.
// =============================================================================
import pw from '/opt/node22/lib/node_modules/playwright/index.js'
import { execFileSync } from 'node:child_process'
const { chromium } = pw
const QA_BASE = process.env.QA_BASE || 'http://127.0.0.1:3111'
const SENHA = process.env.QA_SENHA || 'Dtech' + '@2026'

let ruins = 0
const ok = (t) => console.log(`  ✅ ${t}`)
const nao = (t) => { console.log(`  🔴 ${t}`); ruins++ }

const sql = (q) => {
  const o = execFileSync('psql', ['-h', '127.0.0.1', '-p', '5599', '-U', 'postgres', '-d', 'dtechmed', '-tAc',
    "select set_config('app.is_super_admin','on',false); " + q], { encoding: 'utf8' }).trim().split('\n')
  return o.length > 1 ? o.slice(1).join('\n').trim() : ''
}

const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const erros = []
const p = await (await nav.newContext({ viewport: { width: 1500, height: 1000 } })).newPage()
p.on('pageerror', (e) => { if (!/DeprecationWarning|\(node:\d+\)/.test(String(e))) erros.push(String(e)) })
await p.goto(`${QA_BASE}/entrar`, { waitUntil: 'networkidle' })
await p.fill('#email', 'lucas@dtechmed.com.br')
await p.fill('#senha', SENHA)
await p.getByRole('button', { name: /entrar/i }).click()
await p.waitForURL((u) => !u.pathname.startsWith('/entrar'), { timeout: 20000 })

// ---------------------------------------------------------------------------
console.log('\n0) UMA ORDEM ESPERANDO MOTORISTA — aberta pela tela, como a central abre')
// ---------------------------------------------------------------------------
// O cenário de ensaio não deixa nenhuma ordem parada em ORDEM_RETIRADA_GERADA:
// as dele já nascem com parada marcada. Então a ordem deste roteiro é aberta
// pelo formulário de verdade — que é justamente o caminho de onde veio a
// reclamação.
await p.goto(`${QA_BASE}/painel/ordens/nova`, { waitUntil: 'domcontentloaded' })
await p.waitForTimeout(1200)
const form = p.locator('form').filter({ has: p.locator('textarea[name=defeito]') }).first()
await form.locator('input[name=clienteNome]').fill('Clínica Bella Pelle')
await form.locator('input[name=clienteDocumento]').fill('11444777000161')
await form.locator('input[name=clienteWhatsapp]').fill('51980449274')
await form.locator('input[name=contatoNome]').fill('Mariana Farias')
await form.locator('input[name=endereco]').fill('R. Sabiá, 702, Sala 03, Universitário')
await form.locator('input[name=cidade]').fill('Lajeado')
await form.locator('input[name=marca]').fill('Lavieen')
await form.locator('input[name=modelo]').fill('Duo')
await form.locator('input[name=numeroSerie]').fill(`LA-AG-${Date.now().toString().slice(-6)}`)
await form.locator('textarea[name=defeito]').fill('Não aquece. Cliente pediu retirada.')
await form.getByRole('button', { name: /abrir O\.S\. e gerar/i }).click()
await p.waitForTimeout(3500)

const ordemId = sql('select id from ordens order by "abertaEm" desc limit 1')
const numero = ordemId ? sql(`select numero from ordens where id='${ordemId}'`) : ''
const etapaInicial = ordemId ? sql(`select etapa from ordens where id='${ordemId}'`) : ''
if (!ordemId || etapaInicial !== 'ORDEM_RETIRADA_GERADA') {
  nao(`não consegui abrir uma O.S. esperando motorista (etapa=${etapaInicial || 'nenhuma'})`)
  console.log('\nRESULTADO: 1 vermelho')
  await nav.close()
  process.exit(1)
}
ok(`O.S. #${String(numero).padStart(4, '0')} aberta e parada em ${etapaInicial}`)

// ---------------------------------------------------------------------------
console.log('\n1) O BOTÃO ABRE A MARCAÇÃO — não recusa')
// ---------------------------------------------------------------------------
await p.goto(`${QA_BASE}/painel/ordens/${ordemId}`, { waitUntil: 'networkidle' })
const botao = p.getByRole('button', { name: /retirada agendada/i }).first()
const textoBotao = (await botao.innerText()).trim()
;/escolher dia e motorista/i.test(textoBotao)
  ? ok(`o botão anuncia o que vai acontecer: "${textoBotao}"`)
  : nao(`o botão não avisa que abre a marcação: "${textoBotao}"`)

await botao.click()
await p.waitForTimeout(900)
const janela = p.locator('[role="dialog"]')
;(await janela.count()) > 0
  ? ok('a janela de marcação abriu')
  : nao('clicar no passo não abriu janela nenhuma')

// Recusa é `role="alert"` COM TEXTO. A primeira versão contou os elementos, e
// a ficha tem um alerta vazio de reserva — o roteiro acusou "a tela recusou em
// vez de abrir" mostrando aspas vazias, que é o próprio recibo de que ele
// estava medindo a coisa errada.
const recusas = (await p.locator('[role="alert"]').allInnerTexts()).map((t) => t.trim()).filter(Boolean)
recusas.length === 0
  ? ok('e nenhuma recusa apareceu na tela')
  : nao(`a tela recusou em vez de abrir: "${recusas[0]}"`)

// ---------------------------------------------------------------------------
console.log('\n2) A JANELA NÃO PROMETE "LIVRE"')
// ---------------------------------------------------------------------------
const textoJanela = await janela.innerText()
;/\blivre\b|dispon[ií]ve/i.test(textoJanela)
  ? nao('a janela usa "livre"/"disponível" — o sistema não sabe a jornada de ninguém para prometer isso')
  : ok('a janela mostra carga, e não promete disponibilidade')

// ---------------------------------------------------------------------------
console.log('\n3) A CARGA DE CADA MOTORISTA bate com o banco')
// ---------------------------------------------------------------------------
// A janela olha 21 dias a partir de hoje — a mesma janela da consulta.
const doBanco = new Map()
const linhas = sql(`
  select u.nome, count(a.id)
  from usuarios u
  left join agendamentos a
    on a."motoristaId" = u.id
   and a.status <> 'CANCELADO'
   and (a."previstoPara" at time zone 'UTC' at time zone 'America/Sao_Paulo') >= date_trunc('day', now() at time zone 'America/Sao_Paulo')
   and (a."previstoPara" at time zone 'UTC' at time zone 'America/Sao_Paulo') <  date_trunc('day', now() at time zone 'America/Sao_Paulo') + interval '21 days'
  where u.papel = 'MOTORISTA' and u.ativo
  group by u.nome order by u.nome`)
for (const l of linhas.split('\n').filter(Boolean)) {
  const [nome, n] = l.split('|')
  doBanco.set(nome.trim(), Number(n))
}

const naTela = await janela.evaluate((d) =>
  [...d.querySelectorAll('button[aria-pressed]')]
    .filter((b) => /parada/i.test(b.textContent))
    .map((b) => b.textContent.trim()),
)

if (doBanco.size === 0) {
  nao('nenhum motorista ativo na empresa — a janela não teria o que mostrar')
} else {
  let bateu = 0
  for (const [nome, n] of doBanco) {
    const chip = naTela.find((t) => t.startsWith(nome))
    const esperado = n === 0 ? 'sem parada' : `${n} paradas`
    if (chip && chip.toLowerCase().includes(esperado.toLowerCase())) bateu++
    else nao(`${nome}: a janela diz "${chip ?? 'nada'}", o banco diz "${esperado}"`)
  }
  if (bateu === doBanco.size) ok(`os ${bateu} motoristas aparecem com a carga que o banco tem`)
}

// ---------------------------------------------------------------------------
console.log('\n4) O DIA MOSTRA o que aquele motorista já tem')
// ---------------------------------------------------------------------------
// Escolhe o motorista com mais paradas — é nele que a lista tem o que provar.
const [nomeCheio] = [...doBanco.entries()].sort((a, b) => b[1] - a[1])[0] ?? []
const motoristaId = nomeCheio ? sql(`select id from usuarios where nome = '${nomeCheio.replace(/'/g, "''")}' limit 1`) : ''
await janela.getByRole('button', { name: new RegExp(`^${nomeCheio}`, 'i') }).first().click()
await p.waitForTimeout(400)

// O dia com parada desse motorista, direto do banco.
const diaCheio = motoristaId
  ? sql(`select to_char((a."previstoPara" at time zone 'UTC' at time zone 'America/Sao_Paulo'), 'YYYY-MM-DD')
         from agendamentos a
         where a."motoristaId" = '${motoristaId}' and a.status <> 'CANCELADO'
           and (a."previstoPara" at time zone 'UTC' at time zone 'America/Sao_Paulo') >= date_trunc('day', now() at time zone 'America/Sao_Paulo')
         order by a."previstoPara" limit 1`)
  : ''

if (!diaCheio) {
  console.log(`  ⚪ NÃO TESTADO — ${nomeCheio ?? 'o motorista'} não tem parada nos próximos dias para conferir a lista`)
} else {
  const numerosNoBanco = sql(`select o.numero
    from agendamentos a join ordens o on o.id = a."ordemId"
    where a."motoristaId" = '${motoristaId}' and a.status <> 'CANCELADO'
      and to_char((a."previstoPara" at time zone 'UTC' at time zone 'America/Sao_Paulo'), 'YYYY-MM-DD') = '${diaCheio}'
    order by o.numero`).split('\n').filter(Boolean)

  const numeroDoDia = diaCheio.slice(8, 10)
  await janela.locator(`button[aria-pressed]:has-text("${numeroDoDia}")`).first().click().catch(() => {})
  await p.waitForTimeout(400)
  const listaNaTela = await janela.innerText()
  const faltando = numerosNoBanco.filter((n) => !listaNaTela.includes(`#${String(n).padStart(4, '0')}`))
  faltando.length === 0 && numerosNoBanco.length > 0
    ? ok(`em ${diaCheio}, a janela lista as ${numerosNoBanco.length} parada(s) que ${nomeCheio} tem`)
    : nao(`a lista do dia não mostra a(s) O.S. ${faltando.join(', ')} que o banco tem em ${diaCheio}`)
}

// ---------------------------------------------------------------------------
console.log('\n5) MARCAR anda a esteira, com o motorista e o dia escolhidos')
// ---------------------------------------------------------------------------
// Um dia à frente, para não brigar com o que já existe.
const diaAlvo = sql("select to_char((now() at time zone 'America/Sao_Paulo')::date + 3, 'YYYY-MM-DD')")
const numeroAlvo = diaAlvo.slice(8, 10)
await janela.locator(`button[aria-pressed]:has-text("${numeroAlvo}")`).first().click()
await p.waitForTimeout(300)
await janela.locator('input[name=hora]').fill('14:30')
await janela.getByRole('button', { name: /marcar e avisar/i }).click()
await p.waitForTimeout(4000)

const depois = sql(`select o.etapa, coalesce(u.nome,'—'),
    to_char((a."previstoPara" at time zone 'UTC' at time zone 'America/Sao_Paulo'), 'YYYY-MM-DD HH24:MI')
  from ordens o
  join agendamentos a on a."ordemId" = o.id
  left join usuarios u on u.id = a."motoristaId"
  where o.id = '${ordemId}' and a.status <> 'CANCELADO'`)

if (!depois) {
  nao('nenhuma parada foi criada para esta ordem')
} else {
  const [etapa, motorista, quando] = depois.split('|')
  etapa === 'RETIRADA_AGENDADA'
    ? ok(`a ordem andou ${etapaInicial} → ${etapa}`)
    : nao(`a parada foi criada mas a ordem ficou em ${etapa}`)
  motorista === nomeCheio
    ? ok(`a parada saiu com ${motorista}, o motorista escolhido na janela`)
    : nao(`escolhi ${nomeCheio} e a parada saiu com "${motorista}"`)
  quando.startsWith(diaAlvo) && quando.endsWith('14:30')
    ? ok(`no dia e na hora escolhidos: ${quando}`)
    : nao(`marquei ${diaAlvo} 14:30 e a parada ficou em ${quando}`)

  const evento = sql(`select count(*) from eventos_ordem where "ordemId"='${ordemId}' and "etapaNova"='RETIRADA_AGENDADA'`)
  Number(evento) > 0
    ? ok('e a trilha do prontuário registrou a transição')
    : nao('a ordem mudou de etapa sem gravar evento na trilha')
}

// ---------------------------------------------------------------------------
console.log('\n6) E APARECE NO CALENDÁRIO, no dia escolhido')
// ---------------------------------------------------------------------------
await p.goto(`${QA_BASE}/painel/calendario?ver=dia&dia=${diaAlvo}`, { waitUntil: 'networkidle' })
// A agenda não imprime o NÚMERO da O.S. — ela escreve "Buscar · cliente" e
// LINKA para a ficha. Procurar o número aqui foi erro meu, e o vermelho que
// deu apontava para o calendário quando o defeito era do roteiro. O link é a
// prova mais forte de qualquer jeito: ele amarra o evento àquela ordem, e não
// a um cliente de mesmo nome.
const linkNaAgenda = await p.locator(`a[href="/painel/ordens/${ordemId}"]`).count()
linkNaAgenda > 0
  ? ok(`a parada está no calendário de ${diaAlvo}, ligada à ficha da O.S. #${String(numero).padStart(4, '0')}`)
  : nao(`o calendário de ${diaAlvo} não mostra a parada que acabei de marcar`)

// ---------------------------------------------------------------------------
console.log('\n7) COM A PARADA FEITA, o botão volta a ser botão')
// ---------------------------------------------------------------------------
await p.goto(`${QA_BASE}/painel/ordens/${ordemId}`, { waitUntil: 'networkidle' })
const textoDepois = await p.locator('#passos').innerText()
;/escolher dia e motorista/i.test(textoDepois)
  ? nao('a ficha continua oferecendo marcar a parada depois de ela já existir')
  : ok('nenhum passo oferece marcar de novo — a janela some quando não resolve mais nada')

// ---------------------------------------------------------------------------
console.log('\n8) NENHUM ERRO de JavaScript na tela')
// ---------------------------------------------------------------------------
erros.length === 0 ? ok('console limpo') : nao(`erros no navegador: ${erros.join(' | ')}`)

await nav.close()
console.log(`\nRESULTADO: ${ruins === 0 ? 'tudo verde' : ruins + ' vermelho(s)'}`)
process.exit(ruins === 0 ? 0 : 1)
