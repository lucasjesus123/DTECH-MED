'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { criarQuadroPadrao } from '@/server/acoes/quadro'
import estilo from '../../painel.module.css'

/**
 * O QUADRO VAZIO — e por que ele oferece um ponto de partida.
 *
 * Um quadro que nasce em branco obriga a pessoa a desenhar o processo inteiro
 * antes de ver serventia nenhuma. Ninguém monta oito colunas para descobrir se
 * gostou: fecha a tela e não volta.
 *
 * As cinco do padrão são as fases que o próprio diagrama do sistema já desenha
 * — retirada, diagnóstico, execução, fechamento — mais os desfechos. Elas fazem
 * sentido no primeiro dia, e reescrever depois é mais fácil do que criar do
 * zero: a pessoa tem o que corrigir na frente, em vez de uma folha em branco.
 *
 * A porta de montar do zero fica ao lado, com o mesmo peso visual do resto.
 * Quem já sabe o processo que quer não é empurrado para o padrão.
 */
export default function Comecar({ podeDesenhar }: { podeDesenhar: boolean }) {
  const [msg, setMsg] = useState<string | null>(null)
  const [pendente, iniciar] = useTransition()
  const router = useRouter()

  if (!podeDesenhar) {
    return (
      <div className={estilo.vazio}>
        O quadro ainda não foi desenhado. Quem responde pelo processo — gestão para cima — monta as
        colunas, e elas aparecem aqui para a equipe inteira.
      </div>
    )
  }

  return (
    <div className={estilo.bloco}>
      <p className={estilo.blocoTitulo}>Seu quadro ainda não tem colunas</p>
      <p className={estilo.texto} style={{ maxWidth: '62ch' }}>
        As colunas são o <strong>seu</strong> processo: o nome que a casa usa e quais etapas da
        esteira cada uma agrupa. Você pode começar pelas cinco que seguem as fases do sistema e
        renomear tudo depois, ou montar do zero.
      </p>
      <p className={estilo.dica}>
        As 18 etapas em si não mudam — elas são encadeadas por hash e é isso que faz o prontuário
        ter valor de prova. O que você desenha é como elas se agrupam na tela.
      </p>

      {msg ? (
        <p className={estilo.erro} role="alert">
          {msg}
        </p>
      ) : null}

      <div className={estilo.modeloCartaoAcoes}>
        <button
          type="button"
          className={estilo.btnPrimario}
          disabled={pendente}
          onClick={() =>
            iniciar(async () => {
              const r = await criarQuadroPadrao()
              if (r.ok) router.refresh()
              else setMsg(r.motivo)
            })
          }
        >
          {pendente ? 'Criando…' : 'Começar com as cinco padrão'}
        </button>
        <Link className={estilo.btnSec} href="/painel/ordens/quadro/colunas">
          Montar do zero
        </Link>
      </div>
    </div>
  )
}
