import Link from 'next/link'
import { redirect } from 'next/navigation'
import { EtapaOrdem, Papel } from '@/generated/prisma/enums'
import { NIVEL, exigirSessao } from '@/server/auth/guarda'
import { bancada } from '@/server/consultas/campo'
import { ROTULO_ETAPA } from '@/server/ordem/maquina-estados'
import estilo from '../app.module.css'

export const dynamic = 'force-dynamic'

export default async function Tecnico() {
  const { sessao, ctx } = await exigirSessao()

  // Mesmo motivo do app do motorista: quem gerencia precisa ver o que a bancada
  // vê. Aqui o modo gestão nem muda a consulta — `bancada` já mostra a oficina
  // inteira de propósito, porque o trabalho ali é compartilhado.
  const gerencia = NIVEL[sessao.papel] >= NIVEL[Papel.GESTOR]
  if (sessao.papel !== Papel.TECNICO && !gerencia) redirect('/painel')

  const fila = await bancada(ctx, sessao.userId)
  const chegando = fila.filter((o) => o.etapa === EtapaOrdem.COLETADO)
  const naBancada = fila.filter((o) => o.etapa !== EtapaOrdem.COLETADO)

  return (
    <>
      <header className={estilo.cabecalho}>
        <span className={estilo.grav}>Oficina</span>
        <h1>{sessao.nome}</h1>
        <div className={estilo.cabLinha}>
          <span>
            {chegando.length} chegando · {naBancada.length} na bancada
          </span>
          <span className={estilo.mono}>{hoje()}</span>
        </div>
      </header>

      <main className={estilo.corpo}>
        {chegando.length > 0 ? (
          <>
            <p className={estilo.grav}>Aguardando entrada</p>
            {chegando.map((o) => (
              <Link key={o.ordemId} href={`/app/tecnico/${o.ordemId}`} className={estilo.cartaoBancada}>
                <div className={estilo.cbTopo}>
                  <span className={estilo.mono}>#{String(o.numero).padStart(4, '0')}</span>
                  <span className={estilo.seloEspera}>
                    {o.fotosRecebimento >= 6
                      ? 'Pronto para entrada'
                      : `${o.fotosRecebimento} de 6 fotos`}
                  </span>
                </div>
                <h2>{o.equipamento}</h2>
                <p className={estilo.cbCliente}>{o.cliente}</p>
                <p className={estilo.cbDefeito}>{o.defeito}</p>
              </Link>
            ))}
          </>
        ) : null}

        {naBancada.length > 0 ? (
          <>
            <p className={estilo.grav} style={{ marginTop: 'var(--s6)' }}>
              Na sua bancada
            </p>
            {naBancada.map((o) => (
              <Link key={o.ordemId} href={`/app/tecnico/${o.ordemId}`} className={estilo.cartaoBancada}>
                <div className={estilo.cbTopo}>
                  <span className={estilo.mono}>#{String(o.numero).padStart(4, '0')}</span>
                  <span className={estilo.seloAndando}>{ROTULO_ETAPA[o.etapa]}</span>
                </div>
                <h2>{o.equipamento}</h2>
                <p className={estilo.cbCliente}>{o.cliente}</p>
              </Link>
            ))}
          </>
        ) : null}

        {fila.length === 0 ? (
          <p className={estilo.vazio}>
            Nenhum equipamento na fila agora. Quando o motorista trouxer um aparelho,
            ele aparece aqui para você dar entrada.
          </p>
        ) : null}
      </main>
    </>
  )
}

const hoje = () =>
  new Date()
    .toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', timeZone: 'America/Sao_Paulo' })
    .replace('.', '')
    .toUpperCase()
