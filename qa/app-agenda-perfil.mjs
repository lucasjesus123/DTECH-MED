// =============================================================================
// OS APPS DE CAMPO — a agenda de cada um, e o cadastro que ele mesmo arruma
// =============================================================================
// O pedido do dono:
//
//   "PRECISA TER AGENDA (CALENDARIO) - INDIVIDUAL PARA CADA MOTORISTA
//    PRECISA TER O PERFIL ONDE CADA MOTORISTA POSSA ALTERAR
//    DA MESMA FORMA EU PRECISO QUE O APP DO TECNICO IGUAL"
//
// O aplicativo abria no HOJE e terminava nele, e o cadastro era só de leitura —
// um motorista que trocou de número dependia do admin para atualizar.
//
// O que este roteiro confere:
//
//   1. A BARRA DE BAIXO existe nos dois apps, com o primeiro destino certo:
//      "Rota" para o motorista, "Bancada" para o técnico. Chamar as duas de
//      "Início" faria o técnico procurar um endereço que não existe na tela
//      dele.
//
//   2. A AGENDA É INDIVIDUAL — e esta é a conferência que sustenta as outras.
//      Não basta a tela mostrar algo: o que ela mostra tem de ser exatamente o
//      que o BANCO tem no nome daquela pessoa. Uma agenda que mostra a parada
//      de outro motorista não é um erro de tela, é a operação errada saindo
//      para a rua.
//
//   3. O TÉCNICO NÃO VÊ PARADA DE RUA. A agenda dele é feita de prazos; a do
//      motorista, de paradas. Espremer as duas no mesmo formato daria ao
//      técnico compromissos que ele não tem.
//
//   4. O PERFIL SALVA DE VERDADE — conferido no banco, não na tela. E a
//      alteração fica na trilha de auditoria: nome e CPF saem impressos no
//      comprovante que o cliente assina, então mudar aqui muda o que sai
//      amanhã.
//
//   5. O QUE NINGUÉM MUDA DE SI: e-mail e papel não têm campo. Um é a chave de
//      entrada, o outro é o que a pessoa pode fazer.
//
//   6. E O SERVIDOR RECUSA O QUE A TELA NÃO OFERECE. Mandar `papel` no
//      formulário não pode promover ninguém — a tela esconder nunca basta.
// =============================================================================
import pw from '/opt/node22/lib/node_modules/playwright/index.js'
import { execFileSync } from 'node:child_process'
const { chromium } = pw
const QA_BASE = process.env.QA_BASE || 'http://127.0.0.1:3111'
const SENHA = process.env.QA_SENHA || 'Dtech' + '@2026'

let ruins = 0
const ok = (t) => console.log(`  ✅ ${t}`)
const nao = (t) => { console.log(`  🔴 ${t}`); ruins++ }
const pulo = (t) => console.log(`  ⚪ NÃO TESTADO — ${t}`)

const sql = (q) => {
  const o = execFileSync('psql', ['-h', '127.0.0.1', '-p', '5599', '-U', 'postgres', '-d', 'dtechmed', '-tAc',
    "select set_config('app.is_super_admin','on',false); " + q], { encoding: 'utf8' }).trim().split('\n')
  return o.length > 1 ? o.slice(1).join('\n').trim() : ''
}

const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const erros = []
async function entrar(email) {
  const ctx = await nav.newContext({ viewport: { width: 400, height: 850 } })
  const p = await ctx.newPage()
  p.on('pageerror', (e) => { if (!/DeprecationWarning|\(node:\d+\)/.test(String(e))) erros.push(String(e)) })
  await p.goto(`${QA_BASE}/entrar`, { waitUntil: 'networkidle' })
  await p.fill('#email', email)
  await p.fill('#senha', SENHA)
  await p.getByRole('button', { name: /entrar/i }).click()
  await p.waitForURL((u) => !u.pathname.startsWith('/entrar'), { timeout: 20000 })
  return p
}

