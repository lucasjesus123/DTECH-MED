// Contrato de prestação e nota promissória: emitem, saem com o valor do
// orçamento aprovado, e não são emitidos por quem não deve.
import pw from '/opt/node22/lib/node_modules/playwright/index.js'
import { execFileSync } from 'node:child_process'
import { textoDoPdf } from './ler-pdf.mjs'
const { chromium } = pw
const QA_BASE = process.env.QA_BASE || 'http://127.0.0.1:3111'
const SENHA = process.env.QA_SENHA || 'Dtech' + '@2026'

let ruins = 0
const ok = (t) => console.log(`  ✅ ${t}`)
const nao = (t) => { console.log(`  🔴 ${t}`); ruins++ }
const sql = (q) => execFileSync('psql', ['-h','127.0.0.1','-p','5599','-U','postgres','-d','dtechmed','-tAc',
  "select set_config('app.is_super_admin','on',false); " + q], { encoding: 'utf8' }).trim().split('\n').pop().trim()

// Repetir a passada não pode reprovar a seguinte: o teste emite os dois
// documentos, e sem esta limpeza a segunda execução acharia quatro.
execFileSync('psql', ['-h','127.0.0.1','-p','5599','-U','postgres','-d','dtechmed',
  '-c', "select set_config('app.is_super_admin','on',false)",
  '-c', "delete from documentos where tipo::text in ('CONTRATO_PRESTACAO','NOTA_PROMISSORIA')"],
  { stdio: 'pipe' })

const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const erros = []
async function entrar(email) {
  const p = await (await nav.newContext({ viewport: { width: 1500, height: 1100 } })).newPage()
  p.on('pageerror', (e) => erros.push(String(e)))
  await p.goto(`${QA_BASE}/entrar`, { waitUntil: 'networkidle' })
  await p.fill('#email', email); await p.fill('#senha', SENHA)
  await p.getByRole('button', { name: /entrar/i }).click()
  await p.waitForURL(u => !u.pathname.startsWith('/entrar'), { timeout: 20000 })
  return p
}

/**
 * Uma ordem com orçamento APROVADO, SALDO EM ABERTO e — isto é o que faltava —
 * DA EMPRESA DO FÁBIO.
 *
 * A primeira versão pegava qualquer ordem aprovada, e caiu numa já quitada: o
 * contrato saía certo e a nota promissória saía com "ZERO REAL" por extenso no
 * meio da folha — um título sem objeto, assinável. O teste precisa de uma ordem
 * que deva alguma coisa, senão não exercita a nota.
 *
 * A segunda versão passava sozinha e reprovava dentro da bateria, que é o pior
 * jeito de um teste falhar — parece defeito do produto. Ela anunciava "sem botão
 * Emitir contrato", acusando a tela. A tela estava certa.
 *
 * O motivo verdadeiro: NÃO HAVIA ORDEM NENHUMA que servisse. O `db:seed --demo`
 * não cria ordens, e a `jornada.mjs` leva a dela até FINALIZADO — quitada. Sem
 * ninguém devendo nada, a consulta voltava vazia, o `goto` ia para
 * `/painel/ordens/` (a LISTA, que naturalmente não tem botão de emitir), e o
 * teste culpava a tela errada. Consertado na raiz: o `semear()` da bateria agora
 * monta o cenário completo antes da fase 2.
 *
 * O `tenantId` abaixo é cinto de segurança para o problema VIZINHO, que ainda
 * não tinha mordido: `isolamento.mjs` roda antes e cria uma segunda franquia.
 * Este `sql` é super admin e enxerga as duas, então um dia o `limit 1` cairia
 * numa ordem da vizinha — que o Fábio, corretamente, não pode abrir.
 */
const tenantDoFabio = sql(`select "tenantId" from usuarios where email = 'fabio@dtechmed.com.br' limit 1`)
const ordemId = sql(`
  select o.id from ordens o
    join orcamentos q on q."ordemId" = o.id and q.status::text = 'APROVADO'
    left join faturas f on f."ordemId" = o.id
   where o."tenantId" = '${tenantDoFabio}'
     and coalesce(f."valorTotalCentavos" + f."multaCentavos" + f."jurosCentavos"
                  - f."valorPagoCentavos", q."totalCentavos") > 0
   limit 1`)

