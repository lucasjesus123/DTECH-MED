import { redirect } from 'next/navigation'
import { Papel } from '@/generated/prisma/enums'
import { contextoDe, lerSessao } from '@/server/auth/sessao'
import { rotaDoDia } from '@/server/consultas/campo'
import { Chip, EmptyState } from '@/components/sistema/pecas'
import estilo from '@/components/sistema/pecas.module.css'

/**
 * MAPA — a rota do dia, em ordem, com um toque para navegar.
 *
 * =============================================================================
 * POR QUE NÃO HÁ UM MAPA DESENHADO AQUI
 * =============================================================================
 * Desenhar o mapa dentro do aplicativo custaria uma biblioteca pesada, uma
 * chave de API de terceiro e um host externo na CSP — para entregar um mapa
 * pior que o que já está instalado no celular da pessoa.
 *
 * E o motorista não quer olhar um mapa: quer que o Waze abra na parada certa.
 * Então esta tela é a LISTA DA ROTA, em ordem, e cada linha é um toque para o
 * aplicativo que ele já usa. A rota inteira também abre de uma vez, com as
 * paradas encadeadas.
 *
 * =============================================================================
 * A ORDEM É A DA CENTRAL, E NÃO A MAIS CURTA
 * =============================================================================
 * Quem despachou sabe o que a lista não sabe: que a clínica das 8h abre às 8h,
 * que o hospital só recebe até as 11, que aquele aparelho é grande e precisa
 * entrar por último. Reordenar por distância desfaria isso em silêncio.
 */
export default async function MapaDoDia() {
  const sessao = await lerSessao()
  if (!sessao) redirect('/entrar')

  const souMotorista = sessao.papel === Papel.MOTORISTA
  const paradas = await rotaDoDia(contextoDe(sessao), souMotorista ? sessao.userId : null)
  const abertas = paradas.filter((p) => !p.concluida)

  const rotaInteira =
    abertas.length > 1
      ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
          abertas[abertas.length - 1]!.endereco,
        )}&waypoints=${abertas
          .slice(0, -1)
          .map((p) => encodeURIComponent(p.endereco))
          .join('|')}&travelmode=driving`
      : null

  return (
    <>
      <header className={estilo.campoTopo}>
        <div className={estilo.campoTopoTxt}>
          <strong>Mapa</strong>
          <span>
            {abertas.length === 0
              ? 'Nenhuma parada aberta'
              : `${abertas.length} ${abertas.length === 1 ? 'parada' : 'paradas'} na ordem da rota`}
          </span>
        </div>
      </header>

      {abertas.length === 0 ? (
        <EmptyState
          titulo="Nada na estrada ✓"
          apoio="Quando houver parada aberta hoje, a rota aparece aqui pronta para abrir no Waze ou no Maps."
        />
      ) : (
        <>
          {rotaInteira ? (
            <a
              className={estilo.acaoLarga}
              href={rotaInteira}
              target="_blank"
              rel="noreferrer"
            >
              Abrir a rota inteira no Maps
            </a>
          ) : null}

          <section className={estilo.resto}>
            {abertas.map((p, i) => (
              <div key={p.id} className={estilo.restoItem}>
                <span className={estilo.restoHora}>{String(i + 1).padStart(2, '0')}</span>
                <span className={estilo.restoTxt}>
                  <strong>{p.cliente}</strong>
                  <span>{p.endereco}</span>
                  <span>
                    <Chip tom={p.tipo === 'RETIRADA' ? 'warn' : 'info'}>
                      {p.tipo === 'RETIRADA' ? 'Coleta' : 'Entrega'}
                    </Chip>
                  </span>
                </span>
                <a
                  className={`${estilo.acaoLinha} ${estilo.aDireita}`}
                  href={`https://waze.com/ul?q=${encodeURIComponent(p.endereco)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Ir
                </a>
              </div>
            ))}
          </section>
        </>
      )}
    </>
  )
}
