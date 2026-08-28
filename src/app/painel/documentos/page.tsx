import type { Metadata } from 'next'
import Link from 'next/link'
import { Papel } from '@/generated/prisma/enums'
import { exigirPapel, exigirAba, podeVer } from '@/server/auth/guarda'
import {
  ROTULO_TIPO,
  ROTULO_TIPO_UM,
  TIPOS_MODELAVEIS,
  contarPorTipo,
  ehTipoModelavel,
  listarModelos,
  type TipoModelavel,
} from '@/server/consultas/modelos'
import { valoresDeExemplo, variaveisPorGrupo } from '@/lib/variaveis-documento'
import { comEscopo } from '@/lib/db'
import ListaDeModelos from './lista'
import estilo from '../painel.module.css'

export const metadata: Metadata = { title: 'Modelos de documento', robots: { index: false } }
export const dynamic = 'force-dynamic'

/**
 * OS GERADORES DE DOCUMENTO.
 *
 * =============================================================================
 * POR QUE ESTA TELA EXISTE
 * =============================================================================
 * Contrato de prestação e nota promissória nasceram com o texto escrito DENTRO
 * do código. Funciona para um molde e só um: a cláusula de foro é a de Lajeado,
 * o prazo é o que ficou escrito, e mudar uma vírgula é mexer no sistema.
 *
 * Uma assistência que atende hospital, clínica e órgão público não tem UM
 * contrato — tem o do particular, o do convênio, o que o setor de compras
 * exige. E uma franquia nova terá os dela, com outro foro.
 *
 * =============================================================================
 * TRÊS ABAS, PORQUE SÃO TRÊS DOCUMENTOS QUE SE ESCREVEM
 * =============================================================================
 * O sistema emite dez tipos, mas oito NASCEM DA ESTEIRA: o comprovante de
 * retirada sai quando o motorista colhe a assinatura, o recibo sai quando a
 * fatura é quitada. Ninguém escreve o texto deles.
 *
 * Estes três se escrevem — e por responderem à mesma pergunta ("qual texto sai
 * quando eu emitir?") são abas, não três itens de menu.
 *
 * =============================================================================
 * ONDE ELA MORA
 * =============================================================================
 * Retaguarda, ao lado de Preventiva e WhatsApp. Não é trabalho do dia: é
 * ajuste que se faz uma vez e se revisita quando a regra do negócio muda.
 */
export default async function Documentos({
  searchParams,
}: {
  searchParams: Promise<{ aba?: string }>
}) {
  // Ver os moldes vai até o FINANCEIRO — quem emite precisa poder conferir com
  // que texto vai sair. Editar é mais restrito, e quem decide é `podeMexer`
  // abaixo: o molde de contrato é o que a empresa promete e cobra.
  const { ctx, sessao } = await exigirPapel(
    Papel.ADMIN_EMPRESA,
    Papel.GESTOR,
    Papel.FINANCEIRO,
  )
  await exigirAba('documentos')

  const q = await searchParams
  const aba: TipoModelavel = ehTipoModelavel(q.aba ?? '') ? (q.aba as TipoModelavel) : 'CONTRATO_PRESTACAO'
  const podeMexer = podeVer(sessao.papel, Papel.GESTOR)

  const [modelos, contagem, emitidos] = await Promise.all([
    listarModelos(ctx, aba),
    contarPorTipo(ctx),
    // Os documentos JÁ EMITIDOS, para a tela não ser só configuração: quem abre
    // aqui muitas vezes quer conferir o que saiu, não mudar o molde.
    comEscopo(ctx, (tx) =>
      tx.documento.findMany({
        orderBy: { geradoEm: 'desc' },
        take: 15,
        select: {
          id: true,
          tipo: true,
          geradoEm: true,
          ordem: { select: { id: true, numero: true, cliente: { select: { nome: true } } } },
        },
      }),
    ),
  ])

  // O corpo inteiro só do tipo aberto: a lista mostra o tamanho, e o editor
  // precisa do texto. Carregar o corpo dos três tipos encheria a resposta com
  // texto que ninguém vai abrir.
  const comCorpo = await comEscopo(ctx, (tx) =>
    tx.modeloDocumento.findMany({ where: { tipo: aba }, select: { id: true, corpo: true } }),
  )
  const corpoDe = new Map(comCorpo.map((m) => [m.id, m.corpo]))

  const grupos = variaveisPorGrupo()
  const exemplos = valoresDeExemplo()

  return (
    <>
      <div className={estilo.cab}>
        <div>
          <p className={estilo.grav}>Retaguarda</p>
          <h1 className={estilo.titulo}>Modelos de documento</h1>
          <p className={estilo.texto} style={{ marginTop: 'var(--s2)' }}>
            O texto que sai quando você emite um contrato, uma promissória ou uma O.S. Escreva
            quantos modelos quiser e marque qual é o padrão de cada tipo.
          </p>
        </div>
      </div>

      <div className={estilo.rotaBarra}>
        <nav className={estilo.abas} aria-label="Tipos de documento">
          {TIPOS_MODELAVEIS.map((t) => (
            <Link
              key={t}
              href={`/painel/documentos?aba=${t}`}
              className={aba === t ? `${estilo.aba} ${estilo.abaAtiva}` : estilo.aba}
              aria-current={aba === t ? 'page' : undefined}
            >
              {ROTULO_TIPO[t]}
              {contagem[t] ? ` (${contagem[t]})` : ''}
            </Link>
          ))}
        </nav>
      </div>

      <ListaDeModelos
        tipo={aba}
        rotuloTipo={ROTULO_TIPO[aba]}
        rotuloUm={ROTULO_TIPO_UM[aba]}
        modelos={modelos.map((m) => ({ ...m, corpo: corpoDe.get(m.id) ?? '' }))}
        grupos={grupos}
        exemplos={exemplos}
        podeMexer={podeMexer}
      />

      {/* ---- o que já saiu ---- */}
      <div className={estilo.bloco} style={{ marginTop: 'var(--s6)' }}>
        <p className={estilo.blocoTitulo}>Documentos emitidos</p>
        {emitidos.length === 0 ? (
          <p className={estilo.dica}>Nada emitido ainda.</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 'var(--s2)' }}>
            {emitidos.map((d) => (
              <li key={d.id} className={estilo.linhaSimples}>
                <Link href={`/painel/ordens/${d.ordem.id}`}>
                  #{String(d.ordem.numero).padStart(4, '0')}
                </Link>
                <span>{d.ordem.cliente.nome}</span>
                <span className={estilo.dica}>{d.tipo.replaceAll('_', ' ').toLowerCase()}</span>
                <span className={estilo.dica}>
                  {d.geradoEm.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  )
}
