import 'dotenv/config'
import { rm } from 'node:fs/promises'
import path from 'node:path'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'
import { comEscopo, prisma, type ContextoAcesso } from '../src/lib/db'
import { conferirSenha } from '../src/lib/cripto'
import { env } from '../src/lib/env'

/**
 * Apaga os dados FICTÍCIOS, e só eles.
 *
 * ---------------------------------------------------------------------------
 * POR QUE ESTE SCRIPT PRECISA EXISTIR ANTES DO PRIMEIRO CLIENTE REAL
 * ---------------------------------------------------------------------------
 * O cenário de demonstração não é enfeite de tela: ele atravessou o motor de
 * verdade. Cada ordem falsa tem linha do tempo encadeada, orçamento assinado,
 * fatura quitada, foto no disco — e, o que mais importa aqui, ENFILEIROU AVISOS
 * DE WHATSAPP.
 *
 * Esses avisos estão parados só porque o `UAZAPI_ADMIN_TOKEN` está vazio. No
 * dia em que ele for preenchido, o worker vai encontrar dezenas de jobs
 * PENDENTE e disparar todos — para os telefones do cenário, que têm cara de
 * número real de Lajeado. Alguém que nunca ouviu falar da DTECH MED receberia
 * "seu equipamento está pronto".
 *
 * Por isso a ordem certa é: LIMPAR PRIMEIRO, configurar o WhatsApp depois.
 *
 * ---------------------------------------------------------------------------
 * COMO ELE SABE O QUE É FALSO
 * ---------------------------------------------------------------------------
 * Não sabe por adivinhação, e não apaga "tudo da empresa". Os dados de
 * demonstração nascem de dois scripts com valores FIXOS, escritos no
 * repositório, e é por eles que o script ancora:
 *
 *   • quatro clientes, pelos CNPJ do `prisma/seed.ts`
 *   • as peças, pelos SKU do mesmo arquivo
 *   • as ordens, por pertencerem àqueles quatro clientes
 *
 * O que não casa com essas âncoras NÃO é tocado. Uma ordem que você tenha
 * aberto para um cliente de verdade sobrevive, e o script prova isso listando
 * o que vai ficar — não só o que vai sair.
 *
 * ---------------------------------------------------------------------------
 * COMO ELE SE RECUSA A ERRAR
 * ---------------------------------------------------------------------------
 * Sem argumento, ele NÃO APAGA NADA: só conta e mostra. Apagar exige `--apagar`
 * digitado à mão. É a diferença entre um relatório e uma perda de dados, e ela
 * não pode depender de eu ter lembrado de conferir antes de dar Enter.
 *
 * A equipe fictícia (Camila, Rafael, Ana…) fica de FORA por padrão, mesmo com
 * `--apagar`. Eu não tenho como saber se são pessoas de verdade que já estão
 * usando o sistema ou nomes de exemplo — e apagar o acesso de quem trabalha é
 * pior que deixar um cadastro sobrando. Sai só com `--apagar-equipe`.
 *
 * Uso:
 *   npx tsx scripts/limpar-demo.mts                    # só relatório
 *   npx tsx scripts/limpar-demo.mts --apagar
 *   npx tsx scripts/limpar-demo.mts --apagar --apagar-equipe
 */

/** Os CNPJ do `prisma/seed.ts`. Mudou lá, muda aqui. */
const CLIENTES_DEMO = [
  '11444777000161', // Clínica Bella Pelle
  '22555888000172', // Odonto São Bento
  '33666999000183', // Espaço Renova Estética
  '44777000000194', // Hospital Bruno Born
]

/** Os SKU do catálogo de demonstração. */
const PECAS_DEMO = ['FT-24V10', 'CP-450220', 'PT-LV-01', 'VD-AUT-21', 'RS-1800', 'SN-PR-04', 'CB-FR-3P']

/**
 * A senha que o `prisma/seed.ts` grava em TODA a equipe de demonstração, e que
 * está escrita no repositório. Aqui ela serve para uma pergunta só: alguma
 * conta ainda entra com ela?
 */
const SENHA_DE_FABRICA = 'Dtech@2026'

/** A equipe fictícia. Só sai com `--apagar-equipe`. */
const EQUIPE_DEMO = [
  'camila@dtechmed.com.br',
  'ana@dtechmed.com.br',
  'rafael@dtechmed.com.br',
  'diego@dtechmed.com.br',
  'adriano@dtechmed.com.br',
  'fabio@dtechmed.com.br',
]

