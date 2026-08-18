import { NextResponse } from 'next/server'
import { Papel } from '@/generated/prisma/enums'
import { montarCsv, type ColunaCsv } from '@/lib/csv'
import { comEscopo } from '@/lib/db'
import { auditar } from '@/server/auth/guarda'
import { contextoDe, lerSessao } from '@/server/auth/sessao'
import { hoje } from '@/lib/datas'

/**
 * Exporta a carteira de clientes em CSV.
 *
 * ---------------------------------------------------------------------------
 * POR QUE ISTO NÃO É UMA TELA, E SIM UMA ROTA
 * ---------------------------------------------------------------------------
 * Baixar arquivo é o navegador pedindo um endereço e recebendo bytes com o
 * cabeçalho certo. Fazer isso por ação de servidor exigiria montar o arquivo na
 * memória do navegador — e uma carteira de mil clientes viraria uma string
 * gigante trafegando dentro da resposta do React.
 *
 * ---------------------------------------------------------------------------
 * QUEM PODE, E POR QUE ISSO IMPORTA AQUI MAIS QUE EM OUTRAS TELAS
 * ---------------------------------------------------------------------------
 * Esta rota entrega, num arquivo só, o nome, o CPF/CNPJ, o telefone e o
 * endereço de toda a carteira. É o dado mais sensível do sistema, e o mais
 * fácil de levar embora — um arquivo cabe num e-mail.
 *
 * Três travas: papel de confiança (nem técnico nem motorista exportam),
 * escopo da empresa aplicado pelo banco, e REGISTRO na trilha de auditoria com
 * quantas linhas saíram. A terceira não impede nada; ela existe para que, se um
 * dia a carteira aparecer na mão de um concorrente, exista de onde partir.
 */

const PODE_EXPORTAR: Papel[] = [Papel.SUPER_ADMIN, Papel.ADMIN_EMPRESA, Papel.GESTOR, Papel.ATENDENTE]

type LinhaCliente = {
  nome: string
  razaoSocial: string | null
  tipo: string
  documento: string
  email: string | null
  whatsapp: string | null
  telefone: string | null
  contatoNome: string | null
  cep: string | null
  logradouro: string | null
  numero: string | null
  complemento: string | null
  bairro: string | null
  cidade: string | null
  uf: string | null
  pontoReferencia: string | null
  observacoes: string | null
  ativo: boolean
  criadoEm: Date
}

/**
 * Os títulos são os MESMOS que a importação reconhece.
 *
 * É o que faz o caminho de volta funcionar: exportar, abrir no Excel, corrigir
 * cinquenta telefones, subir de novo. Se os títulos divergissem, o arquivo que
 * o próprio sistema gerou seria recusado por ele — e não há defeito que irrite
 * mais.
 */
const COLUNAS: ReadonlyArray<ColunaCsv<LinhaCliente>> = [
  { chave: 'nome', titulo: 'Nome', valor: (c) => c.nome },
  { chave: 'razao_social', titulo: 'Razão social', valor: (c) => c.razaoSocial },
  { chave: 'tipo', titulo: 'Tipo', valor: (c) => c.tipo },
  { chave: 'documento', titulo: 'Documento', valor: (c) => c.documento },
  { chave: 'email', titulo: 'E-mail', valor: (c) => c.email },
  { chave: 'whatsapp', titulo: 'WhatsApp', valor: (c) => c.whatsapp },
  { chave: 'telefone', titulo: 'Telefone', valor: (c) => c.telefone },
  { chave: 'contato', titulo: 'Contato', valor: (c) => c.contatoNome },
  { chave: 'cep', titulo: 'CEP', valor: (c) => c.cep },
  { chave: 'logradouro', titulo: 'Logradouro', valor: (c) => c.logradouro },
  { chave: 'numero', titulo: 'Número', valor: (c) => c.numero },
  { chave: 'complemento', titulo: 'Complemento', valor: (c) => c.complemento },
  { chave: 'bairro', titulo: 'Bairro', valor: (c) => c.bairro },
  { chave: 'cidade', titulo: 'Cidade', valor: (c) => c.cidade },
  { chave: 'uf', titulo: 'UF', valor: (c) => c.uf },
  { chave: 'referencia', titulo: 'Ponto de referência', valor: (c) => c.pontoReferencia },
  { chave: 'observacoes', titulo: 'Observações', valor: (c) => c.observacoes },
  { chave: 'ativo', titulo: 'Ativo', valor: (c) => (c.ativo ? 'sim' : 'nao') },
  {
    chave: 'cadastrado_em',
    titulo: 'Cadastrado em',
    valor: (c) => c.criadoEm.toLocaleDateString('pt-BR'),
  },
]

export async function GET() {
  const sessao = await lerSessao()
  if (!sessao) return new NextResponse('Não autenticado', { status: 401 })
  if (!PODE_EXPORTAR.includes(sessao.papel)) {
    return new NextResponse('Seu perfil não exporta a carteira de clientes.', { status: 403 })
  }

  const ctx = contextoDe(sessao)
  const clientes = await comEscopo(ctx, (tx) =>
    tx.cliente.findMany({
      orderBy: { nome: 'asc' },
      select: {
        nome: true, razaoSocial: true, tipo: true, documento: true,
        email: true, whatsapp: true, telefone: true, contatoNome: true,
        cep: true, logradouro: true, numero: true, complemento: true,
        bairro: true, cidade: true, uf: true, pontoReferencia: true,
        observacoes: true, ativo: true, criadoEm: true,
      },
    }),
  )

  await auditar(ctx, sessao, {
    acao: 'clientes.exportados',
    entidade: 'cliente',
    detalhes: { quantidade: clientes.length },
  })

  const csv = montarCsv(clientes as LinhaCliente[], COLUNAS)
  const data = hoje()

  return new NextResponse(csv, {
    headers: {
      // `charset=utf-8` além da marca de bytes: um reforça o outro, e navegador
      // que ignora um costuma respeitar o outro.
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="clientes-${data}.csv"`,
      // Carteira de clientes não fica guardada em cache de lugar nenhum.
      'cache-control': 'no-store, no-cache, must-revalidate',
    },
  })
}
