'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTransition, useState } from 'react'
import { descartarContato, restaurarContato } from '@/server/acoes/contatos'
import estilo from '../painel.module.css'

export type Contato = {
  id: string
  nome: string
  telefone: string
  email: string | null
  empresa: string | null
  cidade: string | null
  equipamento: string | null
  mensagem: string
  status: string
  criadoEm: string
  virouOrdem: boolean
}

/**
 * A lista de contatos, em cartões e não em tabela.
 *
 * =============================================================================
 * POR QUE CARTÃO
 * =============================================================================
 * O conteúdo tem tamanho imprevisível. Numa tabela, a mensagem mais longa da
 * página estica a linha dela e desalinha a leitura de todas as outras — foi
 * exatamente isso que aconteceu no painel do dia. Em cartão, cada um cresce
 * dentro do próprio quadro e não empurra o vizinho.
 *
 * =============================================================================
 * A MENSAGEM É CORTADA ATÉ ALGUÉM PEDIR
 * =============================================================================
 * Três linhas, com o resto atrás de "ler tudo". A decisão de ler é de quem
 * está olhando: numa lista de trinta contatos, trinta mensagens abertas é uma
 * parede de texto que ninguém percorre.
 *
 * O corte é por CSS aqui (`line-clamp`), e não no servidor como na tira do
 * painel — porque nesta tela o texto inteiro precisa estar presente para o
 * "ler tudo" funcionar sem outra ida ao servidor.
 */
export default function Lista({ contatos, situacao }: { contatos: Contato[]; situacao: string }) {
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null)
  const [pendente, iniciar] = useTransition()
  const router = useRouter()

  function agir(fn: () => Promise<{ ok: true; mensagem?: string } | { ok: false; motivo: string }>) {
    setMsg(null)
    iniciar(async () => {
      const r = await fn()
      setMsg({ ok: r.ok, texto: r.ok ? (r.mensagem ?? 'Feito.') : r.motivo })
      if (r.ok) router.refresh()
    })
  }

  if (contatos.length === 0) {
    return (
      <p className={estilo.vazio}>
        {situacao === 'novos'
          ? 'Ninguém esperando resposta. Quando alguém preencher o formulário do site, aparece aqui.'
          : 'Nada com esse filtro.'}
      </p>
    )
  }

  return (
    <>
      {msg ? (
        <p className={msg.ok ? estilo.sucesso : estilo.erro} role={msg.ok ? 'status' : 'alert'}>
          {msg.texto}
        </p>
      ) : null}

      <div className={estilo.contatos}>
        {contatos.map((c) => (
          <article key={c.id} className={estilo.contato}>
            <div className={estilo.contatoTopo}>
              <div>
                <strong className={estilo.contatoNome}>{c.nome}</strong>
                <p className={estilo.contatoOnde}>
                  {[c.empresa, c.cidade].filter(Boolean).join(' · ') || 'sem empresa nem cidade'}
                </p>
              </div>
              <span className={selo(c.status)}>{rotuloSituacao(c.status)}</span>
            </div>

            <dl className={estilo.contatoPares}>
              <div>
                <dt className={estilo.grav}>Chegou</dt>
                <dd>{quando(c.criadoEm)}</dd>
              </div>
              <div>
                <dt className={estilo.grav}>Telefone</dt>
                <dd>
                  {/* O link do WhatsApp é o caminho mais curto entre ver o
                      contato e responder. Sem ele, alguém copia o número à mão
                      e é aí que se erra um dígito. */}
                  <a href={`https://wa.me/55${c.telefone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer">
                    {c.telefone}
                  </a>
                </dd>
              </div>
              <div>
                <dt className={estilo.grav}>Equipamento</dt>
                <dd>{c.equipamento || <span className={estilo.fraco}>não informou</span>}</dd>
              </div>
              {c.email ? (
                <div>
                  <dt className={estilo.grav}>E-mail</dt>
                  <dd className={estilo.contatoEmail}>{c.email}</dd>
                </div>
              ) : null}
            </dl>

            {/* "Ler tudo" só quando há mais para ler.
                O corte é por `line-clamp`, que o CSS aplica sem contar a
                ninguém se sobrou texto — então uma mensagem de duas linhas
                ganhava um "ler tudo" que não abria nada. Convidar para abrir o
                que já está aberto ensina a pessoa a desconfiar do botão.
                O limiar é por tamanho porque é o que o servidor sabe: acima de
                ~180 caracteres o texto passa de três linhas na largura do
                cartão. Erra por pouco nos dois sentidos, e errar aqui custa uma
                linha a mais na tela — não uma informação escondida. */}
            {c.mensagem ? (
              c.mensagem.length <= 180 ? (
                <p className={estilo.contatoTexto}>{c.mensagem}</p>
              ) : (
                <details className={estilo.contatoMsg}>
                  <summary>
                    <span className={estilo.contatoTrecho}>{c.mensagem}</span>
                    <span className={estilo.contatoLer}>ler tudo</span>
                  </summary>
                  <p className={estilo.contatoTexto}>{c.mensagem}</p>
                </details>
              )
            ) : null}

            <div className={estilo.contatoAcoes}>
              {c.status === 'novo' ? (
                <>
                  <Link href={`/painel/ordens/nova?lead=${c.id}`} className={estilo.btn}>
                    Abrir ordem
                  </Link>
                  <button
                    type="button"
                    className={estilo.btnSec}
                    disabled={pendente}
                    onClick={() => agir(() => descartarContato(c.id))}
                  >
                    Não é serviço
                  </button>
                </>
              ) : c.status === 'descartado' ? (
                <button
                  type="button"
                  className={estilo.btnSec}
                  disabled={pendente}
                  onClick={() => agir(() => restaurarContato(c.id))}
                >
                  Devolver para a lista
                </button>
              ) : (
                <span className={estilo.fraco}>
                  {c.virouOrdem ? 'Já virou ordem de serviço.' : 'Já foi atendido.'}
                </span>
              )}
            </div>
          </article>
        ))}
      </div>

      <p className={estilo.dica} style={{ marginTop: 'var(--s5)' }}>
        &ldquo;Não é serviço&rdquo; não apaga nada — o contato vai para a aba Descartados e volta com
        um clique. O formulário do site é público, então chega de tudo: teste de quem estava
        conferindo, e prospecção em massa. Tirar isso da frente é o que mantém a lista legível
        para o contato que importa.
      </p>
    </>
  )
}

function rotuloSituacao(s: string): string {
  if (s === 'novo') return 'aguardando'
  if (s === 'convertido') return 'virou ordem'
  if (s === 'descartado') return 'descartado'
  if (s === 'em_contato') return 'em contato'
  return s
}

function selo(s: string): string {
  if (s === 'novo') return `${estilo.tag} ${estilo.tagEspera}`
  if (s === 'convertido') return `${estilo.tag} ${estilo.tagOk}`
  return `${estilo.tag} ${estilo.tagNeutra}`
}

/** "há 4 min", "há 17h", "12/03 09:41" — o tempo como se conta. */
function quando(iso: string): string {
  const d = new Date(iso)
  const min = Math.round((Date.now() - d.getTime()) / 60000)
  if (min < 1) return 'agora mesmo'
  if (min < 60) return `há ${min} min`
  if (min < 48 * 60) return `há ${Math.round(min / 60)}h`
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}
