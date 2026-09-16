import 'dotenv/config'
import { randomBytes } from 'node:crypto'
import { garantirMoldesPadrao } from '../src/server/documentos/moldes-padrao'
import { Prisma } from '../src/generated/prisma/client'
import { Papel, TipoMovimentoEstoque } from '../src/generated/prisma/enums'
import { hashDocumento, hashSenha } from '../src/lib/cripto'
import { EMPRESA } from '../src/lib/empresa'
import { comEscopo, prisma, type ContextoAcesso } from '../src/lib/db'
import { movimentar } from '../src/server/estoque/servico'

/**
 * Semeadura inicial.
 *
 * Duas partes, com regras diferentes:
 *
 *  • O SUPER ADMIN é criado sempre, e a senha vem de variável de ambiente. Se
 *    ela não vier, geramos uma aleatória e imprimimos UMA vez no terminal.
 *    Senha padrão em código é como deixar a chave debaixo do tapete: todo
 *    mundo que já viu o repositório sabe onde está.
 *  • Os DADOS DE DEMONSTRAÇÃO só entram com `--demo`. Em produção ninguém quer
 *    a Clínica Bella Pelle no meio da carteira de clientes de verdade.
 *
 * Rodar de novo não duplica nada: tudo é upsert por chave natural.
 */

const SUPER: ContextoAcesso = { tenantId: null, userId: null, ehSuperAdmin: true }
const comDemo = process.argv.includes('--demo')

async function main() {
  console.log('\n— DTECH MED · semeadura —\n')

  const email = (process.env.SEED_SUPERADMIN_EMAIL ?? 'admin@dtechmed.com.br').toLowerCase()
  let senha = process.env.SEED_SUPERADMIN_PASSWORD
  let senhaGerada = false
  if (!senha) {
    senha = randomBytes(12).toString('base64url')
    senhaGerada = true
  }

  const jaExiste = await comEscopo(SUPER, (tx) =>
    tx.user.findFirst({ where: { email, papel: Papel.SUPER_ADMIN } }),
  )

  if (jaExiste) {
    console.log(`Super Admin já existe: ${email} (senha inalterada)`)
  } else {
    await comEscopo(SUPER, async (tx) => {
      await tx.user.create({
        data: {
          tenantId: null,
          nome: 'Super Admin',
          email,
          senhaHash: await hashSenha(senha!),
          papel: Papel.SUPER_ADMIN,
          // Mesmo o dono troca a senha no primeiro acesso: a que aparece no
          // terminal já passou por log, histórico de shell e talvez print.
          trocarSenha: true,
        },
      })
    })
    console.log(`Super Admin criado: ${email}`)
    if (senhaGerada) {
      console.log(`\n  SENHA (aparece só agora, anote):  ${senha}\n`)
    }
  }

  /**
   * A PAPELADA DAS EMPRESAS QUE JÁ EXISTEM.
   *
   * `garantirMoldesPadrao` roda na criação da empresa — resolve daqui para a
   * frente. Mas a DTECH MED de produção foi criada antes dos moldes existirem,
   * e ela não vai ser criada de novo: sem este passo, ela ficaria para sempre
   * sem contrato e sem promissória, e o defeito só apareceria no dia em que um
   * hospital pedisse o contrato.
   *
   * Roda no caminho SEM `--demo` de propósito: é o caminho de produção, e é lá
   * que a empresa antiga está. É idempotente — procura pelo nome e só cria o
   * que falta —, então rodar a semeadura de novo não duplica nem sobrescreve o
   * molde que alguém editou à mão.
   */
  const empresas = await comEscopo(SUPER, (tx) =>
    tx.tenant.findMany({ select: { id: true, nome: true } }),
  )
  for (const e of empresas) {
    const criados = await comEscopo(
      { tenantId: e.id, userId: null, ehSuperAdmin: true },
      (tx) => garantirMoldesPadrao(tx, e.id, 'Semeadura'),
    )
    if (criados) console.log(`  ${e.nome}: ${criados} modelo(s) de documento criado(s).`)
  }

  if (!comDemo) {
    console.log('\nPronto. Para popular dados de exemplo, rode com --demo\n')
    return
  }

  await semearDemo()
}

