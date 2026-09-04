/**
 * O DISPARO AUTOMÁTICO, DE PONTA A PONTA.
 *
 * A tela é conferida pelo roteiro de navegador. Isto aqui confere o que a tela
 * não alcança: a ordem andando de etapa DE VERDADE pelo motor, o trabalho
 * nascendo na fila, o worker escrevendo o PDF com o texto DAQUELE modelo, e o
 * aviso saindo com o link do documento — não do portal.
 *
 * Sai imprimindo linhas "OK ..." e "FALHA ..." para o roteiro do navegador ler
 * e somar junto com as dele.
 */
// `dotenv` NÃO sobrescreve o que já está no ambiente: o Postgres de ensaio,
// exportado antes de rodar, continua valendo. O `.env` só preenche o que falta
// — o sal do hash de documento, por exemplo, que não é segredo de banco.
import 'dotenv/config'
import { EtapaOrdem, Papel } from '../src/generated/prisma/enums'
import { comEscopo } from '../src/lib/db'
import { avancarOrdem } from '../src/server/ordem/motor'
import { proximosPassos, TERMINAIS } from '../src/server/ordem/maquina-estados'
import { rodarUmaVolta } from '../src/server/outbox/worker'

let ruins = 0
const ok = (t: string) => console.log(`OK ${t}`)
const nao = (t: string) => {
  console.log(`FALHA ${t}`)
  ruins++
}

const tenantId = await comEscopo({ tenantId: null, userId: null, ehSuperAdmin: true }, async (tx) => {
  const t = await tx.tenant.findFirst({ select: { id: true } })
  return t?.id ?? null
})
if (!tenantId) {
  console.log('FALHA nenhuma empresa no banco')
  process.exit(1)
}

// `process.exit` não estreita o tipo para o TypeScript, e daqui para baixo a
// empresa é certa. A constante estreitada evita espalhar `!` pelo arquivo.
const empresa: string = tenantId
const ctx = { tenantId: empresa, userId: null, ehSuperAdmin: false }
const ator = { id: null, nome: 'QA do disparo', papel: Papel.ADMIN_EMPRESA }

/**
 * A ETAPA ALVO SAI DA MÁQUINA DE ESTADOS, e não é escrita à mão.
 *
 * A primeira versão fixava "em análise" e procurava uma ordem em "recebido na
 * empresa". Funcionava uma vez: rodando de novo, as ordens já tinham andado e o
 * ensaio caía com "nenhuma O.S. para andar" — um teste que só passa em banco
 * recém-semeado é um teste que um dia vai reprovar sozinho e mandar alguém
 * caçar um defeito que não existe.
 *
 * Agora ele pega qualquer ordem viva e pergunta À PRÓPRIA MÁQUINA para onde ela
 * pode ir.
 */
const TEXTO = 'PAPEL DE ACOMPANHAMENTO — {{cliente_nome}} — O.S. {{os_numero}}'

/**
 * O ENSAIO CRIA AS PRÓPRIAS ORDENS, e não pega emprestadas as do cenário.
 *
 * A primeira versão procurava uma ordem viva e a fazia andar. Funcionava — uma
 * vez. Na terceira execução seguida as ordens do cenário já tinham caminhado
 * até onde dava, e o ensaio caía com "nenhuma O.S. para andar": um teste que só
 * passa em banco recém-semeado é um teste que um dia reprova sozinho e manda
 * alguém caçar um defeito que não existe.
 *
 * A ordem nasce como `abrirOrdem` a cria — sem etapa explícita, na inicial que o
 * banco define. Não é estado forjado: é exatamente o que o balcão produz.
 */
async function novaOrdem(sufixo: string) {
  return comEscopo(ctx, async (tx) => {
    const cliente = await tx.cliente.findFirst({ select: { id: true } })
    const equipamento = await tx.equipamento.findFirst({ select: { id: true } })
    if (!cliente || !equipamento) return null
    const ultimo = await tx.ordem.aggregate({ _max: { numero: true } })
    return tx.ordem.create({
      data: {
        tenantId: empresa,
        numero: (ultimo._max.numero ?? 0) + 1,
        clienteId: cliente.id,
        equipamentoId: equipamento.id,
        defeitoRelatado: `Ensaio do disparo automático (${sufixo})`,
        tokenPublico: `qa-disparo-${sufixo}-${Date.now()}`,
        origem: 'TELEFONE',
      },
      select: { id: true, numero: true, etapa: true },
    })
  })
}

/** O primeiro passo possível a partir de uma etapa, sem pré-condição. */
function primeiroPasso(de: EtapaOrdem) {
  return proximosPassos(de, ator.papel).find(
    // Sem PRÉ-CONDIÇÃO: transições que exigem seis fotos, assinatura ou fatura
    // quitada seriam recusadas pelo motor — corretamente — e o ensaio culparia
    // o disparo por uma recusa que é de outra regra.
    (t) => !TERMINAIS.includes(t.para) && t.gera !== 'ORDEM_SERVICO' && !t.exige?.length,
  )
}