const APAGAR = process.argv.includes('--apagar')
const APAGAR_EQUIPE = process.argv.includes('--apagar-equipe')

/**
 * ---------------------------------------------------------------------------
 * POR QUE A EXCLUSÃO PRECISA DE OUTRA CONEXÃO
 * ---------------------------------------------------------------------------
 * A primeira versão deste script apagava com o mesmo cliente que a aplicação
 * usa, e o banco recusou:
 *
 *     permission denied for table movimentos_estoque
 *
 * Não é defeito de permissão — é a permissão fazendo o trabalho dela. O papel
 * `dtechmed_app` tem apenas INSERT e SELECT em quatro tabelas:
 *
 *     eventos_ordem       a linha do tempo
 *     assinaturas         o que o cliente assinou
 *     movimentos_estoque  o razão do estoque
 *     audit_logs          a trilha de auditoria
 *
 * São PROVA. Um sistema que pode reescrever a própria linha do tempo não tem
 * linha do tempo — tem um campo de texto que por acaso está em ordem. Por isso
 * a aplicação não apaga nem altera nada disso, nem por engano, nem por bug,
 * nem por alguém mal-intencionado que consiga rodar código dentro dela.
 *
 * Apagar dado de demonstração não é operação de aplicação: é manutenção, do
 * mesmo tipo que rodar migração. Então usa a mesma porta que a migração usa —
 * a `DIRECT_DATABASE_URL`, como `dtechmed_owner`.
 *
 * O carimbo de empresa continua: `dtechmed_owner` também está sob FORCE ROW
 * LEVEL SECURITY, então sem declarar o tenant ele enxerga zero linhas — o que
 * é o comportamento certo, e foi conferido.
 */
const manutencao = new PrismaClient({
  adapter: new PrismaPg({ connectionString: env.DIRECT_DATABASE_URL }),
  log: ['error'],
})

/** `comEscopo`, mas pela porta da manutenção. */
async function comManutencao<T>(
  ctx: ContextoAcesso,
  fn: (tx: Parameters<Parameters<PrismaClient['$transaction']>[0]>[0]) => Promise<T>,
): Promise<T> {
  return manutencao.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.tenant_id', ${ctx.tenantId ?? ''}, true)`
    await tx.$executeRaw`SELECT set_config('app.is_super_admin', ${ctx.ehSuperAdmin ? 'on' : 'off'}, true)`
    await tx.$executeRaw`SELECT set_config('app.user_id', ${ctx.userId ?? ''}, true)`
    return fn(tx)
  })
}

const c = {
  t: (s: string) => `\x1b[1m${s}\x1b[0m`,
  ok: (s: string) => `\x1b[32m${s}\x1b[0m`,
  al: (s: string) => `\x1b[33m${s}\x1b[0m`,
  ru: (s: string) => `\x1b[31m${s}\x1b[0m`,
  fr: (s: string) => `\x1b[90m${s}\x1b[0m`,
}
const titulo = (s: string) => console.log(`\n${c.t(s)}`)
const linha = (rot: string, val: string | number) =>
  console.log(`  ${rot.padEnd(38, '.')} ${val}`)