const motorista = await entrar('adriano@dtechmed.com.br')
const motoristaId = sql("select id from usuarios where email='adriano@dtechmed.com.br'")

// ---------------------------------------------------------------------------
console.log('\n1) A BARRA DE BAIXO, com o primeiro destino certo em cada app')
// ---------------------------------------------------------------------------
await motorista.goto(`${QA_BASE}/app/motorista`, { waitUntil: 'networkidle' })
const barra = motorista.locator('nav[aria-label="Navegação do aplicativo"]')
;(await barra.count()) > 0 ? ok('a barra existe no app do motorista') : nao('o app do motorista não tem barra')

const abasMot = (await barra.locator('a').allInnerTexts()).map((t) => t.trim())
abasMot.join('|') === 'Rota|Agenda|Perfil'
  ? ok(`os três destinos do motorista: ${abasMot.join(' · ')}`)
  : nao(`a barra do motorista tem "${abasMot.join(' · ')}"`)

// A aba acesa tem de aguentar a tela de dentro: `/app/motorista/<id>` continua
// sendo "Rota". Igualdade exata apagaria a barra inteira e pareceria que a
// pessoa saiu do aplicativo.
const umaOrdem = sql("select \"ordemId\" from agendamentos where \"motoristaId\"='" + motoristaId + "' and status <> 'CANCELADO' limit 1")
if (umaOrdem) {
  await motorista.goto(`${QA_BASE}/app/motorista/${umaOrdem}`, { waitUntil: 'networkidle' })
  const acesa = await barra.locator('a[aria-current="page"]').innerText().catch(() => '')
  acesa.trim() === 'Rota'
    ? ok('dentro de uma parada, a aba "Rota" continua acesa')
    : nao(`dentro de uma parada, a aba acesa é "${acesa.trim() || 'nenhuma'}"`)
} else {
  pulo('o motorista não tem parada nenhuma para conferir a aba acesa por dentro')
}

// ---------------------------------------------------------------------------
console.log('\n2) A AGENDA É INDIVIDUAL — e bate com o banco')
// ---------------------------------------------------------------------------
await motorista.goto(`${QA_BASE}/app/agenda`, { waitUntil: 'networkidle' })
const textoAgenda = await motorista.locator('main').innerText()

// As O.S. que ESTE motorista tem marcadas, direto do banco.
const minhas = sql(`
  select distinct o.numero
  from agendamentos a join ordens o on o.id = a."ordemId"
  where a."motoristaId" = '${motoristaId}' and a.status <> 'CANCELADO'
    and ((a."previstoPara" at time zone 'UTC' at time zone 'America/Sao_Paulo')
          >= date_trunc('day', now() at time zone 'America/Sao_Paulo')
         or a.status not in ('CONCLUIDO','CANCELADO'))
  order by o.numero`).split('\n').filter(Boolean)

// E as que NÃO são dele — nenhuma pode aparecer.
const alheias = sql(`
  select distinct o.numero
  from agendamentos a join ordens o on o.id = a."ordemId"
  where a.status <> 'CANCELADO'
    and (a."motoristaId" is null or a."motoristaId" <> '${motoristaId}')
  order by o.numero`).split('\n').filter(Boolean)

const naTela = (n) => textoAgenda.includes(`#${String(n).padStart(4, '0')}`)

if (minhas.length === 0) {
  pulo('o motorista não tem parada nos próximos dias — não deu para conferir o que a agenda mostra')
} else {
  const faltando = minhas.filter((n) => !naTela(n))
  faltando.length === 0
    ? ok(`a agenda mostra as ${minhas.length} O.S. que são dele`)
    : nao(`a agenda não mostra a(s) O.S. ${faltando.join(', ')}, que o banco diz ser dele`)
}