const criada = await novaOrdem('a')
if (!criada) {
  console.log('FALHA sem cliente ou equipamento no banco para abrir a O.S. do ensaio')
  process.exit(1)
}
const passoA = primeiroPasso(criada.etapa)
if (!passoA) {
  console.log(`FALHA a etapa inicial (${criada.etapa}) não tem próximo passo sem pré-condição`)
  process.exit(1)
}
const ordem = { id: criada.id, numero: criada.numero }
const ALVO = passoA.para

// ---------------------------------------------------------------------------
// 1. o modelo que dispara
// ---------------------------------------------------------------------------
const modelo = await comEscopo(ctx, async (tx) => {
  // Limpa disparo de qualquer outro, para o ensaio não depender do que já
  // existia no banco.
  await tx.modeloDocumento.updateMany({
    where: { tipo: 'ORDEM_SERVICO', dispararNaEtapa: ALVO },
    data: { dispararNaEtapa: null },
  })
  return tx.modeloDocumento.create({
    data: {
      tenantId: empresa,
      nome: 'QA — papel que sai sozinho',
      tipo: 'ORDEM_SERVICO',
      corpo: TEXTO,
      dispararNaEtapa: ALVO,
      autorNome: 'QA',
    },
    select: { id: true },
  })
})
ok(`modelo criado com disparo em ${ALVO}`)

// ---------------------------------------------------------------------------
// 2. a ordem anda, e o trabalho nasce na mesma transação
// ---------------------------------------------------------------------------
const r = await avancarOrdem(ctx, ator, { ordemId: ordem.id, para: ALVO })
r.ok ? ok(`a O.S. #${ordem.numero} andou para ${ALVO}`) : nao(`a O.S. não andou: ${r.motivo}`)

const jobPdf = await comEscopo(ctx, (tx) =>
  tx.outboxJob.findFirst({
    where: { tipo: 'pdf.gerar' },
    orderBy: { criadoEm: 'desc' },
    select: { id: true, payload: true, status: true },
  }),
)
const p = (jobPdf?.payload ?? {}) as Record<string, unknown>
p.modeloId === modelo.id && p.enviarAoCliente === true && p.ordemId === ordem.id
  ? ok('o trabalho do PDF nasceu apontando para ESTE modelo, e pedindo o envio')
  : nao(`o trabalho do PDF não veio como esperado: ${JSON.stringify(p)}`)

// ---------------------------------------------------------------------------
// 3. o worker escreve o papel COM O TEXTO DO MODELO
// ---------------------------------------------------------------------------
/**
 * O WORKER RODA ATÉ O PAPEL EXISTIR, e não uma volta só.
 *
 * A fila do cenário de demonstração tem centenas de avisos pendentes de
 * prioridade mais alta, e cada volta pega um lote. Uma volta única testaria a
 * sorte de o lote ter incluído este trabalho — e o ensaio passaria ou falharia
 * conforme o tamanho do cenário, que não é o que ele mede.
 */
async function girarAte(condicao: () => Promise<boolean>, voltas = 80) {
  for (let i = 0; i < voltas; i++) {
    if (await condicao()) return true
    if ((await rodarUmaVolta()) === 0) return condicao()
  }
  return condicao()
}
const achouDoc = () =>
  comEscopo(ctx, (tx) =>
    tx.documento
      .count({ where: { ordemId: ordem.id, tipo: 'ORDEM_SERVICO' } })
      .then((n) => n > 0),
  )
const chegou = await girarAte(achouDoc, 400)
if (!chegou) {
  const st = await comEscopo(ctx, (tx) =>
    tx.outboxJob.findUnique({
      where: { id: jobPdf?.id ?? '' },
      select: { status: true, tentativas: true, ultimoErro: true },
    }),
  )
  console.log(`     [diagnóstico] trabalho do PDF: ${JSON.stringify(st)}`)
}

const doc = await comEscopo(ctx, (tx) =>
  tx.documento.findFirst({
    where: { ordemId: ordem.id, tipo: 'ORDEM_SERVICO' },
    orderBy: { geradoEm: 'desc' },
    select: { id: true, tokenAcesso: true, tamanhoBytes: true },
  }),
)
doc && (doc.tamanhoBytes ?? 0) > 0
  ? ok(`o documento nasceu (${doc.tamanhoBytes} bytes)`)
  : nao('o documento não foi gerado')