async function main() {
  const SUPER: ContextoAcesso = { tenantId: null, userId: null, ehSuperAdmin: true }
  const t = await comEscopo(SUPER, (tx) => tx.tenant.findUnique({ where: { slug: 'dtechmed-lajeado' } }))
  if (!t) {
    console.log('\n  Não existe a empresa `dtechmed-lajeado`. Nada a limpar.\n')
    return
  }
  const ctx: ContextoAcesso = { tenantId: t.id, userId: null, ehSuperAdmin: false }

  // =========================================================================
  // 1. O QUE É FALSO
  // =========================================================================
  const clientes = await comEscopo(ctx, (tx) =>
    tx.cliente.findMany({
      where: { documento: { in: CLIENTES_DEMO } },
      select: { id: true, nome: true, whatsapp: true },
    }),
  )
  const idsClientes = clientes.map((x) => x.id)

  const ordens = idsClientes.length
    ? await comEscopo(ctx, (tx) =>
        tx.ordem.findMany({
          where: { clienteId: { in: idsClientes } },
          select: { id: true, numero: true, etapa: true },
          orderBy: { numero: 'asc' },
        }),
      )
    : []
  const idsOrdens = ordens.map((o) => o.id)

  const equipamentos = idsClientes.length
    ? await comEscopo(ctx, (tx) => tx.equipamento.count({ where: { clienteId: { in: idsClientes } } }))
    : 0

  const eventos = idsOrdens.length
    ? await comEscopo(ctx, (tx) => tx.eventoOrdem.count({ where: { ordemId: { in: idsOrdens } } }))
    : 0
  const fotos = idsOrdens.length
    ? await comEscopo(ctx, (tx) => tx.foto.count({ where: { ordemId: { in: idsOrdens } } }))
    : 0
  const assinaturas = idsOrdens.length
    ? await comEscopo(ctx, (tx) => tx.assinatura.count({ where: { ordemId: { in: idsOrdens } } }))
    : 0
  const orcamentos = idsOrdens.length
    ? await comEscopo(ctx, (tx) => tx.orcamento.count({ where: { ordemId: { in: idsOrdens } } }))
    : 0
  const faturas = idsOrdens.length
    ? await comEscopo(ctx, (tx) => tx.fatura.count({ where: { ordemId: { in: idsOrdens } } }))
    : 0
  const agendamentos = idsOrdens.length
    ? await comEscopo(ctx, (tx) => tx.agendamento.count({ where: { ordemId: { in: idsOrdens } } }))
    : 0
  const movimentos = idsOrdens.length
    ? await comEscopo(ctx, (tx) => tx.movimentoEstoque.count({ where: { ordemId: { in: idsOrdens } } }))
    : 0
  const mensagens = idsOrdens.length
    ? await comEscopo(ctx, (tx) => tx.mensagemWhatsapp.count({ where: { ordemId: { in: idsOrdens } } }))
    : 0
  const pecas = await comEscopo(ctx, (tx) => tx.peca.count({ where: { sku: { in: PECAS_DEMO } } }))

  /**
   * A fila é o item mais perigoso, e por isso é contada por status.
   *
   * `outbox_jobs` não tem coluna `ordemId` — o id da ordem viaja dentro do
   * `payload`, em JSON. Daí a consulta crua: é a única forma de perguntar
   * "quais jobs falam destas ordens".
   */
  const jobs = idsOrdens.length
    ? await comEscopo(SUPER, (tx) =>
        tx.$queryRaw<Array<{ tipo: string; status: string; quantos: bigint }>>`
          SELECT tipo, status::text, count(*) AS quantos
          FROM outbox_jobs
          WHERE "tenantId" = ${t.id}
            AND payload->>'ordemId' = ANY(${idsOrdens})
          GROUP BY tipo, status ORDER BY tipo, status`,
      )
    : []
  const jobsPendentes = jobs
    .filter((j) => j.status === 'PENDENTE')
    .reduce((s, j) => s + Number(j.quantos), 0)

  // =========================================================================
  // 2. O QUE NÃO É — e por isso NÃO será tocado
  // =========================================================================
  const outrosClientes = await comEscopo(ctx, (tx) =>
    tx.cliente.count({ where: { documento: { notIn: CLIENTES_DEMO } } }),
  )
  const outrasOrdens = await comEscopo(ctx, (tx) =>
    tx.ordem.count({ where: { clienteId: { notIn: idsClientes.length ? idsClientes : ['-'] } } }),
  )
  const outrasPecas = await comEscopo(ctx, (tx) => tx.peca.count({ where: { sku: { notIn: PECAS_DEMO } } }))
  const equipe = await comEscopo(ctx, (tx) =>
    tx.user.findMany({ where: { email: { in: EQUIPE_DEMO } }, select: { id: true, nome: true, email: true } }),
  )
  const outrosUsuarios = await comEscopo(ctx, (tx) =>
    tx.user.count({ where: { email: { notIn: EQUIPE_DEMO } } }),
  )

  // =========================================================================
  console.log(`\n${c.t('DTECH MED — limpeza dos dados de demonstração')}`)
  console.log(c.fr(`empresa: ${t.nome} (${t.slug})`))

  titulo('SAI — dados de demonstração')
  linha('clientes fictícios', clientes.length)
  for (const cl of clientes) console.log(c.fr(`      ${cl.nome} · ${cl.whatsapp ?? 'sem whatsapp'}`))
  linha('equipamentos deles', equipamentos)
  linha('ordens de serviço', ordens.length)
  if (ordens.length) {
    console.log(c.fr(`      da nº ${ordens[0]!.numero} até a nº ${ordens[ordens.length - 1]!.numero}`))
  }
  linha('eventos da linha do tempo', eventos)
  linha('fotos', fotos)
  linha('assinaturas', assinaturas)
  linha('orçamentos', orcamentos)
  linha('faturas', faturas)
  linha('agendamentos', agendamentos)
  linha('movimentos de estoque', movimentos)
  linha('mensagens de WhatsApp registradas', mensagens)
  linha('peças do catálogo de exemplo', pecas)

  titulo('SAI — a fila de automação')
  if (jobs.length === 0) {
    console.log(c.fr('  nenhum job destas ordens na fila'))
  } else {
    for (const j of jobs) linha(`${j.tipo} · ${j.status}`, Number(j.quantos))
    if (jobsPendentes > 0) {
      console.log(
        `\n  ${c.ru('⚠ ATENÇÃO')} ${jobsPendentes} aviso(s) PENDENTE(S) nesta fila.`,
      )
      console.log(
        c.al('    Eles estão parados só porque o UAZAPI_ADMIN_TOKEN está vazio.'),
      )
      console.log(
        c.al('    Se você configurar o WhatsApp ANTES de limpar, o worker dispara'),
      )
      console.log(
        c.al('    todos eles para os telefones do cenário — que têm cara de número'),
      )
      console.log(c.al('    real. Limpe primeiro, configure o WhatsApp depois.'))
    }
  }

  titulo('FICA — não será tocado')
  linha('clientes de verdade', outrosClientes)
  linha('ordens de outros clientes', outrasOrdens)
  linha('peças fora do catálogo de exemplo', outrasPecas)
  linha('usuários fora da equipe fictícia', outrosUsuarios)
  linha('a empresa, o conteúdo do site e os contadores', 'intactos')

  titulo(APAGAR_EQUIPE ? 'SAI — a equipe fictícia' : 'FICA — a equipe fictícia')
  for (const u of equipe) console.log(c.fr(`      ${u.nome} · ${u.email}`))
  if (!APAGAR_EQUIPE && equipe.length) {
    console.log(
      c.fr('\n  Fora por padrão: não dá para eu saber daqui se são pessoas de'),
    )
    console.log(c.fr('  verdade já usando o sistema. Para tirar: --apagar-equipe'))
  }

  /**
   * A pergunta que ninguém faz, e que sobrevive à limpeza dos dados.
   *
   * A semeadura grava a MESMA senha em todas as contas da equipe, ela está
   * escrita no repositório, e nenhuma delas nasce com `trocarSenha`. Apagar as
   * ordens falsas e deixar sete logins com a senha de fábrica é limpar a
   * vitrine e deixar a porta destrancada.
   *
   * Conferido de VERDADE, com o mesmo `conferirSenha` do login, e não deduzido
   * do cadastro: quem já trocou a senha não é acusado à toa.
   */
  const todos = await comEscopo(ctx, (tx) =>
    tx.user.findMany({ select: { nome: true, email: true, senhaHash: true, trocarSenha: true } }),
  )
  const comSenhaDeFabrica: string[] = []
  for (const u of todos) {
    if (await conferirSenha(u.senhaHash, SENHA_DE_FABRICA)) {
      comSenhaDeFabrica.push(`${u.nome} · ${u.email}${u.trocarSenha ? '' : ' (sem troca obrigatória)'}`)
    }
  }
  if (comSenhaDeFabrica.length) {
    titulo('SENHAS')
    console.log(
      `  ${c.ru('⚠')} ${comSenhaDeFabrica.length} conta(s) ainda entram com a senha de fábrica`,
    )
    for (const l of comSenhaDeFabrica) console.log(c.fr(`      ${l}`))
    console.log(
      c.al('\n    Ela está escrita no repositório. Apagar dado falso e deixar'),
    )
    console.log(c.al('    login aberto é limpar a vitrine e deixar a porta destrancada.'))
    console.log(
      c.al('    Troque no painel, ou apague as contas que não forem de gente'),
    )
    console.log(c.al('    de verdade com --apagar-equipe.'))
  }

  // =========================================================================
  if (!APAGAR) {
    console.log(`\n${c.al('Nada foi apagado.')} Este foi só o relatório.`)
    console.log(`Para apagar de verdade:  ${c.t('npx tsx scripts/limpar-demo.mts --apagar')}\n`)
    return
  }

  // =========================================================================
  // 3. APAGA — na ordem que as chaves estrangeiras exigem
  // =========================================================================
  titulo('Apagando')

  if (idsOrdens.length) {
    // A fila primeiro: é o único que pode causar dano para FORA do sistema.
    const jobsApagados = await comManutencao(SUPER, (tx) =>
      tx.$executeRaw`DELETE FROM outbox_jobs
                     WHERE "tenantId" = ${t.id} AND payload->>'ordemId' = ANY(${idsOrdens})`,
    )
    console.log(`  ${c.ok('✓')} ${jobsApagados} job(s) da fila`)

    await comManutencao(ctx, (tx) => tx.mensagemWhatsapp.deleteMany({ where: { ordemId: { in: idsOrdens } } }))
    console.log(`  ${c.ok('✓')} ${mensagens} mensagem(ns) de WhatsApp`)

    // Movimentos de estoque antes das peças: a relação com `Peca` é Restrict.
    await comManutencao(ctx, (tx) => tx.movimentoEstoque.deleteMany({ where: { ordemId: { in: idsOrdens } } }))
    console.log(`  ${c.ok('✓')} ${movimentos} movimento(s) de estoque`)

    /**
     * As ordens levam junto, por cascata declarada no esquema: eventos, fotos,
     * assinaturas, orçamentos (e seus itens), faturas (e seus pagamentos),
     * agendamentos e documentos. Não é preciso apagar um a um — e apagar à mão
     * o que a cascata já cobre é como o histórico ganha buraco.
     */
    await comManutencao(ctx, (tx) => tx.ordem.deleteMany({ where: { id: { in: idsOrdens } } }))
    console.log(`  ${c.ok('✓')} ${ordens.length} ordem(ns) e tudo que dependia delas`)
  }

  if (idsClientes.length) {
    await comManutencao(ctx, (tx) => tx.equipamento.deleteMany({ where: { clienteId: { in: idsClientes } } }))
    console.log(`  ${c.ok('✓')} ${equipamentos} equipamento(s)`)
    await comManutencao(ctx, (tx) => tx.cliente.deleteMany({ where: { id: { in: idsClientes } } }))
    console.log(`  ${c.ok('✓')} ${clientes.length} cliente(s)`)
  }

  if (pecas > 0) {
    // Sobra movimento de peça sem ordem (ajuste manual, entrada de compra).
    // Ele também segura a peça, então precisa sair antes.
    const idsPecas = await comManutencao(ctx, (tx) =>
      tx.peca.findMany({ where: { sku: { in: PECAS_DEMO } }, select: { id: true } }),
    )
    await comManutencao(ctx, (tx) =>
      tx.movimentoEstoque.deleteMany({ where: { pecaId: { in: idsPecas.map((p) => p.id) } } }),
    )
    await comManutencao(ctx, (tx) => tx.peca.deleteMany({ where: { sku: { in: PECAS_DEMO } } }))
    console.log(`  ${c.ok('✓')} ${pecas} peça(s) do catálogo de exemplo`)
  }

  if (APAGAR_EQUIPE && equipe.length) {
    await comManutencao(ctx, (tx) => tx.user.deleteMany({ where: { email: { in: EQUIPE_DEMO } } }))
    console.log(`  ${c.ok('✓')} ${equipe.length} usuário(s) da equipe fictícia`)
  }

  /**
   * Os arquivos no disco.
   *
   * O storage guarda por `<tenantId>/<ordemId>/`, então apagar a pasta da ordem
   * leva fotos, miniaturas e assinaturas de uma vez. Sem isto, o banco fica
   * limpo e o disco continua com as imagens do cenário ocupando espaço — e
   * ninguém percebe, porque nada mais aponta para elas.
   */
  let pastas = 0
  for (const id of idsOrdens) {
    await rm(path.join(path.resolve(env.STORAGE_LOCAL_PATH), t.id, id), {
      recursive: true,
      force: true,
    })
    pastas++
  }
  if (pastas) console.log(`  ${c.ok('✓')} ${pastas} pasta(s) de arquivos no disco`)

  /**
   * Os contadores voltam para o maior número que SOBROU — não para zero.
   *
   * Zerar é o óbvio, e está errado. O motivo apareceu no ensaio: o cenário
   * ocupou de 1 a 22, uma ordem de verdade tinha nascido como a 23, e zerar o
   * contador faria a próxima nascer como 1 — atrás de uma que já existe. Num
   * sistema onde o número da O.S. é o que o cliente lê no documento, no
   * WhatsApp e na conversa de balcão, duas numerações correndo em sentidos
   * diferentes é confusão permanente.
   *
   * Com nada real no banco, o maior que sobrou é zero e o efeito é o mesmo de
   * zerar — a primeira ordem de verdade nasce como a nº 1, que é o que se quer
   * numa instalação nova.
   */
  const maior = async (tabela: 'ordem' | 'orcamento' | 'fatura'): Promise<number> => {
    const r = await comManutencao(ctx, (tx) =>
      tabela === 'ordem'
        ? tx.ordem.aggregate({ _max: { numero: true } })
        : tabela === 'orcamento'
          ? tx.orcamento.aggregate({ _max: { numero: true } })
          : tx.fatura.aggregate({ _max: { numero: true } }),
    )
    return r._max.numero ?? 0
  }
  for (const chave of ['ordem', 'orcamento', 'fatura'] as const) {
    const ate = await maior(chave)
    await comManutencao(ctx, (tx) =>
      tx.contador.updateMany({ where: { chave }, data: { valor: ate } }),
    )
    console.log(
      `  ${c.ok('✓')} contador de ${chave} em ${ate}` +
        (ate === 0 ? ' — a próxima será a nº 1' : ` — a próxima será a nº ${ate + 1}`),
    )
  }

  // =========================================================================
  // 4. CONFERE — o próprio script não acredita em si mesmo
  // =========================================================================
  titulo('Conferindo')
  const sobrouCliente = await comManutencao(ctx, (tx) =>
    tx.cliente.count({ where: { documento: { in: CLIENTES_DEMO } } }),
  )
  const sobrouOrdem = idsOrdens.length
    ? await comManutencao(ctx, (tx) => tx.ordem.count({ where: { id: { in: idsOrdens } } }))
    : 0
  const sobrouJob = await comManutencao(SUPER, (tx) =>
    tx.$queryRaw<Array<{ n: bigint }>>`
      SELECT count(*) AS n FROM outbox_jobs
      WHERE "tenantId" = ${t.id} AND payload->>'ordemId' = ANY(${idsOrdens.length ? idsOrdens : ['-']})`,
  )
  const ficaramClientes = await comManutencao(ctx, (tx) => tx.cliente.count())
  const ficaramOrdens = await comManutencao(ctx, (tx) => tx.ordem.count())

  let falhou = false
  const conf = (cond: boolean, oQue: string) => {
    console.log(`  ${cond ? c.ok('✓') : c.ru('✗')} ${oQue}`)
    if (!cond) falhou = true
  }
  conf(sobrouCliente === 0, 'nenhum cliente de demonstração restou')
  conf(sobrouOrdem === 0, 'nenhuma ordem de demonstração restou')
  conf(Number(sobrouJob[0]?.n ?? 0) === 0, 'nenhum job de demonstração restou na fila')
  conf(ficaramClientes === outrosClientes, `os ${outrosClientes} cliente(s) de verdade continuam lá`)
  conf(ficaramOrdens === outrasOrdens, `as ${outrasOrdens} ordem(ns) de verdade continuam lá`)

  if (falhou) {
    console.log(`\n${c.ru('A limpeza NÃO fechou.')} Confira antes de usar.\n`)
    process.exitCode = 1
  } else {
    console.log(`\n${c.ok('Limpo.')} O sistema está pronto para o primeiro cliente de verdade.`)
    console.log('Agora sim dá para configurar o UAZAPI_ADMIN_TOKEN com segurança.')

    // Repetido no fim de propósito: é a última linha que fica na tela, e o
    // aviso lá de cima já rolou para longe. Conta com a senha do repositório
    // é a única coisa que sobrevive a esta limpeza inteira.
    const aindaDeFabrica = await comEscopo(ctx, (tx) =>
      tx.user.findMany({ select: { nome: true, email: true, senhaHash: true } }),
    )
    const restam: string[] = []
    for (const u of aindaDeFabrica) {
      if (await conferirSenha(u.senhaHash, SENHA_DE_FABRICA)) restam.push(u.email)
    }
    if (restam.length) {
      console.log(
        `\n${c.ru('Falta uma coisa:')} ${restam.length} conta(s) ainda entram com a senha`,
      )
      console.log(`escrita no repositório — ${restam.join(', ')}.`)
      console.log('Troque a senha delas antes de abrir o sistema para alguém.')
    }
    console.log('')
  }
}

main()
  .catch((e) => {
    console.error('\n  Falhou:', e instanceof Error ? e.message : e, '\n')
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
    await manutencao.$disconnect()
  })