// Sem ordem, o `goto` iria para `/painel/ordens/` — a LISTA, que naturalmente
// não tem botão de emitir. O teste reprovaria dizendo "sem botão", que é uma
// acusação falsa sobre a tela errada. Melhor parar aqui e dizer o que faltou.
if (!ordemId) {
  console.log('  🔴 nenhuma ordem com orçamento aprovado e saldo em aberto na empresa do Fábio')
  console.log('     semeie o banco antes: npm run db:seed -- --demo')
  process.exit(1)
}
// O CONTRATO usa o total; a NOTA usa o saldo em aberto. São números diferentes
// de propósito: um contrato quitado continua valendo o que valia.
const nomeDoCliente = sql(`select c.nome from clientes c join ordens o on o."clienteId"=c.id where o.id='${ordemId}'`)
const totalEsperado = sql(`
  select coalesce((select "valorTotalCentavos" from faturas where "ordemId" = '${ordemId}'),
                  (select "totalCentavos" from orcamentos where "ordemId" = '${ordemId}'
                     and status::text = 'APROVADO' order by versao desc limit 1))`)
const abertoEsperado = sql(`
  select coalesce((select "valorTotalCentavos" + "multaCentavos" + "jurosCentavos"
                          - "valorPagoCentavos" from faturas where "ordemId" = '${ordemId}'),
                  (select "totalCentavos" from orcamentos where "ordemId" = '${ordemId}'
                     and status::text = 'APROVADO' order by versao desc limit 1))`)

console.log('\n1) O financeiro emite os dois')
const p = await entrar('fabio@dtechmed.com.br')

// A EMISSÃO MUDOU DE LUGAR, e o roteiro confere que o caminho novo funciona.
//
// Ela era um bloco na coluna lateral da ficha, abaixo de Assinaturas — o dono
// do sistema foi procurar como emitir contrato e não achou. Virou a aba
// "Contrato e documentos". Aqui se prova o caminho INTEIRO: a ficha oferece a
// aba, e a aba oferece os botões. Ir direto pela URL provaria só metade, e a
// metade que faltaria é justamente a que estava quebrada — achar.
await p.goto(`${QA_BASE}/painel/ordens/${ordemId}`, { waitUntil: 'networkidle' })
await p.waitForTimeout(900)
const linkAba = p.getByRole('link', { name: /Contrato e documentos/i }).first()
;(await linkAba.count()) > 0 ? ok('a ficha tem a aba "Contrato e documentos"') : nao('a ficha não oferece a aba de documentos')
await linkAba.click()
await p.waitForURL(/ver=documentos/, { timeout: 15000 })
await p.waitForTimeout(700)

for (const b of ['Emitir contrato', 'Emitir nota promissória']) {
  ;(await p.getByRole('button', { name: b }).count()) > 0 ? ok(`botão "${b}"`) : nao(`sem botão "${b}"`)
}

const antes = Number(sql(`select count(*) from documentos where "ordemId" = '${ordemId}'`))
await p.getByRole('button', { name: 'Emitir contrato' }).click()
await p.waitForTimeout(3500)
const comContrato = sql(`select count(*) from documentos where "ordemId" = '${ordemId}' and tipo::text = 'CONTRATO_PRESTACAO'`)
comContrato === '1' ? ok('o contrato foi gravado') : nao(`contratos gravados: ${comContrato}`)

await p.getByRole('button', { name: 'Emitir nota promissória' }).click()
await p.waitForTimeout(3500)
const comNota = sql(`select count(*) from documentos where "ordemId" = '${ordemId}' and tipo::text = 'NOTA_PROMISSORIA'`)
comNota === '1' ? ok('a nota promissória foi gravada') : nao(`notas gravadas: ${comNota}`)

const depois = Number(sql(`select count(*) from documentos where "ordemId" = '${ordemId}'`))
depois === antes + 2 ? ok(`${antes} → ${depois} documentos`) : nao(`esperava ${antes + 2}, veio ${depois}`)

console.log('\n2) O PDF sai de verdade, e com hash')
const tok = sql(`select "tokenAcesso" from documentos where "ordemId" = '${ordemId}' and tipo::text = 'NOTA_PROMISSORIA'`)
// `page.goto` num PDF entrega o visor do navegador, não o arquivo — o corpo
// vem truncado (345 bytes de um arquivo de 10 KB). `request.get` faz a
// requisição HTTP de verdade, com os cookies da sessão, e devolve os bytes.
const r = await p.request.get(`${QA_BASE}/api/documento/${tok}`)
r.status() === 200 ? ok(`o PDF responde 200`) : nao(`o PDF respondeu ${r.status()}`)
const tipoResp = r.headers()['content-type'] ?? ''
;/pdf/.test(tipoResp) ? ok(`é PDF de verdade (${tipoResp})`) : nao(`content-type: ${tipoResp}`)
const corpo = await r.body()
const bytes = corpo.length
bytes > 1500 ? ok(`${bytes} bytes — não é arquivo vazio`) : nao(`só ${bytes} bytes`)
const hash = sql(`select hash from documentos where "tokenAcesso" = '${tok}'`)
hash && hash.length === 64 ? ok('o SHA-256 do conteúdo ficou gravado') : nao(`hash suspeito: "${hash}"`)

