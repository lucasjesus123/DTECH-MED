'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { sairDaEmpresa } from '@/server/acoes/plataforma'
import estilo from './painel.module.css'

/**
 * A faixa que aparece enquanto o dono da plataforma está DENTRO de uma empresa.
 *
 * ---------------------------------------------------------------------------
 * POR QUE ELA NÃO PODE SER DISCRETA
 * ---------------------------------------------------------------------------
 * As telas de dentro de uma franquia são idênticas às de outra: mesma agenda,
 * mesmo painel do dia, mesmos botões. A única diferença está nos dados — e dado
 * a gente lê sem prestar atenção quando já esperava vê-lo ali.
 *
 * O erro que isso evita não é teórico: é abrir uma ordem de retirada na
 * franquia errada, mandar um WhatsApp para o cliente de outra cidade, ou dar
 * baixa numa fatura que não é daquela casa. Todos são desfazíveis, e todos
 * custam um telefonema constrangedor.
 *
 * Por isso ela ocupa a largura toda, em toda tela, com a cor de aviso da casa —
 * e traz a saída junto. Uma faixa que informa mas não oferece o caminho de
 * volta obriga a pessoa a caçar o botão, e é assim que se aprende a ignorar
 * faixas.
 */
export default function FaixaDaVisita({ empresa }: { empresa: string }) {
  const [saindo, iniciar] = useTransition()
  const router = useRouter()

  return (
    <div className={estilo.faixaVisita} role="status">
      <span className={estilo.faixaVisitaTxt}>
        Você está dentro de <strong>{empresa}</strong>. Tudo o que aparece nesta tela é
        desta empresa.
      </span>
      <button
        type="button"
        className={estilo.faixaVisitaBtn}
        disabled={saindo}
        onClick={() =>
          iniciar(async () => {
            await sairDaEmpresa()
            router.push('/painel/empresas')
            router.refresh()
          })
        }
      >
        {saindo ? 'Saindo…' : 'Voltar para a rede'}
      </button>
    </div>
  )
}
