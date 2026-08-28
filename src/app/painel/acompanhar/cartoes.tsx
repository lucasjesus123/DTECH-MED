'use client'

import { useState } from 'react'
import { formatarBRL } from '@/lib/dinheiro'
import { Telinha } from './telinha'
import estilo from '../painel.module.css'

export type CartaoOrdem = {
  id: string
  numero: number
  cliente: string
  equipamento: string
  atrasada: boolean
  agora: string
  porcento: number
  desvio: boolean
  cumpridos: number
  total: number
  valorCentavos: number | null
  emAbertoCentavos: number | null
  fotos: number
  assinaturas: number
  podeDespachar: boolean
  /** Onde o aparelho está fisicamente, dito em português. */
  onde: string
  lugar: 'cliente' | 'rua' | 'oficina' | 'entregue'
  /** A última foto, para a miniatura. Nulo quando ainda não há nenhuma. */
  fotoId: string | null
}

/**
 * OS CARTÕES, E A JANELA QUE ABRE POR CIMA.
 *
 * ---------------------------------------------------------------------------
 * POR QUE O CARTÃO DEIXOU DE SER UM LINK
 * ---------------------------------------------------------------------------
 * Ele levava para a ficha da ordem. Funcionava, e custava a lista: quem
 * clicava perdia a busca que tinha acabado de digitar e a posição da rolagem, e
 * voltava com o botão do navegador. Com três clientes ligando seguido, isso é a
 * tarde inteira.
 *
 * Agora o cartão abre a janela e a lista continua atrás, intacta. A ficha
 * continua a um clique DENTRO da janela, para quem vai mexer na ordem — a
 * diferença é entre RESPONDER e TRABALHAR, e esta tela é para responder.
 *
 * ---------------------------------------------------------------------------
 * POR QUE `<button>`, E NÃO UMA `<div>` COM onClick
 * ---------------------------------------------------------------------------
 * Porque um cartão que abre coisa é um botão, e botão de verdade já vem com
 * foco, Enter, Espaço e leitura de tela. Uma `div` clicável obriga a reescrever
 * as quatro coisas à mão, e normalmente reescreve só a primeira.
 */
/**
 * A cor de cada lugar. Mapa explícito e não busca por nome montado.
 *
 * `estilo['lugar' + capitalizar(x)]` compila e some no dia em que alguém
 * renomeia a classe no CSS: o TypeScript não checa índice montado em string, e
 * o resultado é `undefined` virando classe vazia — a cor simplesmente para de
 * aparecer, sem erro em lugar nenhum.
 *
 * Só a RUA ganha destaque. Aparelho na rua é o único estado com risco de hoje:
 * está num carro, fora da oficina, e é o que alguém precisa achar de relance
 * numa tela de sessenta cartões. Pintar os quatro tiraria o destaque do que
 * importa.
 */
const COR_DO_LUGAR: Record<'cliente' | 'rua' | 'oficina' | 'entregue', string> = {
  cliente: '',
  rua: estilo.acompNaRua!,
  oficina: '',
  entregue: '',
}

export function Cartoes({
  ordens,
  motoristas,
}: {
  ordens: CartaoOrdem[]
  motoristas: Array<{ id: string; nome: string }>
}) {
  const [aberta, setAberta] = useState<string | null>(null)

  return (
    <>
      <div className={estilo.gradeAcompanhar}>
        {ordens.map((o) => (
          <button
            key={o.id}
            type="button"
            className={estilo.cartaoAcomp}
            onClick={() => setAberta(o.id)}
            aria-haspopup="dialog"
          >
            <div className={estilo.acompTopo}>
              <span className={estilo.cardOs}>#{String(o.numero).padStart(4, '0')}</span>
              {/* O selo de quem está esperando a rua. É o que faz a pessoa abrir
                  ESTE cartão em vez de percorrer os sessenta.

                  Ele fica NA LINHA, junto dos outros. Antes era posicionado no
                  canto superior direito do cartão — exatamente onde a etiqueta
                  da etapa também está — e os dois se escreviam por cima quando a
                  ordem estava esperando a rua E tinha etapa para mostrar, que é
                  justamente o caso mais comum. Resultado: as duas informações
                  ficavam ilegíveis nos cartões que mais importam. */}
              {o.podeDespachar ? (
                <span className={estilo.acompDespachar}>esperando a rua</span>
              ) : null}
              <span className={o.atrasada ? `${estilo.tag} ${estilo.tagAlerta}` : `${estilo.tag} ${estilo.tagNeutra}`}>
                {o.atrasada ? 'passou do prazo' : o.agora}
              </span>
            </div>

            <p className={estilo.acompCliente}>{o.cliente}</p>
            <p className={estilo.acompEq}>{o.equipamento}</p>

            {/* ONDE O APARELHO ESTÁ — a pergunta que o telefone faz.
                A etapa responde outra coisa: quem lê "APROVACAO_GESTAO" não
                consegue dizer ao cliente onde o equipamento se encontra. São
                vinte e uma etapas e ninguém decora vinte e uma; o LUGAR é
                sempre um de quatro. Ver `server/ordem/onde-esta.ts`. */}
            <p className={`${estilo.acompOnde} ${COR_DO_LUGAR[o.lugar]}`}>{o.onde}</p>

            <div className={estilo.trilhaMini}>
              <div className={estilo.trilhaMiniFio}>
                <span
                  className={o.desvio ? estilo.trilhaMiniParado : estilo.trilhaMiniCheio}
                  style={{ width: `${o.porcento}%` }}
                />
              </div>
              <div className={estilo.trilhaMiniTxt}>
                <span>{o.agora}</span>
                <span>
                  {o.cumpridos}/{o.total}
                </span>
              </div>
            </div>

            <div className={estilo.acompPe}>
              <span>
                {o.valorCentavos != null ? formatarBRL(o.valorCentavos) : 'sem orçamento ainda'}
                {o.emAbertoCentavos != null && o.emAbertoCentavos > 0 ? (
                  <span className={estilo.acompAberto}> · {formatarBRL(o.emAbertoCentavos)} em aberto</span>
                ) : null}
              </span>
              {/* A PROVA, e não a contagem dela.
                  "3 fotos" obriga a abrir para ver. A miniatura da última
                  mostra o aparelho na hora, que é o que se confere quando o
                  cliente liga reclamando de um risco na tampa.
                  A contagem fica ao lado, porque continua importando saber que
                  existem outras — e a assinatura não tem miniatura: ela é
                  prova jurídica, não visual, e o que importa dela é existir. */}
              <span className={estilo.acompProva}>
                {o.fotoId ? (
                  /* eslint-disable-next-line @next/next/no-img-element -- a
                     rota `/api/foto` já entrega a miniatura pronta e exige
                     sessão. Passar por `next/image` acrescentaria um salto
                     pelo otimizador para reencodar uma imagem de 28px que já
                     está no tamanho certo, e um salto a mais numa rota
                     autenticada é ganho nenhum e risco a mais. É o mesmo
                     caminho da ficha da ordem. */
                  <img
                    className={estilo.acompMini}
                    src={`/api/foto/${o.fotoId}?t=1`}
                    alt=""
                    loading="lazy"
                    width={28}
                    height={28}
                  />
                ) : null}
                {o.fotos} foto{o.fotos === 1 ? '' : 's'} · {o.assinaturas} assinatura
                {o.assinaturas === 1 ? '' : 's'}
              </span>
            </div>

          </button>
        ))}
      </div>

      {aberta ? (
        <Telinha ordemId={aberta} motoristas={motoristas} aoFechar={() => setAberta(null)} />
      ) : null}
    </>
  )
}
