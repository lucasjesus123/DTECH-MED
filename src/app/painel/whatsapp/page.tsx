import Link from 'next/link'
import type { Metadata } from 'next'
import { Papel } from '@/generated/prisma/enums'
import { exigirNivel } from '@/server/auth/guarda'
import { painelWhatsapp } from '@/server/consultas/listas'
import Conexao from './conexao'
import estilo from '../painel.module.css'

export const metadata: Metadata = { title: 'WhatsApp', robots: { index: false } }
export const dynamic = 'force-dynamic'

/**
 * O canal por onde o cliente é avisado.
 *
 * A tela mostra duas coisas separadas de propósito: se o número está
 * **conectado** e se as mensagens estão **saindo**. As duas costumam ser
 * confundidas — o número pode estar conectado e a fila travada por erro no
 * envio, e quem só olha o status acha que está tudo certo enquanto ninguém é
 * avisado de nada.
 */
export default async function Whatsapp() {
  const { ctx } = await exigirNivel(Papel.GESTOR)
  const { instancia, mensagens, fila } = await painelWhatsapp(ctx)

  const descartados = fila.DESCARTADO ?? 0
  const pendentes = fila.PENDENTE ?? 0

  return (
    <>
      <div className={estilo.cab}>
        <div>
          <p className={estilo.grav}>Retaguarda</p>
          <h1 className={estilo.titulo}>WhatsApp</h1>
        </div>
      </div>

      <Conexao
        status={instancia?.status ?? null}
        numero={instancia?.numero ?? null}
        profileName={instancia?.profileName ?? null}
        ultimoStatusEm={instancia?.ultimoStatusEm?.toISOString() ?? null}
      />

      <div className={estilo.resumo}>
        <Indicador rotulo="Na fila" valor={String(pendentes)} nota="aguardando o próximo disparo" />
        <Indicador rotulo="Concluídos" valor={String(fila.CONCLUIDO ?? 0)} nota="avisos entregues à fila" />
        <Indicador
          rotulo="Desistiram"
          valor={String(descartados)}
          nota={descartados > 0 ? 'estouraram as tentativas — veja o erro abaixo' : 'nenhum'}
          alerta={descartados > 0}
        />
        <Indicador rotulo="Em processamento" valor={String(fila.PROCESSANDO ?? 0)} nota="saindo agora" />
      </div>

      <div className={estilo.bloco}>
        <p className={estilo.blocoTitulo}>Últimas mensagens</p>
        {mensagens.length === 0 ? (
          <p className={estilo.texto}>
            Nenhuma mensagem ainda. Elas saem sozinhas a cada passo da esteira —
            ninguém precisa lembrar de avisar o cliente.
          </p>
        ) : (
          <div className={estilo.rolaX}>
            <table className={estilo.tabela}>
              <thead>
                <tr>
                  <th>Quando</th>
                  <th>Para</th>
                  <th>O.S.</th>
                  <th>Aviso</th>
                  <th>Situação</th>
                </tr>
              </thead>
              <tbody>
                {mensagens.map((m) => (
                  <tr key={m.id}>
                    <td className={estilo.num}>{dataHora(m.enviadaEm ?? m.criadoEm)}</td>
                    <td className={estilo.num}>{telefone(m.numero)}</td>
                    <td className={estilo.num}>
                      {m.ordem ? (
                        <Link href={`/painel/ordens/${m.ordem.id}`}>#{String(m.ordem.numero).padStart(4, '0')}</Link>
                      ) : (
                        <span className={estilo.fraco}>—</span>
                      )}
                    </td>
                    <td>
                      <span className={estilo.forte}>{m.template ?? 'mensagem avulsa'}</span>
                      <div className={estilo.fraco}>{primeiraLinha(m.corpo)}</div>
                    </td>
                    <td>
                      <span className={`${estilo.tag} ${corStatus(m.status)}`}>{m.status.toLowerCase()}</span>
                      {m.erro ? <div className={estilo.fraco}>{m.erro}</div> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className={estilo.fraco}>
        Cada aviso é gravado na mesma transação que muda a etapa da ordem. É o que
        impede o caso clássico: a ordem andou, o cliente não soube.
      </p>
    </>
  )
}

function Indicador({
  rotulo,
  valor,
  nota,
  alerta,
}: {
  rotulo: string
  valor: string
  nota: string
  alerta?: boolean
}) {
  return (
    <div className={estilo.indicador}>
      <span className={estilo.grav}>{rotulo}</span>
      <strong className={[estilo.indValor, alerta ? estilo.indAlerta : ''].filter(Boolean).join(' ')}>{valor}</strong>
      <span className={estilo.indNota}>{nota}</span>
    </div>
  )
}

function corStatus(s: string): string {
  if (s === 'ENVIADA' || s === 'ENTREGUE' || s === 'LIDA') return estilo.tagOk!
  if (s === 'FALHOU') return estilo.tagAlerta!
  return estilo.tagEspera!
}

const fmt = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'America/Sao_Paulo',
})
const dataHora = (d: Date) => fmt.format(d)

const primeiraLinha = (c: string) => {
  const l = c.split('\n').find((x) => x.trim()) ?? ''
  return l.length > 70 ? `${l.slice(0, 70)}…` : l
}

function telefone(t: string): string {
  const d = t.replace(/\D/g, '').replace(/^55/, '')
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return t
}
