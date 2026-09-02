'use client'

import { useActionState, useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { removerFotoDeCatalogo, salvarFotoDeCatalogo } from '@/server/acoes/estoque'
import estilo from './painel.module.css'

type Resposta = { ok: true } | { ok: false; motivo: string }
const inicial: Resposta = { ok: false, motivo: '' }

/**
 * A FOTO QUE IDENTIFICA — de uma peça ou de um equipamento.
 *
 * =============================================================================
 * POR QUE UM COMPONENTE SÓ PARA OS DOIS
 * =============================================================================
 * Peça e equipamento fazem a mesma pergunta ao olho: **"é este?"**. O técnico
 * procurando a fonte certa na prateleira e o atendente conferindo o aparelho
 * que o cliente descreve por telefone estão fazendo a mesma coisa.
 *
 * Duas cópias divergiriam na primeira correção feita só de um lado — e o lado
 * esquecido é sempre o que alguém usa.
 *
 * =============================================================================
 * ELA NÃO É PROVA, E ISSO MUDA O DESENHO
 * =============================================================================
 * As fotos de ordem provam o estado de um aparelho num momento: são muitas, têm
 * autor, hash e categoria, e não se apagam. Esta é cadastro — troca-se à
 * vontade, some sem cerimônia, e não vira evento na linha do tempo.
 *
 * Por isso aqui há um "trocar" e um "tirar" sem confirmação dramática: apagar a
 * foto de catálogo não destrói informação de negócio nenhuma.
 *
 * =============================================================================
 * ENVIA AO ESCOLHER, SEM BOTÃO DE ENVIAR
 * =============================================================================
 * Um botão a mais entre escolher o arquivo e a foto aparecer é um passo que
 * alguém esquece — e a peça fica sem foto sem que nada na tela diga por quê.
 * Escolher já é a intenção inteira.
 */
export default function FotoCatalogo({
  tipo,
  id,
  nome,
  tem,
  podeMexer,
  grande = false,
}: {
  tipo: 'peca' | 'equipamento'
  id: string
  /** Para o texto alternativo — quem usa leitor de tela precisa saber de quê. */
  nome: string
  tem: boolean
  podeMexer: boolean
  /**
   * O tamanho de CATÁLOGO, para quando a foto é o assunto e não uma coluna.
   *
   * Na tabela ela era um quadrado de 52 px ao lado de cinco campos — ou seja,
   * mais um dado. No catálogo ela é o que responde "é este?", e 52 px não
   * respondem: o mesmo modelo muda de cara entre gerações, e é justamente
   * essa diferença que some quando a imagem é pequena.
   */
  grande?: boolean
}) {
  const [estado, acao, enviando] = useActionState(salvarFotoDeCatalogo, inicial)
  const [pendente, iniciar] = useTransition()
  // Só o erro de REMOÇÃO vira estado: ele nasce de uma transição solta, sem
  // `useActionState` para guardá-lo.
  const [erroRemocao, setErroRemocao] = useState<string | null>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const router = useRouter()

  // O efeito faz UMA coisa: recarregar quando o envio deu certo. Copiar o erro
  // do envio para estado aqui dentro seria `setState` dentro de efeito, que
  // dispara uma segunda renderização por nada — e é exatamente o que o lint
  // recusa. O erro do envio já vive em `estado`; basta lê-lo.
  useEffect(() => {
    if (estado.ok) router.refresh()
  }, [estado, router])

  const erro = erroRemocao ?? (!estado.ok && estado.motivo ? estado.motivo : null)

  const src = `/api/catalogo/${tipo}/${id}?t=1`

  return (
    <div className={grande ? `${estilo.fotoCat} ${estilo.fotoCatGrande}` : estilo.fotoCat}>
      {tem ? (
        /* eslint-disable-next-line @next/next/no-img-element -- a rota já
           entrega a miniatura pronta e exige sessão; passar por `next/image`
           acrescentaria um salto pelo otimizador para reencodar uma imagem que
           já está no tamanho certo, numa rota autenticada. */
        <img className={estilo.fotoCatImg} src={src} alt={`Foto de ${nome}`} loading="lazy" />
      ) : (
        <span className={estilo.fotoCatVazia} aria-hidden="true">
          sem foto
        </span>
      )}

      {podeMexer ? (
        <form action={acao} ref={formRef} className={estilo.fotoCatAcoes}>
          <input type="hidden" name="tipo" value={tipo} />
          <input type="hidden" name="id" value={id} />
          <label className={estilo.fotoCatBotao}>
            {enviando ? 'enviando…' : tem ? 'trocar' : 'pôr foto'}
            {/* O `input` fica escondido atrás do rótulo porque o controle
                nativo de arquivo não é estilizável e escreve "Nenhum arquivo
                selecionado" ao lado — texto que sobra numa célula de tabela.
                O rótulo é clicável de verdade e continua alcançável pelo Tab. */}
            <input
              className={estilo.soLeitor}
              type="file"
              name="arquivo"
              accept="image/jpeg,image/png,image/webp"
              disabled={enviando}
              onChange={(e) => {
                setErroRemocao(null)
                if (e.target.files?.length) formRef.current?.requestSubmit()
              }}
            />
          </label>

          {tem ? (
            <button
              type="button"
              className={estilo.acaoRara}
              disabled={pendente || enviando}
              onClick={() =>
                iniciar(async () => {
                  const r = await removerFotoDeCatalogo(tipo, id)
                  if (!r.ok) setErroRemocao(r.motivo)
                  else router.refresh()
                })
              }
            >
              tirar
            </button>
          ) : null}
        </form>
      ) : null}

      {erro ? (
        <p className={estilo.erro} role="alert">
          {erro}
        </p>
      ) : null}
    </div>
  )
}
