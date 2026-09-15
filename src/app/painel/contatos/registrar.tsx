'use client'

import { useActionState, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { registrarContato } from '@/server/acoes/contatos'
import estilo from '../painel.module.css'

/**
 * REGISTRAR UM CONTATO QUE NÃO VEIO DO SITE.
 *
 * =============================================================================
 * O FUNIL SÓ CONTAVA UMA PORTA
 * =============================================================================
 * Esta tela mostrava quem preencheu o formulário do site. Só que a maioria dos
 * contatos de uma assistência chega pelo WhatsApp, pelo telefone, por indicação
 * de outra clínica, ou pela pessoa que apareceu com o aparelho no colo.
 *
 * Esses viviam na cabeça de quem atendeu, e o número no topo da tela mentia:
 * "3 aguardando resposta" quando havia doze.
 *
 * =============================================================================
 * A ORIGEM É A PERGUNTA QUE PAGA A TELA
 * =============================================================================
 * Ela é obrigatória e não tem padrão. Saber que metade dos clientes vem de
 * INDICAÇÃO muda o que a empresa faz com o dinheiro de anúncio — e essa
 * resposta some se todo contato anotado cair em "site" por omissão.
 */
export default function RegistrarContato() {
  const [aberto, setAberto] = useState(false)
  const [estado, acao, pendente] = useActionState(registrarContato, {
    ok: true as const,
    mensagem: '',
  })
  const router = useRouter()

  /**
   * A LISTA RECARREGA QUANDO O CONTATO ENTROU, e não 1,2 segundo depois.
   *
   * Estava `onSubmit={() => setTimeout(() => router.refresh(), 1200)}`. Um
   * cronômetro no lugar de uma transição de estado erra dos dois lados: numa
   * consulta lenta ou num 4G ruim o recarregamento acontece ANTES de o
   * contato existir, e a pessoa vê "Anotado" com a lista igual — conclui que
   * não salvou e anota de novo. Num dia rápido ele acontece tarde, e a tela
   * pisca por nada.
   *
   * Pior: o cronômetro disparava também quando a ação FALHAVA, recarregando a
   * tela por cima da mensagem de erro que ela acabou de escrever.
   *
   * `estado.mensagem` e não só `estado.ok`: o estado inicial já nasce com
   * `ok: true` e mensagem vazia, então testar só o `ok` recarregaria a lista
   * na primeira pintura do formulário. É a mesma condição que a tela usa
   * logo abaixo para decidir se mostra o aviso de sucesso.
   */
  useEffect(() => {
    if (estado.ok && estado.mensagem) router.refresh()
  }, [estado, router])

  if (!aberto) {
    return (
      <div className={estilo.acoesForm} style={{ marginBottom: 'var(--s4)' }}>
        <button type="button" className={estilo.btn} onClick={() => setAberto(true)}>
          Anotar contato
        </button>
        <span className={estilo.dica}>
          Quem ligou, chamou no WhatsApp, foi indicado ou apareceu na porta.
        </span>
      </div>
    )
  }

  return (
    <form
      action={acao}
      className={`${estilo.bloco} ${estilo.form}`}
      style={{ marginBottom: 'var(--s4)' }}
    >
      <p className={estilo.blocoTitulo}>Anotar contato</p>

      {!estado.ok ? (
        <p className={estilo.erro} role="alert">{estado.motivo}</p>
      ) : estado.mensagem ? (
        <p className={estilo.sucesso} role="status">{estado.mensagem}</p>
      ) : null}

      <div className={estilo.formLinha}>
        <label className={estilo.rotulo}>
          Quem chamou *
          <input className={estilo.campo} name="nome" required maxLength={120} />
        </label>
        <label className={estilo.rotulo}>
          Telefone *
          <input className={estilo.campo} name="telefone" required inputMode="tel" placeholder="51 99999-9999" />
          <span className={estilo.dica}>Sem ele não dá para retornar.</span>
        </label>
        <label className={estilo.rotulo}>
          Por onde chegou *
          <select className={estilo.campo} name="origem" required defaultValue="">
            {/* Vazio de propósito: sem padrão, a pessoa PRECISA responder. */}
            <option value="" disabled>Escolha…</option>
            <option value="WHATSAPP">WhatsApp</option>
            <option value="TELEFONE">Telefone</option>
            <option value="INDICACAO">Indicação</option>
            <option value="PRESENCIAL">Apareceu na porta</option>
            <option value="OUTRO">Outro</option>
          </select>
        </label>
      </div>

      <div className={estilo.formLinha}>
        <label className={estilo.rotulo}>
          Clínica ou empresa
          <input className={estilo.campo} name="empresa" maxLength={140} />
        </label>
        <label className={estilo.rotulo}>
          Cidade
          <input className={estilo.campo} name="cidade" maxLength={80} />
        </label>
        <label className={estilo.rotulo}>
          Qual aparelho
          <input className={estilo.campo} name="equipamento" maxLength={140} placeholder="Marca e modelo, se souber" />
        </label>
      </div>

      <label className={estilo.rotulo}>
        O que a pessoa disse
        <textarea className={estilo.area} name="mensagem" rows={2} maxLength={2000} />
      </label>

      <div className={estilo.acoesForm}>
        <button type="submit" className={estilo.btn} disabled={pendente}>
          {pendente ? 'Anotando…' : 'Anotar contato'}
        </button>
        <button type="button" className={estilo.btnSec} onClick={() => setAberto(false)}>
          Fechar
        </button>
      </div>
    </form>
  )
}
