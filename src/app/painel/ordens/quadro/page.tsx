import Link from 'next/link'
import type { Metadata } from 'next'
import { Papel } from '@/generated/prisma/enums'
import { exigirAba, exigirSessao, podeVer } from '@/server/auth/guarda'
import { montarQuadro } from '@/server/consultas/quadro'
import { proximosPassos } from '@/server/ordem/maquina-estados'
import AbasDaOS from '../../os-abas'
import Quadro, { type Coluna } from './quadro'
import Comecar from './comecar'
import estilo from '../../painel.module.css'

export const metadata: Metadata = { title: 'Quadro da O.S.', robots: { index: false } }
export const dynamic = 'force-dynamic'

/**
 * O QUADRO — a esteira desenhada com as palavras da casa.
 *
 * =============================================================================
 * O QUE É EDITÁVEL, E O QUE NUNCA SERÁ
 * =============================================================================
 * As 18 etapas não viram cadastro, e vale repetir onde a tela mora: cada evento
 * da linha do tempo carrega o resumo criptográfico do anterior, e a ficha
 * confere a corrente inteira ao abrir. É isso que faz o prontuário dizer
 * "histórico íntegro" e ter valor de prova. Uma lista de etapas editável quebra
 * a corrente no dia em que alguém renomear uma etapa já gravada em mil eventos.
 *
 * O que a empresa desenha são as COLUNAS: quais existem, com que nome, e quais
 * etapas cada uma agrupa. É a leitura do processo, com as palavras da casa —
 * "Comp. peças", "Aprovação", "S/ reparo".
 *
 * =============================================================================
 * OS PASSOS SÃO CALCULADOS AQUI, NO SERVIDOR, POR CARTÃO
 * =============================================================================
 * `proximosPassos(etapa, papel)` é a mesma função que a ficha usa. Calcular no
 * cliente exigiria mandar a tabela de transições inteira para o navegador — e
 * junto com ela a lista de quem pode o quê, que é justamente o que não se
 * publica.
 *
 * O destino de cada passo é traduzido em nome de COLUNA aqui também: quem move
 * o cartão quer saber para onde ele vai no quadro, não o nome interno da etapa.
 */
export default async function QuadroDaOS() {
  const { ctx, sessao } = await exigirSessao()
  await exigirAba('ordens')

  const colunas = await montarQuadro(ctx)
  const podeDesenhar = podeVer(sessao.papel, Papel.GESTOR)

  // De qual coluna é cada etapa — para dizer ao cartão para onde ele vai.
  const colunaDaEtapa = new Map<string, string>()
  for (const c of colunas) for (const e of c.etapas) colunaDaEtapa.set(e, c.nome)

  const paraTela: Coluna[] = colunas.map((c) => ({
    id: c.id,
    nome: c.nome,
    cor: c.cor,
    orfa: c.orfa,
    cartoes: c.cartoes.map((k) => ({
      id: k.id,
      numero: k.numero,
      etapaRotulo: k.etapaRotulo,
      cliente: k.cliente,
      equipamento: k.equipamento,
      tecnico: k.tecnico,
      prioridade: k.prioridade,
      atrasada: k.atrasada,
      diasNaEtapa: k.diasNaEtapa,
      passos: proximosPassos(k.etapa, sessao.papel).map((p) => ({
        para: p.para,
        titulo: p.titulo,
        colunaDestino: colunaDaEtapa.get(p.para) ?? null,
      })),
    })),
  }))

  /**
   * "VAZIO" É NÃO TER COLUNA CONFIGURADA — e a primeira versão errou isto.
   *
   * Eu escrevi `colunas.length === 0`, e a tela nunca chegava lá: `montarQuadro`
   * ACRESCENTA a coluna de resgate quando há etapa órfã, então uma empresa sem
   * nenhuma coluna configurada e com ordens abertas recebia comprimento 1. O
   * convite para montar o quadro nunca aparecia, e a pessoa ficava olhando uma
   * coluna só, chamada "Fora do quadro", sem entender que faltava configurar.
   *
   * A pergunta certa é sobre as colunas DELA, e a de resgate não é dela.
   */
  const configuradas = colunas.filter((c) => !c.orfa)
  const vazio = configuradas.length === 0

  return (
    <>
      <div className={estilo.cab}>
        <div>
          <p className={estilo.grav}>Central</p>
          <h1 className={estilo.titulo}>O.S.</h1>
        </div>
        {podeDesenhar && !vazio ? (
          <Link className={estilo.btnSec} href="/painel/ordens/quadro/colunas">
            Desenhar as colunas
          </Link>
        ) : null}
      </div>

      <AbasDaOS atual="quadro" papel={sessao.papel} telas={sessao.telas} />

      {/* O convite vem ANTES do quadro, e o quadro continua embaixo.
          Esconder as ordens enquanto não há coluna seria trocar um problema de
          configuração por um sumiço de trabalho — a pessoa abriria a tela e não
          veria as 23 ordens que tem. Elas ficam lá, na coluna de resgate, e o
          convite explica o que falta. */}
      {vazio ? (
        <Comecar podeDesenhar={podeDesenhar} />
      ) : (
        <p className={estilo.dica} style={{ marginBottom: 'var(--s3)' }}>
          As colunas são suas — o nome e as etapas que cada uma agrupa. Mover o cartão anda a
          esteira de verdade, com a mesma trava de perfil e o mesmo registro na trilha.
        </p>
      )}

      {paraTela.length > 0 ? <Quadro colunas={paraTela} podeDesenhar={podeDesenhar} /> : null}
    </>
  )
}
