// =============================================================================
// O ACEITE — a central designa, quem vai é que confirma
// =============================================================================
// O pedido do dono:
//
//   "NO APP DO ENTREGADOR ... O MOTORISTA TEM QUE ACEITAR E QUEM VAI MANDAR
//    PARA ELE SERÁ O ADMINISTRADOR QUE GERA A O.S ...
//    O APP DO TECNICO (PRECISA ELE ACIETAR A O.S O PRIMEIRO PASSO É JA TIRAR
//    FOTO IMEDIATA)"
//
// Antes disto, "designado" e "combinado" eram a mesma linha no banco. Entre as
// duas cabe um motorista de folga, um celular sem bateria e um aparelho que
// ninguém foi buscar.
//
// O que este roteiro confere:
//
//   1. A CORRIDA NASCE POR ACEITAR, e o cartão mostra só isso. Nem o mapa, nem
//      o telefone, nem "saí para esta parada": um botão só, porque essa é a
//      única decisão daquele cartão até ser tomada.
//
//   2. ACEITAR ABRE O CAMINHO. Depois do aceite, a saída e a chegada aparecem,
//      a hora fica no banco e a trilha registra quem aceitou.
//
//   3. A TRAVA É DO SERVIDOR, não da tela — e esta é a conferência que sustenta
//      todas as outras. Com a página já carregada e o botão de saída desenhado,
//      o roteiro APAGA o aceite direto no banco e clica. É o estado real de uma
//      tela desatualizada. Se a trava vivesse só no React, a ordem andaria.
//
//   4. NINGUÉM ACEITA A CORRIDA DE OUTRO. Aceitar a do colega some com ela da
//      fila dele, e a central passa a ver como resolvido um endereço que
//      ninguém tem.
//
//   5. O ACEITE DO TÉCNICO É A FOTO — e sem arquivo ele não existe. Um aceite
//      sem foto marcaria a hora em que alguém assumiu um aparelho que ninguém
//      viu, que é o buraco que a foto existe para fechar.
//
//   6. E ASSUMIR AMARRA O TÉCNICO À ORDEM, com a foto guardada como prova de
//      "como chegou".
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
  const ctx = await nav.newContext({ viewport: { width: 400, height: 880 } })
  const p = await ctx.newPage()
  p.on('pageerror', (e) => { if (!/DeprecationWarning|\(node:\d+\)/.test(String(e))) erros.push(String(e)) })
  await p.goto(`${QA_BASE}/entrar`, { waitUntil: 'networkidle' })
  await p.fill('#email', email)
  await p.fill('#senha', SENHA)
  await p.getByRole('button', { name: /entrar/i }).click()
  await p.waitForURL((u) => !u.pathname.startsWith('/entrar'), { timeout: 20000 })
  return p
}

const motoristaId = sql("select id from usuarios where email='adriano@dtechmed.com.br'")

/**
 * UMA PARADA DE HOJE, NÃO ACEITA E FORA DA ROTA — o estado que a regra pega.
 *
 * O cenário de ensaio nasceu antes do aceite existir, então as paradas dele
 * têm `aceitoEm` nulo por herança. Aqui o roteiro escolhe uma de HOJE que ainda
 * não saiu e garante que ela está nesse estado — sem isso, ele mediria uma
 * corrida já em rota, que de propósito não pede aceite nenhum.
 */
const alvo = sql(`
  select a.id || '|' || o.id || '|' || o.numero
  from agendamentos a join ordens o on o.id = a."ordemId"
  where a."motoristaId" = '${motoristaId}'
    and a.status = 'ATRIBUIDO'
    and o.etapa = 'RETIRADA_AGENDADA'
    and (a."previstoPara" at time zone 'UTC' at time zone 'America/Sao_Paulo')::date
        = (now() at time zone 'America/Sao_Paulo')::date
  order by a."previstoPara" limit 1`)