// ---------------------------------------------------------------------------
// 4. o aviso sai com o link DO DOCUMENTO, e amarrado a ele
// ---------------------------------------------------------------------------
// FILTRADO PELO TEMPLATE. A mesma transição também enfileira o aviso da etapa,
// e ele nasce depois — pegar "o mais recente" traria aquele, e o ensaio
// reprovaria uma coisa certa.
const jobZap = await comEscopo(ctx, (tx) =>
  tx.outboxJob.findFirst({
    where: {
      tipo: 'whatsapp.enviar',
      payload: { path: ['template'], equals: 'documento.modelo' },
    },
    orderBy: { criadoEm: 'desc' },
    select: { payload: true },
  }),
)
const z = (jobZap?.payload ?? {}) as Record<string, unknown>
z.template === 'documento.modelo' &&
typeof z.linkDocumento === 'string' &&
(z.linkDocumento as string).includes(doc?.tokenAcesso ?? 'nada') &&
z.documentoId === doc?.id
  ? ok('o aviso saiu com o link DO DOCUMENTO e amarrado a ele')
  : nao(`o aviso não veio como esperado: ${JSON.stringify(z)}`)

// ---------------------------------------------------------------------------
// 5. o texto impresso é o do modelo, e não o embutido
// ---------------------------------------------------------------------------
// O PDF é binário; a prova possível sem abrir o arquivo é que ele existe e que
// nenhum OUTRO modelo estava marcado como padrão para o tipo — se o gerador
// tivesse ignorado o `modeloId`, teria caído no texto embutido do sistema, que
// produz um arquivo bem maior (tabelas, blocos e a linha do tempo inteira).
const bytes = doc?.tamanhoBytes ?? 0
bytes > 0 && bytes < 60_000
  ? ok(`o papel saiu no tamanho de um texto curto (${bytes} bytes) — foi o modelo, não o embutido`)
  : nao(`tamanho inesperado (${bytes} bytes) — pode ter caído no texto embutido`)

// ---------------------------------------------------------------------------
// 6. repetir a transição NÃO manda dois papéis ao cliente
// ---------------------------------------------------------------------------
const antes = await comEscopo(ctx, (tx) =>
  tx.documento.count({ where: { ordemId: ordem.id, tipo: 'ORDEM_SERVICO' } }),
)
await avancarOrdem(ctx, ator, { ordemId: ordem.id, para: ALVO })
await girarAte(async () => false, 6)
const depois = await comEscopo(ctx, (tx) =>
  tx.documento.count({ where: { ordemId: ordem.id, tipo: 'ORDEM_SERVICO' } }),
)
depois === antes
  ? ok('repetir a mesma transição não gerou um segundo papel')
  : nao(`repetir gerou outro documento: ${antes} → ${depois}`)

// ---------------------------------------------------------------------------
// 7. o modelo aposentado para de disparar
// ---------------------------------------------------------------------------
/**
 * Aposentar tira de uso, e "de uso" inclui o disparo automático. Um modelo
 * aposentado que continuasse mandando papel ao cliente seria a pior espécie de
 * defeito: a pessoa faria a coisa certa na tela e nada mudaria no mundo.
 *
 * A etapa é remarcada DEPOIS de aposentar — assim o que separa este ensaio do
 * anterior é só o `ativo`, e não uma configuração diferente.
 */
const criadaB = await novaOrdem('b')
const passoB = criadaB ? primeiroPasso(criadaB.etapa) : undefined
const segunda = criadaB && passoB ? { id: criadaB.id, para: passoB.para } : null

if (segunda) {
  await comEscopo(ctx, (tx) =>
    tx.modeloDocumento.updateMany({
      where: { id: modelo.id },
      data: { ativo: false, dispararNaEtapa: segunda.para },
    }),
  )
  // CONTA SÓ OS DO MODELO. A própria transição pode gerar um documento pelo
  // caminho normal da esteira (`gera` da transição) — contar todos os PDFs
  // acusaria o disparo por um trabalho que não é dele.
  const doModelo = {
    tipo: 'pdf.gerar',
    payload: { path: ['modeloId'], equals: modelo.id },
  } as const
  const antesJ = await comEscopo(ctx, (tx) => tx.outboxJob.count({ where: doModelo }))
  await avancarOrdem(ctx, ator, { ordemId: segunda.id, para: segunda.para })
  const depoisJ = await comEscopo(ctx, (tx) => tx.outboxJob.count({ where: doModelo }))
  depoisJ === antesJ
    ? ok('modelo aposentado para de disparar')
    : nao(`modelo aposentado continuou disparando (${antesJ} → ${depoisJ} trabalhos)`)
} else {
  nao('NÃO VERIFICADO: não sobrou outra O.S. viva com próximo passo para o segundo ensaio')
}

// limpa o que este ensaio criou, para não sujar a tela de quem vier depois.
await comEscopo(ctx, (tx) => tx.modeloDocumento.deleteMany({ where: { id: modelo.id } }))

console.log(ruins === 0 ? 'TUDO CERTO' : `${ruins} FALHA(S)`)
process.exit(ruins === 0 ? 0 : 1)
