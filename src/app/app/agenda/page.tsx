import Link from 'next/link'
import { Papel } from '@/generated/prisma/enums'
import { exigirSessao } from '@/server/auth/guarda'
import { agendaDeCampo, type ItemDaAgenda } from '@/server/consultas/campo'
import { FUSO } from '@/lib/datas'
import estilo from '../app.module.css'

export const dynamic = 'force-dynamic'

/**
 * A AGENDA DE QUEM TRABALHA EM CAMPO.
 *
 * O aplicativo abria no HOJE e terminava nele. Faltava a pergunta mais banal do
 * trabalho de quem está na rua ou na bancada — "amanhã eu tenho o quê?" — e
 * para respondê-la a pessoa tinha de ligar para a central.
 *
 * Aqui ela vê a própria semana, agrupada por dia, com o que está atrasado em
 * cima de tudo. Só o dela: o filtro é do servidor (`agendaDeCampo`), pelo id da
 * sessão, e não um recorte de tela.
 */
export default async function AgendaDeCampo() {
  const { sessao, ctx } = await exigirSessao()
  const itens = await agendaDeCampo(ctx, sessao.papel, sessao.userId)

  const deCampo = sessao.papel === Papel.MOTORISTA || sessao.papel === Papel.TECNICO
  const atrasados = itens.filter((i) => i.atrasado)
  const emDia = itens.filter((i) => !i.atrasado)

  // Agrupa por dia mantendo a ordem em que a consulta devolveu — que já é
  // cronológica. Um `sort` aqui reordenaria pela chave de texto e perderia isso.
  const porDia = new Map<string, ItemDaAgenda[]>()
  for (const i of emDia) {
    const l = porDia.get(i.dia)
    if (l) l.push(i)
    else porDia.set(i.dia, [i])
  }

  return (
    <>
      <header className={estilo.cabecalho}>
        <span className={estilo.grav}>Minha agenda</span>
        <h1>{sessao.nome}</h1>
        <div className={estilo.cabLinha}>
          <span>
            {itens.length} {itens.length === 1 ? 'compromisso' : 'compromissos'}
            {atrasados.length > 0 ? ` · ${atrasados.length} atrasado(s)` : ''}
          </span>
          <span className={estilo.mono}>PRÓXIMOS 14 DIAS</span>
        </div>
      </header>

      <main className={estilo.corpo}>
        {/* Quem administra não tem agenda de campo, e mostrar uma lista vazia
            faria parecer defeito. A dele existe — noutro lugar. */}
        {!deCampo ? (
          <p className={estilo.modoGestao}>
            <strong>Modo gestão.</strong> Esta é a agenda de quem trabalha em campo — as paradas do
            motorista e os prazos do técnico. A agenda da empresa inteira está no{' '}
            <Link href="/painel/calendario">Calendário</Link>.
          </p>
        ) : null}

        {itens.length === 0 ? (
          <p className={estilo.vazio}>
            {sessao.papel === Papel.MOTORISTA
              ? 'Nenhuma parada marcada para você nos próximos dias. O que a central agendar aparece aqui.'
              : 'Nenhuma ordem sua com prazo nos próximos dias.'}
          </p>
        ) : null}

        {atrasados.length > 0 ? (
          <section>
            <p className={estilo.agTitulo}>
              Atrasado
              <span className={estilo.agConta}>{atrasados.length}</span>
            </p>
            <div className={estilo.agLista}>
              {atrasados.map((i) => (
                <Cartao key={i.id} item={i} mostrarDia />
              ))}
            </div>
          </section>
        ) : null}

        {[...porDia.entries()].map(([dia, doDia]) => (
          <section key={dia}>
            <p className={estilo.agTitulo}>
              {rotuloDoDia(dia)}
              <span className={estilo.agConta}>{doDia.length}</span>
            </p>
            <div className={estilo.agLista}>
              {doDia.map((i) => (
                <Cartao key={i.id} item={i} />
              ))}
            </div>
          </section>
        ))}
      </main>
    </>
  )
}

function Cartao({ item, mostrarDia = false }: { item: ItemDaAgenda; mostrarDia?: boolean }) {
  return (
    <Link
      href={`/app/${item.tipo === 'PRAZO' ? 'tecnico' : 'motorista'}/${item.ordemId}`}
      className={item.atrasado ? `${estilo.agItem} ${estilo.agItemAtrasado}` : estilo.agItem}
    >
      <div className={estilo.agTopo}>
        <span className={estilo.mono}>
          {item.tipo === 'PRAZO' ? 'PRAZO' : item.tipo}
          {mostrarDia ? ` · ${rotuloCurto(item.dia)}` : ''}
        </span>
        <span className={estilo.mono}>#{String(item.numero).padStart(4, '0')}</span>
      </div>
      <p className={estilo.agHora}>{item.hora ?? 'sem hora combinada'}</p>
      <p className={estilo.agCliente}>{item.cliente}</p>
      <p className={estilo.agDetalhe}>{item.equipamento}</p>
      {item.endereco ? <p className={estilo.agDetalhe}>{item.endereco}</p> : null}
      <p className={estilo.agEtapa}>{item.etapaRotulo}</p>
    </Link>
  )
}

/**
 * As datas viram texto com o FUSO DECLARADO — nunca com o do aparelho.
 *
 * `new Date('2026-09-14')` é meia-noite UTC, que em Lajeado ainda é dia 13. O
 * `T12:00:00-03:00` põe o instante no meio do dia da casa, longe das duas
 * viradas, e o `timeZone` garante a mesma leitura em qualquer celular.
 */
const comoData = (dia: string) => new Date(`${dia}T12:00:00-03:00`)

const hojeLocal = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: FUSO,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())

function rotuloDoDia(dia: string): string {
  const hoje = hojeLocal()
  if (dia === hoje) return 'Hoje'
  const amanha = new Intl.DateTimeFormat('en-CA', {
    timeZone: FUSO,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(Date.now() + 86_400_000))
  if (dia === amanha) return 'Amanhã'

  const s = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    timeZone: FUSO,
  }).format(comoData(dia))
  // Só a primeira letra. `text-transform: capitalize` levantaria TODA palavra,
  // e "segunda-feira, 14 de setembro" viraria "Segunda-Feira, 14 De Setembro".
  return s.charAt(0).toUpperCase() + s.slice(1)
}

const rotuloCurto = (dia: string) =>
  new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', timeZone: FUSO }).format(
    comoData(dia),
  )