if (!alvo) {
  nao('não achei parada de hoje, atribuída e ainda não iniciada, para conferir o aceite')
  console.log('\nRESULTADO: 1 vermelho')
  await nav.close()
  process.exit(1)
}
const [agId, ordemId, numero] = alvo.split('|')
sql(`update agendamentos set "aceitoEm" = null where id = '${agId}'`)
const marca = `#${String(numero).padStart(4, '0')}`

const motorista = await entrar('adriano@dtechmed.com.br')

// ---------------------------------------------------------------------------
console.log('\n1) A CORRIDA NASCE POR ACEITAR — e o cartão mostra só isso')
// ---------------------------------------------------------------------------
await motorista.goto(`${QA_BASE}/app/motorista`, { waitUntil: 'networkidle' })
const cartao = motorista.locator('article').filter({ hasText: marca }).first()
;(await cartao.count()) > 0 ? ok(`o cartão da O.S. ${marca} está na rota de hoje`) : nao(`a O.S. ${marca} não aparece na rota`)

const textoCartao = await cartao.innerText()
;/Aceitar esta corrida/i.test(textoCartao)
  ? ok('o cartão oferece "Aceitar esta corrida"')
  : nao(`o cartão não pede aceite: "${textoCartao.replace(/\s+/g, ' ').slice(0, 120)}"`)

const temSaida = /Saí para esta parada/i.test(textoCartao)
const temChegada = /Cheguei/i.test(textoCartao)
const temMapa = /Abrir no mapa/i.test(textoCartao)
!temSaida && !temChegada && !temMapa
  ? ok('e não oferece mais nada: sem saída, sem chegada, sem mapa')
  : nao(`o cartão oferece ação antes do aceite — saída:${temSaida} chegada:${temChegada} mapa:${temMapa}`)

// ---------------------------------------------------------------------------
console.log('\n2) ACEITAR ABRE O CAMINHO')
// ---------------------------------------------------------------------------
await cartao.getByRole('button', { name: /Aceitar esta corrida/i }).click()
await motorista.waitForTimeout(2500)

const aceito = sql(`select coalesce("aceitoEm"::text,'nulo') from agendamentos where id='${agId}'`)
aceito !== 'nulo'
  ? ok(`a hora do aceite ficou no banco: ${aceito}`)
  : nao('cliquei em aceitar e o banco continua em branco')

const trilha = sql(`select count(*) from audit_logs where acao='corrida.aceita' and "entidadeId"='${ordemId}'`)
Number(trilha) > 0 ? ok('e a trilha registrou quem aceitou') : nao('o aceite não deixou registro na trilha')

await motorista.goto(`${QA_BASE}/app/motorista`, { waitUntil: 'networkidle' })
const cartao2 = motorista.locator('article').filter({ hasText: marca }).first()
const depoisDoAceite = await cartao2.innerText()
;/Saí para esta parada/i.test(depoisDoAceite) && /Cheguei/i.test(depoisDoAceite)
  ? ok('agora o cartão oferece a saída e a chegada')
  : nao(`depois de aceitar, o cartão não libera as ações: "${depoisDoAceite.replace(/\s+/g, ' ').slice(0, 140)}"`)

;/você aceitou às/i.test(depoisDoAceite)
  ? ok('e mostra a hora do aceite — o recibo dos dois lados')
  : nao('o cartão não mostra quando foi aceita')

// ---------------------------------------------------------------------------
console.log('\n3) A TRAVA É DO SERVIDOR — com a tela fora do caminho')
// ---------------------------------------------------------------------------
/**
 * ESCONDER O BOTÃO NÃO É TRAVA, e esta conferência é a que separa uma coisa da
 * outra.
 *
 * Com a tela já carregada e o botão "Saí para esta parada" desenhado, o roteiro
 * APAGA o aceite direto no banco — por trás da página, sem recarregar. É o
 * estado real de uma tela desatualizada: o motorista com o aplicativo aberto
 * desde cedo, e a central tendo trocado a corrida de dono nesse meio-tempo.
 *
 * Aí ele clica. Se a trava vivesse só no React, a ordem andaria. A recusa tem
 * de vir do servidor, escrita, e a etapa tem de continuar onde estava.
 */
