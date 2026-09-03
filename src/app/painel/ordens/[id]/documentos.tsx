import Link from 'next/link'
import { ROTULO_DOCUMENTO } from '@/server/ordem/maquina-estados'
import EmitirDocumentos from './emitir'
import estilo from '../../painel.module.css'

export type DocumentoNaOrdem = {
  id: string
  tipo: string
  numero: string
  tokenAcesso: string
  geradoEm: string
}

/**
 * A ABA DE CONTRATO E DOCUMENTOS DA O.S.
 *
 * =============================================================================
 * DE ONDE ELA VEIO
 * =============================================================================
 * Isto era um `<p>Documentos</p>` com dois botões debaixo, na coluna LATERAL da
 * ficha, abaixo de Assinaturas — terceira dobra da direita. O dono do sistema
 * foi procurar como emitir um contrato e não achou, e pediu "a aba de emissão
 * de contrato".
 *
 * O pedido está certo por um motivo que vale escrever: emitir documento não é
 * informação SOBRE a ordem, é trabalho SOBRE a ordem. A coluna lateral é onde
 * se LÊ o cliente, o aparelho, a rota; o que a pessoa vem FAZER não pertence
 * a ela. Virou aba.
 *
 * =============================================================================
 * OS DOIS GRUPOS, E POR QUE ELES SÃO SEPARADOS
 * =============================================================================
 * Os documentos desta tela têm duas origens, e confundi-las faz alguém procurar
 * um botão que não existe:
 *
 *   NASCEM SOZINHOS   comprovante de retirada, PDF do orçamento, comprovante
 *                     de entrega. A esteira os gera ao passar pela etapa; não
 *                     há o que apertar, e esperar um botão para eles é esperar
 *                     em vão.
 *   SE PEDEM          contrato de prestação e nota promissória. Alguém decide
 *                     emitir, e é essa decisão que os dois botões daqui tomam.
 *
 * A tela diz qual é qual em vez de deixar a pessoa descobrir pela ausência.
 *
 * =============================================================================
 * O QUE ELA NÃO FAZ, E ISSO É DELIBERADO
 * =============================================================================
 * Ela não deixa digitar valor. O contrato vale o TOTAL do serviço combinado; a
 * promissória vale o SALDO em aberto. Os dois números vêm da fatura — ou do
 * orçamento aprovado, quando ainda não há fatura — e o texto sai do molde
 * cadastrado em "Modelos de documento".
 *
 * É a trava que a primeira versão não tinha: ela conferia um número e imprimia
 * o outro, e numa ordem já quitada saía uma nota promissória de R$ 0,00 com
 * "ZERO REAL" por extenso no meio da folha. Um título sem objeto, assinável.
 */
export default function DocumentosDaOrdem({
  ordemId,
  documentos,
  podeEmitir,
  cliente,
  numeroOS,
}: {
  ordemId: string
  documentos: DocumentoNaOrdem[]
  podeEmitir: boolean
  cliente: string
  numeroOS: string
}) {
  // Os dois que se pedem, separados dos que a esteira gerou. A comparação é
  // pelo TIPO gravado, e não pelo rótulo — rótulo é palavra de tela e muda.
  const PEDIDOS = new Set(['CONTRATO_PRESTACAO', 'NOTA_PROMISSORIA'])
  const emitidos = documentos.filter((d) => PEDIDOS.has(d.tipo))
  const daEsteira = documentos.filter((d) => !PEDIDOS.has(d.tipo))

  return (
    <>
      <div className={estilo.bloco}>
        <p className={estilo.blocoTitulo}>Emitir documento</p>
        <p className={estilo.dica} style={{ marginTop: 'calc(var(--s2) * -1)' }}>
          Para <strong>{cliente}</strong>, na O.S. {numeroOS}.
        </p>

        {podeEmitir ? (
          <>
            {/* `EmitirDocumentos` já escreve que o valor não é digitado e o que
                é a promissória. A primeira versão desta tela repetia as duas
                frases logo abaixo, com outras palavras — dois parágrafos
                dizendo o mesmo, que é como uma tela ensina a não ler nenhum
                dos dois. Sobrou daqui só o que ele NÃO diz: de onde vem o
                texto. */}
            <EmitirDocumentos ordemId={ordemId} />
            <p className={estilo.dica} style={{ marginTop: 'var(--s3)' }}>
              O texto sai do molde cadastrado em{' '}
              <Link href="/painel/documentos">Modelos de documento</Link>. Sem molde, vale o texto
              padrão do sistema.
            </p>
          </>
        ) : (
          /* Sem botão, e com o motivo escrito. Contrato e promissória obrigam o
             CLIENTE — um em contrato, outro em título —, e assinar em nome da
             empresa não é trabalho de bancada nem de balcão. A trava de verdade
             está na ação do servidor; esta frase existe para ninguém procurar
             um botão que o perfil não tem. */
          <p className={estilo.fraco}>
            Emitir contrato e nota promissória é do Financeiro para cima — os dois obrigam o
            cliente, um em contrato e outro em título. Seu perfil vê os documentos, e quem responde
            pelo dinheiro é que os emite.
          </p>
        )}
      </div>

      <div className={estilo.duasColunas}>
        <div className={estilo.bloco}>
          <p className={estilo.blocoTitulo}>Contrato e promissória</p>
          {emitidos.length === 0 ? (
            <p className={estilo.fraco}>
              Nenhum emitido ainda. Estes dois só existem quando alguém decide emitir.
            </p>
          ) : (
            <Lista documentos={emitidos} />
          )}
        </div>

        <div className={estilo.bloco}>
          <p className={estilo.blocoTitulo}>Gerados pela esteira</p>
          {daEsteira.length === 0 ? (
            <p className={estilo.fraco}>
              Nenhum ainda. Comprovante de retirada, PDF do orçamento e comprovante de entrega
              nascem sozinhos quando a ordem passa pela etapa — não há botão para eles.
            </p>
          ) : (
            <Lista documentos={daEsteira} />
          )}
        </div>
      </div>

      <p className={estilo.dica} style={{ marginTop: 'var(--s4)' }}>
        Todo documento gerado guarda um resumo criptográfico do conteúdo. É o que permite provar,
        meses depois, que o PDF que o cliente tem em mãos é o mesmo que saiu daqui.
      </p>
    </>
  )
}

function Lista({ documentos }: { documentos: DocumentoNaOrdem[] }) {
  return (
    <ul className={estilo.docLista}>
      {documentos.map((d) => (
        <li key={d.id}>
          {/* Aba nova: o PDF abre no leitor do navegador, e quem clica quer
              voltar à ordem sem perder o lugar. */}
          <a
            href={`/api/documento/${d.tokenAcesso}`}
            target="_blank"
            rel="noreferrer"
            className={estilo.docLink}
          >
            {ROTULO_DOCUMENTO[d.tipo] ?? d.tipo}
            {/* O número inteiro é longo e carrega o ano e a empresa; na tela
                basta o sequencial, que é como a equipe se refere a ele. */}
            <span className={estilo.fraco}>
              {' '}
              nº {d.numero.split('-').pop()?.replace(/^0+/, '') ?? d.numero}
            </span>
          </a>
          <span className={estilo.fraco}>{d.geradoEm}</span>
        </li>
      ))}
    </ul>
  )
}