// O PDF começa com %PDF- e termina com %%EOF: prova que o arquivo está
// inteiro, e não cortado no meio da gravação.
corpo.subarray(0, 5).toString() === '%PDF-' ? ok('começa com %PDF-') : nao('não é um PDF válido no começo')
corpo.subarray(-1024).includes('%%EOF') ? ok('termina com %%EOF — arquivo completo') : nao('o PDF está truncado')

// O QUE ESTÁ ESCRITO DENTRO, e não só que um arquivo saiu.
//
// "responde 200 e tem 9 KB" prova que existe um PDF. Um contrato gerado com o
// valor de outra ordem tem exatamente o mesmo tamanho e o mesmo cabeçalho.
const dentro = textoDoPdf(corpo).replace(/\s+/g, '')
const semEspaco = (x) => String(x).replace(/\s+/g, '')
dentro.length > 200
  ? ok(`o texto do PDF foi lido (${dentro.length} caracteres)`)
  : nao(`não consegui ler o texto do PDF (${dentro.length} caracteres) — sem isto as conferências abaixo não valem`)
dentro.includes(semEspaco(nomeDoCliente))
  ? ok('o nome do cliente está impresso no documento')
  : nao('o nome do cliente NÃO aparece no PDF')
!dentro.includes('{{')
  ? ok('nenhum marcador cru sobrou no papel')
  : nao('sobrou {{marcador}} impresso no documento')

console.log('\n3) O valor por extenso está DENTRO do PDF')
// O texto do PDF é comprimido; a prova aqui é o valor em algarismo no título e
// o extenso conferido pelo teste unitário. O que dá para afirmar do arquivo é
// que ele foi gerado a partir do valor certo — e isso a trilha registra.
// Presa ao `entidadeId`: sem isso a leitura pegaria "o último documento emitido
// no banco inteiro", que pode ser de outra ordem — e o teste compararia o valor
// de uma ordem com a trilha de outra.
const trilhaNota = sql(`
  select detalhes::text from audit_logs
   where acao = 'documento.emitido' and "entidadeId" = '${ordemId}'
     and detalhes::text like '%NOTA_PROMISSORIA%'
   order by "criadoEm" desc limit 1`)
const trilhaContrato = sql(`
  select detalhes::text from audit_logs
   where acao = 'documento.emitido' and "entidadeId" = '${ordemId}'
     and detalhes::text like '%CONTRATO_PRESTACAO%'
   order by "criadoEm" desc limit 1`)

trilhaContrato.includes(totalEsperado)
  ? ok(`o contrato saiu pelo TOTAL: ${totalEsperado} centavos`)
  : nao(`contrato: trilha diz ${trilhaContrato}, total é ${totalEsperado}`)
trilhaNota.includes(abertoEsperado)
  ? ok(`a nota saiu pelo SALDO EM ABERTO: ${abertoEsperado} centavos`)
  : nao(`nota: trilha diz ${trilhaNota}, aberto é ${abertoEsperado}`)
Number(abertoEsperado) > 0
  ? ok('e o saldo é maior que zero — a nota não é um título vazio')
  : nao('a nota foi emitida sobre saldo zero')

console.log('\n3b) Ordem QUITADA recusa a nota, mas aceita o contrato')
// Da empresa do Fábio, pelo mesmo motivo de lá em cima: a vizinha tem ordens
// quitadas também, e ele não pode abri-las.
const quitada = sql(`
  select f."ordemId" from faturas f
    join ordens o on o.id = f."ordemId"
   where o."tenantId" = '${tenantDoFabio}'
     and f."valorTotalCentavos" + f."multaCentavos" + f."jurosCentavos" - f."valorPagoCentavos" <= 0
   limit 1`)