/**
 * A TRAVA DE ISOLAMENTO — e por que ela precisou de um segundo motorista.
 *
 * A primeira versão só perguntava "alguma parada de outro aparece aqui?", e
 * ficou VERDE dizendo "nenhuma das 0 paradas de outros". Zero: no cenário de
 * ensaio o Adriano é o único motorista, então não havia o que vazar. Um verde
 * assim não prova isolamento nenhum — ele prova que não havia teste.
 *
 * Agora o roteiro CRIA a condição: um segundo motorista, e uma parada que passa
 * a ser dele. Se a agenda do Adriano continuar mostrando aquela O.S., o
 * vermelho aparece — que é o comportamento que faltava.
 *
 * O segundo motorista nasce e morre aqui dentro. `senhaHash` é lixo de
 * propósito: ninguém entra como ele, e uma senha que funcione num usuário de
 * teste é uma porta que alguém esquece aberta.
 */
const tenant = sql("select \"tenantId\" from usuarios where id='" + motoristaId + "'")
const paradaCobaia = sql(`
  select a.id || '|' || o.numero
  from agendamentos a join ordens o on o.id = a."ordemId"
  where a."motoristaId" = '${motoristaId}' and a.status <> 'CANCELADO'
  order by a."previstoPara" desc limit 1`)

if (!paradaCobaia || !tenant) {
  pulo('não havia parada nem empresa para montar o segundo motorista — isolamento não conferido')
} else {
  const [paradaId, numeroCobaia] = paradaCobaia.split('|')
  sql(`insert into usuarios (id, "tenantId", nome, email, "senhaHash", papel, ativo, "trocarSenha", telas, "criadoEm", "atualizadoEm")
       values ('qa-outro-motorista', '${tenant}', 'Outro Motorista QA', 'qa-outro@dtechmed.com.br',
               'sem-senha-de-proposito', 'MOTORISTA', true, true, '{}', now(), now())
       on conflict (id) do nothing`)
  sql(`update agendamentos set "motoristaId" = 'qa-outro-motorista' where id = '${paradaId}'`)

  await motorista.goto(`${QA_BASE}/app/agenda`, { waitUntil: 'networkidle' })
  const depoisDaTroca = await motorista.locator('main').innerText()
  const marca = `#${String(numeroCobaia).padStart(4, '0')}`

  depoisDaTroca.includes(marca)
    ? nao(`VAZOU: a O.S. ${marca} passou a ser de outro motorista e continua na agenda do Adriano`)
    : ok(`a O.S. ${marca} mudou de dono e sumiu da agenda dele — cada um vê só o que é seu`)

  // Devolve o cenário ao que era: roteiro que deixa sujeira faz o próximo
  // reprovar por sobra de dado, que é o modo mais confuso de falhar.
  sql(`update agendamentos set "motoristaId" = '${motoristaId}' where id = '${paradaId}'`)
  sql("delete from usuarios where id='qa-outro-motorista'")
}

// ---------------------------------------------------------------------------
console.log('\n3) O TÉCNICO tem agenda de PRAZO, não de rua')
// ---------------------------------------------------------------------------
const tecnico = await entrar('rafael@dtechmed.com.br')
await tecnico.goto(`${QA_BASE}/app/tecnico`, { waitUntil: 'networkidle' })
const abasTec = (await tecnico.locator('nav[aria-label="Navegação do aplicativo"] a').allInnerTexts()).map((t) => t.trim())
abasTec.join('|') === 'Bancada|Agenda|Perfil'
  ? ok(`os três destinos do técnico: ${abasTec.join(' · ')}`)
  : nao(`a barra do técnico tem "${abasTec.join(' · ')}"`)

await tecnico.goto(`${QA_BASE}/app/agenda`, { waitUntil: 'networkidle' })
const textoTec = await tecnico.locator('main').innerText()
;/RETIRADA|ENTREGA/.test(textoTec)
  ? nao('a agenda do técnico mostra parada de rua — ele não dirige')
  : ok('a agenda do técnico não mostra parada de rua')

const tecnicoId = sql("select id from usuarios where email='rafael@dtechmed.com.br'")
const prazos = sql(`
  select o.numero from ordens o
  where o."tecnicoId" = '${tecnicoId}' and o."prazoPrometido" is not null
    and o.etapa not in ('FINALIZADO','CANCELADO')
  order by o.numero`).split('\n').filter(Boolean)