sql(`update agendamentos set "aceitoEm" = null where id = '${agId}'`)
const etapaAntes = sql(`select etapa from ordens where id='${ordemId}'`)

await cartao2.getByRole('button', { name: /Saí para esta parada/i }).click()
await motorista.waitForTimeout(3000)

const etapaDepois = sql(`select etapa from ordens where id='${ordemId}'`)
const recusaNaTela = (await motorista.locator('[role="alert"]').allInnerTexts())
  .map((t) => t.trim())
  .filter(Boolean)

etapaDepois === etapaAntes
  ? ok(`o servidor recusou a saída sem aceite: a ordem continua em ${etapaDepois}`)
  : nao(`SAIU SEM ACEITE: a ordem andou ${etapaAntes} → ${etapaDepois}`)

recusaNaTela.some((t) => /aceite esta corrida/i.test(t))
  ? ok(`e disse por quê: "${recusaNaTela.find((t) => /aceite esta corrida/i.test(t))}"`)
  : nao(`a recusa não apareceu na tela: ${JSON.stringify(recusaNaTela)}`)

// Devolve o aceite para não deixar a parada travada no cenário.
sql(`update agendamentos set "aceitoEm" = now() where id = '${agId}'`)

// ---------------------------------------------------------------------------
console.log('\n4) NINGUÉM ACEITA A CORRIDA DE OUTRO')
// ---------------------------------------------------------------------------
// Uma parada passa a ser de um segundo motorista; o primeiro tenta aceitar.
const tenant = sql(`select "tenantId" from usuarios where id='${motoristaId}'`)
const outra = sql(`
  select a.id from agendamentos a join ordens o on o.id = a."ordemId"
  where a."motoristaId" = '${motoristaId}' and a.status = 'ATRIBUIDO' and a.id <> '${agId}'
  limit 1`)

if (!outra || !tenant) {
  pulo('não havia uma segunda parada para conferir o aceite alheio')
} else {
  sql(`insert into usuarios (id, "tenantId", nome, email, "senhaHash", papel, ativo, "trocarSenha", telas, "criadoEm", "atualizadoEm")
       values ('qa-motorista-2', '${tenant}', 'Outro Motorista QA', 'qa-m2@dtechmed.com.br',
               'sem-senha-de-proposito', 'MOTORISTA', true, true, '{}', now(), now())
       on conflict (id) do nothing`)
  sql(`update agendamentos set "motoristaId"='qa-motorista-2', "aceitoEm"=null where id='${outra}'`)

  // A tela não oferece o botão (a parada não é dele), então a conferência é a
  // do banco: continua sem aceite, e no nome do outro.
  await motorista.goto(`${QA_BASE}/app/motorista`, { waitUntil: 'networkidle' })
  const estado = sql(`select coalesce("aceitoEm"::text,'nulo') || '|' || coalesce("motoristaId",'—') from agendamentos where id='${outra}'`)
  estado === 'nulo|qa-motorista-2'
    ? ok('a parada do colega continua sem aceite e no nome dele')
    : nao(`a parada do colega mudou: ${estado}`)

  const naTela = await motorista.locator('main').innerText()
  !naTela.includes('Outro Motorista QA')
    ? ok('e ela nem aparece na rota do primeiro motorista')
    : nao('a parada do colega apareceu na rota de quem não é dono dela')

  sql(`update agendamentos set "motoristaId"='${motoristaId}' where id='${outra}'`)
  sql("delete from usuarios where id='qa-motorista-2'")
}