async function semearDemo() {
  console.log('\nCriando a empresa de demonstração…')

  const t = await comEscopo(SUPER, async (tx) => {
    const existente = await tx.tenant.findUnique({ where: { slug: 'dtechmed-lajeado' } })
    if (existente) return existente
    return tx.tenant.create({
      data: {
        // Estes dados saem no cabeçalho de TODO documento: ordem de retirada,
        // laudo, orçamento, contrato, recibo. Vêm do arquivo único de dados
        // institucionais para não divergirem do que o site publica.
        slug: 'dtechmed-lajeado',
        nome: EMPRESA.nome,
        razaoSocial: EMPRESA.razaoSocial,
        cnpj: EMPRESA.cnpj || null,
        email: EMPRESA.email || null,
        telefone: EMPRESA.whatsapp,
        whatsapp: EMPRESA.whatsapp,
        cep: EMPRESA.endereco.cep.replace(/\D/g, ''),
        logradouro: EMPRESA.endereco.logradouro,
        numero: EMPRESA.endereco.numero,
        bairro: EMPRESA.endereco.bairro,
        cidade: EMPRESA.endereco.cidade,
        uf: EMPRESA.endereco.uf,
      },
    })
  })

  const ctx: ContextoAcesso = { tenantId: t.id, userId: null, ehSuperAdmin: false }
  const senhaDemo = await hashSenha('Dtech@2026')

  const equipe: Array<[Papel, string, string]> = [
    [Papel.ADMIN_EMPRESA, 'Lucas Jesus', 'lucas@dtechmed.com.br'],
    [Papel.GESTOR, 'Camila Rocha', 'camila@dtechmed.com.br'],
    [Papel.ATENDENTE, 'Ana Prado', 'ana@dtechmed.com.br'],
    [Papel.TECNICO, 'Rafael Souza', 'rafael@dtechmed.com.br'],
    [Papel.TECNICO, 'Diego Pereira', 'diego@dtechmed.com.br'],
    [Papel.MOTORISTA, 'Adriano Martins', 'adriano@dtechmed.com.br'],
    [Papel.FINANCEIRO, 'Fábio Lima', 'fabio@dtechmed.com.br'],
  ]

  const usuarios = await comEscopo(ctx, async (tx) => {
    const criados: Record<string, string> = {}
    for (const [papel, nome, mail] of equipe) {
      const u = await tx.user.upsert({
        where: { tenantId_email: { tenantId: t.id, email: mail } },
        create: { tenantId: t.id, nome, email: mail, senhaHash: senhaDemo, papel, trocarSenha: false },
        update: {},
        select: { id: true, papel: true },
      })
      criados[papel + (criados[papel] ? '2' : '')] = u.id
    }
    return criados
  })

  /**
   * --- catálogo de peças ----------------------------------------------------
   *
   * A peça nasce com saldo ZERO e o estoque entra por uma COMPRA registrada.
   *
   * A versão anterior gravava o saldo direto na peça, e isso contradizia o que
   * a própria tela de estoque afirma, em letra impressa no rodapé dela:
   *
   *     "Este é o livro-razão do estoque: o saldo de cada peça é a soma destes
   *      movimentos, nunca um número digitado."
   *
   * Com o saldo digitado, a tela abria com sete peças em prateleira e a lista
   * de movimentos vazia — ou seja, a demonstração provava o contrário da regra
   * que o sistema anuncia. E como o relatório de estoque lê o livro-razão, ele
   * também nascia vazio.
   *
   * As quantidades são lotes de compra, e não unidades soltas: elas precisam
   * cobrir o consumo das ordens do cenário, que agora reservam e consomem de
   * verdade.
   */
  const pecas: Array<[string, string, string, number, number, number, number]> = [
    // sku, nome, categoria, COMPRADO, mínimo, custo, venda
    ['FT-24V10', 'Fonte chaveada 24V 10A', 'Fonte', 24, 2, 50000, 68000],
    ['CP-450220', 'Capacitor eletrolítico 450V 220µF', 'Componente', 60, 6, 2800, 4500],
    ['PT-LV-01', 'Ponteira Lavieen padrão', 'Ponteira', 2, 1, 210000, 289000],
    ['VD-AUT-21', 'Vedação de porta autoclave 21L', 'Vedação', 7, 3, 8900, 14500],
    ['RS-1800', 'Resistência 1800W autoclave', 'Resistência', 1, 3, 12400, 19800],
    ['SN-PR-04', 'Sensor de pressão 0-4 bar', 'Sensor', 5, 2, 16700, 24900],
    ['CB-FR-3P', 'Cabo de força tripolar 2m', 'Cabo', 23, 10, 1900, 3500],
  ]

  const almoxarife = { id: usuarios[Papel.GESTOR] ?? null, nome: 'Camila Rocha' }

  await comEscopo(ctx, async (tx) => {
    for (const [sku, nome, cat, comprado, min, custo, venda] of pecas) {
      const p = await tx.peca.upsert({
        where: { tenantId_sku: { tenantId: t.id, sku } },
        create: {
          tenantId: t.id,
          sku,
          nome,
          categoria: cat,
          saldo: new Prisma.Decimal(0),
          estoqueMinimo: new Prisma.Decimal(min),
          custoMedioCentavos: custo,
          precoVendaCentavos: venda,
        },
        update: {},
        select: { id: true, saldo: true },
      })

      // Idempotente como o resto da semeadura: só lança a compra se a peça
      // acabou de nascer. Rodar de novo não duplica o estoque.
      if (Number(p.saldo) === 0) {
        const r = await movimentar(tx, t.id, almoxarife, {
          pecaId: p.id,
          tipo: TipoMovimentoEstoque.ENTRADA,
          quantidade: comprado,
          custoUnitCentavos: custo,
          motivo: 'Compra inicial de estoque',
          documentoFiscal: `NF-DEMO-${sku}`,
        })
        if (!r.ok) throw new Error(`estoque inicial de ${sku}: ${r.motivo}`)
      }
    }
  })

  // --- clientes e equipamentos --------------------------------------------
  const carteira: Array<[string, string, string, string, string, string, string]> = [
    ['Clínica Bella Pelle', '11444777000161', 'Mariana Farias', '5551980449274', 'Av. Benjamin Constant, 1180', 'Lavieen', 'Duo'],
    ['Odonto São Bento', '22555888000172', 'Paulo Renner', '5551991234567', 'Rua Júlio de Castilhos, 455', 'Cristófoli', 'Vitale 21'],
    ['Espaço Renova Estética', '33666999000183', 'Juliana Corrêa', '5551987654321', 'Rua Borges de Medeiros, 88', 'Medical San', 'CM-4'],
    ['Hospital Bruno Born', '44777000000194', 'Sandra Weber', '5551995551234', 'Av. Benjamin Constant, 1200', 'WEM', 'SS-501'],
  ]

  await comEscopo(ctx, async (tx) => {
    for (const [nome, doc, contato, zap, endereco, marca, modelo] of carteira) {
      const c = await tx.cliente.upsert({
        where: { tenantId_documento: { tenantId: t.id, documento: doc } },
        create: {
          tenantId: t.id,
          tipo: 'PJ',
          nome,
          documento: doc,
          documentoHash: hashDocumento(doc),
          contatoNome: contato,
          whatsapp: zap,
          telefone: zap,
          logradouro: endereco,
          cidade: 'Lajeado',
          uf: 'RS',
        },
        update: {},
      })

      const jaTem = await tx.equipamento.findFirst({
        where: { clienteId: c.id, marca, modelo },
      })
      if (!jaTem) {
        await tx.equipamento.create({
          data: {
            tenantId: t.id,
            clienteId: c.id,
            marca,
            modelo,
            numeroSerie: `${marca.slice(0, 2).toUpperCase()}-${Math.floor(1000 + Math.random() * 8999)}`,
            categoria: marca === 'Cristófoli' ? 'Odontológico' : 'Estético',
            voltagem: '220V',
          },
        })
      }
    }
  })

  /**
   * --- o modelo de ORDEM DE SERVIÇO ----------------------------------------
   *
   * A tela de modelos abria vazia, e o rodapé dela dizia a verdade: sem molde,
   * a emissão cai no texto embutido do sistema — que funciona, mas sai sem o
   * foro, sem o prazo e sem as cláusulas desta empresa.
   *
   * Um molde escrito à mão numa tela morre com o banco. Este nasce com a
   * semeadura, então toda instalação começa com uma O.S. que já pode ir para a
   * mão do cliente.
   *
   * O texto é o que a oficina precisa afirmar por escrito: o que entrou, com
   * que acessórios, o que o cliente relatou, o que o técnico achou, o prazo, o
   * valor e o que acontece com aparelho que ninguém retira. As variáveis entre
   * chaves são trocadas na emissão — e a lista delas é conferida contra
   * `VARIAVEIS`, então um nome inventado aqui quebraria a criação, não o PDF.
   */
  const criados = await comEscopo(ctx, (tx) => garantirMoldesPadrao(tx, t.id, 'Semeadura'))
  if (criados) console.log(`  ${criados} modelo(s) de documento criado(s).`)

  console.log(`
Empresa de demonstração pronta.

  Painel     http://localhost:3000/entrar
  Admin      lucas@dtechmed.com.br
  Gestora    camila@dtechmed.com.br
  Técnico    rafael@dtechmed.com.br
  Motorista  adriano@dtechmed.com.br
  Financeiro fabio@dtechmed.com.br

  Senha de todos:  Dtech@2026

  ${usuarios ? Object.keys(usuarios).length : 0} usuários · ${pecas.length} peças · ${carteira.length} clientes
`)
}

main()
  .catch((e) => {
    console.error('\nSemeadura falhou:', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