if (quitada) {
  await p.goto(`${QA_BASE}/painel/ordens/${quitada}?ver=documentos`, { waitUntil: 'networkidle' })
  await p.waitForTimeout(800)
  await p.getByRole('button', { name: 'Emitir nota promissória' }).click()
  await p.waitForTimeout(2500)
  const recusaNota = await p.locator('p[role=alert]').first().innerText().catch(() => '')
  ;/saldo em aberto/i.test(recusaNota)
    ? ok(`recusou a nota numa ordem quitada: "${recusaNota.slice(0, 60)}"`)
    : nao(`emitiu (ou não explicou) a nota numa ordem quitada: "${recusaNota}"`)

  await p.getByRole('button', { name: 'Emitir contrato' }).click()
  await p.waitForTimeout(3000)
  const contratoQuitada = sql(`
    select count(*) from documentos where "ordemId" = '${quitada}' and tipo::text = 'CONTRATO_PRESTACAO'`)
  contratoQuitada === '1'
    ? ok('e o contrato saiu na mesma ordem — ele vale o total, pago ou não')
    : nao(`contrato em ordem quitada: ${contratoQuitada}`)
} else {
  console.log('  ·  nenhuma fatura quitada no cenário (não é falha)')
}

console.log('\n4) Quem NÃO pode emitir não vê o botão nem consegue pela ação')
const t = await entrar('rafael@dtechmed.com.br')  // técnico

// A conferência vai ATÉ A ABA, e não para na ficha.
//
// Depois de a emissão virar aba, olhar só a ficha passaria de graça: o botão
// não está lá para ninguém. Isso teria trocado uma trava de permissão por um
// detalhe de layout, e o roteiro continuaria verde sem provar nada.
//
// O técnico ALCANÇA a aba de propósito — ele precisa ver o contrato que o
// cliente assinou. O que ele não tem é o botão de emitir, e é isso que se
// confere: a aba abre, os documentos aparecem, e o botão não existe.
await t.goto(`${QA_BASE}/painel/ordens/${ordemId}?ver=documentos`, { waitUntil: 'networkidle' })
await t.waitForTimeout(800)
;(await t.getByRole('button', { name: 'Emitir contrato' }).count()) === 0
  ? ok('o técnico abre a aba de documentos e NÃO vê o botão de emitir')
  : nao('o técnico vê o botão de emitir dentro da aba')
const explica = await t.locator('body').innerText()
;/quem responde pelo dinheiro/i.test(explica)
  ? ok('e a tela diz por que ele não vê, em vez de só faltar botão')
  : nao('o técnico não recebe explicação nenhuma do botão ausente')

console.log('\n5) Ordem SEM valor aprovado é recusada com frase legível')
const semValor = sql(`
  select o.id from ordens o
   where o."tenantId" = '${tenantDoFabio}'
     and not exists (select 1 from orcamentos q where q."ordemId" = o.id and q.status::text = 'APROVADO')
     and not exists (select 1 from faturas f where f."ordemId" = o.id)
   limit 1`)
if (semValor) {
  await p.goto(`${QA_BASE}/painel/ordens/${semValor}?ver=documentos`, { waitUntil: 'networkidle' })
  await p.waitForTimeout(800)
  const btn = p.getByRole('button', { name: 'Emitir contrato' })
  if (await btn.count()) {
    await btn.click()
    await p.waitForTimeout(2500)
    const recusa = await p.locator('p[role=alert]').first().innerText().catch(() => '')
    ;/valor aprovado/i.test(recusa)
      ? ok(`recusou e explicou: "${recusa.slice(0, 70)}"`)
      : nao(`aceitou ou não explicou: "${recusa}"`)
  } else nao('o botão não apareceu na ordem sem valor')
} else {
  console.log('  ·  nenhuma ordem sem valor no cenário (não é falha)')
}

console.log('\n6) Os dois temas, em 1440 e 390')
for (const tema of ['escuro', 'claro']) {
  await p.evaluate((x) => { document.cookie = `dtechmed_tema=${x}; path=/; max-age=31536000` }, tema)
  for (const larg of [1440, 390]) {
    await p.setViewportSize({ width: larg, height: 900 })
    // As DUAS abas, e não só a ficha: a de documentos tem grade de duas
    // colunas, que é justamente o que estoura em 390px quando alguém esquece
    // do celular.
    for (const onde of ['', '?ver=documentos']) {
      await p.goto(`${QA_BASE}/painel/ordens/${ordemId}${onde}`, { waitUntil: 'networkidle' })
      await p.waitForTimeout(600)
      const rola = await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)
      if (rola) nao(`${tema}/${larg}px${onde ? ' · aba documentos' : ' · ficha'}: rola de lado`)
    }
  }
  ok(`${tema}: as duas abas cabem em 1440 e 390`)
}

erros.length ? nao(`erro de JavaScript: ${erros[0].slice(0, 130)}`) : ok('nenhum erro de JavaScript')
await nav.close()
console.log(`\n${ruins === 0 ? '✅ tudo passou' : `❌ ${ruins} problema(s)`}\n`)
process.exit(ruins ? 1 : 0)