if (prazos.length === 0) {
  pulo('nenhuma ordem do técnico tem prazo — a agenda dele está legitimamente vazia')
} else {
  const semPrazo = prazos.filter((n) => !textoTec.includes(`#${String(n).padStart(4, '0')}`))
  semPrazo.length === 0
    ? ok(`a agenda do técnico mostra as ${prazos.length} ordens com prazo dele`)
    : nao(`faltam na agenda do técnico: ${semPrazo.join(', ')}`)
}

// ---------------------------------------------------------------------------
console.log('\n4) O PERFIL salva de verdade')
// ---------------------------------------------------------------------------
await motorista.goto(`${QA_BASE}/app/perfil`, { waitUntil: 'networkidle' })
const novoTel = `5198${Date.now().toString().slice(-7)}`
const antes = sql(`select coalesce(telefone,'—') from usuarios where id='${motoristaId}'`)
await motorista.fill('input[name=telefone]', novoTel)
await motorista.getByRole('button', { name: /Salvar cadastro/i }).click()
await motorista.waitForTimeout(2500)

const depois = sql(`select coalesce(telefone,'—') from usuarios where id='${motoristaId}'`)
depois === novoTel
  ? ok(`o telefone mudou no banco: ${antes} → ${depois}`)
  : nao(`a tela disse que salvou e o banco tem "${depois}" (esperado ${novoTel})`)

const trilhado = sql(`select count(*) from audit_logs where acao='perfil.atualizado' and "entidadeId"='${motoristaId}'`)
Number(trilhado) > 0
  ? ok('a alteração ficou na trilha de auditoria — o nome e o CPF saem impressos no comprovante')
  : nao('o perfil mudou sem deixar registro na trilha')

// ---------------------------------------------------------------------------
console.log('\n5) O QUE NINGUÉM MUDA DE SI: e-mail e papel não têm campo')
// ---------------------------------------------------------------------------
const temEmail = await motorista.locator('input[name=email]').count()
const temPapel = await motorista.locator('[name=papel]').count()
temEmail === 0 && temPapel === 0
  ? ok('não há campo de e-mail nem de papel no perfil')
  : nao(`o perfil oferece campo proibido — email:${temEmail} papel:${temPapel}`)

// ---------------------------------------------------------------------------
console.log('\n6) E O SERVIDOR RECUSA o que a tela não oferece')
// ---------------------------------------------------------------------------
// A tela esconder nunca basta: quem quiser se promover manda o campo na mão.
// A ação só lê nome, telefone e documento — o resto do formulário é ignorado.
await motorista.evaluate(() => {
  const f = document.querySelector('form')
  for (const [nome, valor] of [['papel', 'ADMIN_EMPRESA'], ['email', 'invasor@exemplo.com']]) {
    const i = document.createElement('input')
    i.type = 'hidden'
    i.name = nome
    i.value = valor
    f.appendChild(i)
  }
})
await motorista.getByRole('button', { name: /Salvar cadastro/i }).click()
await motorista.waitForTimeout(2500)

const seguiuIgual = sql(`select papel || '|' || email from usuarios where id='${motoristaId}'`)
seguiuIgual === 'MOTORISTA|adriano@dtechmed.com.br'
  ? ok('mandar papel e e-mail no formulário não mudou nem um nem outro')
  : nao(`o servidor aceitou campo proibido: agora é "${seguiuIgual}"`)

// ---------------------------------------------------------------------------
console.log('\n7) NENHUM ERRO de JavaScript na tela')
// ---------------------------------------------------------------------------
erros.length === 0 ? ok('console limpo') : nao(`erros no navegador: ${erros.join(' | ')}`)

await nav.close()
console.log(`\nRESULTADO: ${ruins === 0 ? 'tudo verde' : ruins + ' vermelho(s)'}`)
process.exit(ruins === 0 ? 0 : 1)
