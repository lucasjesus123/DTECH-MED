import 'dotenv/config'
import { randomBytes } from 'node:crypto'
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
  const CORPO_ORDEM_SERVICO = `ORDEM DE SERVIÇO Nº {{os_numero}}

Aberta em {{os_abertura}} · Etapa atual: {{os_etapa}}

1. AS PARTES

PRESTADORA: {{empresa_razao}}, inscrita no CNPJ sob o nº {{empresa_cnpj}}, com
endereço em {{empresa_endereco}}, telefone {{empresa_telefone}}.

CONTRATANTE: {{cliente_nome}}, inscrita no CPF/CNPJ sob o nº {{cliente_documento}},
com endereço em {{cliente_endereco}}. Contato: {{cliente_contato}} — {{cliente_telefone}}.

2. O EQUIPAMENTO RECEBIDO

Marca {{equipamento_marca}} · Modelo {{equipamento_modelo}} · Série {{equipamento_serie}}
Acessórios recebidos junto: {{equipamento_acessorios}}

O equipamento foi recebido nas condições registradas nas fotos de entrada desta
O.S. A lista de acessórios acima é a que foi conferida na retirada, e é por ela
que a devolução será conferida.

3. O QUE O CLIENTE RELATOU

{{os_defeito}}

4. O QUE O TÉCNICO ENCONTROU

{{os_diagnostico}}

Responsável técnico: {{os_tecnico}}

5. PRAZO

Prazo previsto para conclusão: {{os_prazo}}.

O prazo corre a partir da aprovação do orçamento pelo CONTRATANTE, e fica
suspenso enquanto o serviço depender de peça em falta no mercado ou de
resposta do CONTRATANTE. Qualquer mudança de prazo é comunicada pelo mesmo
canal em que esta O.S. foi enviada.

6. VALOR E PAGAMENTO

Valor total dos serviços: {{valor_total}} ({{valor_extenso}}).
Saldo em aberto nesta data: {{valor_aberto}}.
Forma de pagamento: {{forma_pagamento}}.

Serviço não aprovado pelo CONTRATANTE tem devolução do aparelho no estado em
que entrou, sem cobrança de mão de obra, ressalvado o custo de avaliação
quando tiver sido combinado por escrito na abertura desta O.S.

7. GARANTIA

O serviço executado e as peças aplicadas têm garantia de 90 (noventa) dias,
contados da data de entrega, conforme o art. 26 do Código de Defesa do
Consumidor. A garantia cobre o que foi consertado e descrito nesta O.S. —
não cobre defeito novo, mau uso, queda, oscilação da rede elétrica, violação
do lacre nem intervenção de terceiros.

8. RETIRADA DO EQUIPAMENTO

O equipamento fica à disposição para retirada a partir do aviso de conclusão.
Passados 90 (noventa) dias do aviso sem retirada, incide diária de armazenagem,
e o aparelho poderá ser destinado na forma do art. 1.275 do Código Civil, sempre
mediante notificação prévia do CONTRATANTE.

9. FORO

Fica eleito o foro de {{cidade_foro}} para dirimir as questões oriundas deste
documento.

{{cidade_foro}}, {{hoje_extenso}}.


_______________________________        _______________________________
{{empresa_nome}}                       {{cliente_nome}}
Prestadora                             Contratante
`

  await comEscopo(ctx, async (tx) => {
    const ja = await tx.modeloDocumento.findFirst({
      where: { tipo: 'ORDEM_SERVICO', nome: 'Ordem de serviço — padrão DTECH MED' },
      select: { id: true },
    })
    if (ja) return
    await tx.modeloDocumento.create({
      data: {
        tenantId: t.id,
        nome: 'Ordem de serviço — padrão DTECH MED',
        tipo: 'ORDEM_SERVICO',
        descricao:
          'O documento completo da O.S.: equipamento e acessórios conferidos, relato do cliente, laudo do técnico, prazo, valor, garantia de 90 dias e a regra de aparelho não retirado.',
        corpo: CORPO_ORDEM_SERVICO,
        padrao: true,
        autorNome: 'Semeadura',
      },
    })
  })

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