// ---------------------------------------------------------------------------
console.log('\n5) O ACEITE DO TÉCNICO É A FOTO')
// ---------------------------------------------------------------------------
const paraOTecnico = sql(`
  select id || '|' || numero from ordens
  where etapa in ('COLETADO','RECEBIDO_NA_EMPRESA') and "tecnicoAceitouEm" is null
  order by "atualizadoEm" limit 1`)

if (!paraOTecnico) {
  pulo('nenhuma ordem na bancada sem técnico para conferir o aceite com foto')
} else {
  const [ordemTec, numTec] = paraOTecnico.split('|')
  const tecnico = await entrar('rafael@dtechmed.com.br')
  await tecnico.goto(`${QA_BASE}/app/tecnico/${ordemTec}`, { waitUntil: 'networkidle' })

  const corpo = await tecnico.locator('main').innerText()
  ;/Fotografar e assumir/i.test(corpo)
    ? ok(`a O.S. #${String(numTec).padStart(4, '0')} pede a foto para ser assumida`)
    : nao('a tela do técnico não pede a foto do aceite')

  // As seis fotos da entrada NÃO podem estar na frente: os dois caminhos juntos
  // fariam o técnico pular justamente o que fecha a fronteira do "como chegou".
  ;/de 6 fotos|Dar entrada no equipamento/i.test(corpo)
    ? nao('a tela oferece a entrada antes do aceite')
    : ok('e não oferece a entrada antes disso')

  const fotosAntes = Number(sql(`select count(*) from fotos where "ordemId"='${ordemTec}'`))

  // Uma JPEG de verdade: o servidor abre a imagem e recusa o que só se diz
  // imagem, então um arquivo falso não provaria nada.
  await tecnico.setInputFiles('input[type=file]', {
    name: 'aceite.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.from(
      '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a' +
      'HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIy' +
      'MjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAAIAAgDASIA' +
      'AhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQA' +
      'AAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3' +
      'ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWm' +
      'p6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/9oADAMB' +
      'AAIRAxEAPwD3+iiigD//2Q==',
      'base64',
    ),
  })
  await tecnico.waitForTimeout(4000)

  const depois = sql(`select coalesce("tecnicoAceitouEm"::text,'nulo') || '|' || coalesce("tecnicoId",'—') from ordens where id='${ordemTec}'`)
  const tecnicoId = sql("select id from usuarios where email='rafael@dtechmed.com.br'")
  const [quando, dono] = depois.split('|')

  quando !== 'nulo'
    ? ok(`a foto assumiu a O.S.: aceite gravado em ${quando}`)
    : nao('mandei a foto e a ordem continua sem aceite')
  dono === tecnicoId
    ? ok('e a ordem ficou no nome do técnico que fotografou')
    : nao(`a ordem ficou com "${dono}"`)

  const fotosDepois = Number(sql(`select count(*) from fotos where "ordemId"='${ordemTec}'`))
  const legenda = sql(`select coalesce(legenda,'—') from fotos where "ordemId"='${ordemTec}' order by "criadoEm" desc limit 1`)
  fotosDepois === fotosAntes + 1 && /como chegou/i.test(legenda)
    ? ok(`a foto ficou guardada como prova: "${legenda}"`)
    : nao(`a foto não entrou como esperado (${fotosAntes} → ${fotosDepois}, legenda "${legenda}")`)

  const trilhaTec = sql(`select count(*) from audit_logs where acao='ordem.aceita_tecnico' and "entidadeId"='${ordemTec}'`)
  Number(trilhaTec) > 0 ? ok('e a trilha registrou quem assumiu') : nao('assumir não deixou registro na trilha')
}

// ---------------------------------------------------------------------------
console.log('\n6) NENHUM ERRO de JavaScript na tela')
// ---------------------------------------------------------------------------
erros.length === 0 ? ok('console limpo') : nao(`erros no navegador: ${erros.join(' | ')}`)

await nav.close()
console.log(`\nRESULTADO: ${ruins === 0 ? 'tudo verde' : ruins + ' vermelho(s)'}`)
process.exit(ruins === 0 ? 0 : 1)
