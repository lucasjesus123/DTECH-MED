import Link from 'next/link'
import type { Metadata } from 'next'
import { Papel } from '@/generated/prisma/enums'
import { exigirPapel, exigirAba } from '@/server/auth/guarda'
import { paradasAoVivo } from '@/server/consultas/rastro'
import { AtualizaSozinho } from './atualiza-sozinho'
import estilo from '../../painel.module.css'
import AbasDaRota from '../abas'

export const metadata: Metadata = { title: 'Ao vivo', robots: { index: false } }
export const dynamic = 'force-dynamic'

/**
 * AO VIVO — quem está na rua agora, e onde.
 *
 * ---------------------------------------------------------------------------
 * A PERGUNTA QUE ESTA TELA RESPONDE
 * ---------------------------------------------------------------------------
 * "O cliente ligou às 15h: o motorista já saiu? Falta muito?" Até agora a
 * única resposta possível era ligar para o motorista — que está dirigindo.
 *
 * ---------------------------------------------------------------------------
 * O MAPA, E POR QUE ELE É UMA MOLDURA DO GOOGLE
 * ---------------------------------------------------------------------------
 * Este sistema roda com uma política de conteúdo fechada: nenhum script ou
 * imagem de fora entra sem estar declarado. Uma biblioteca de mapas puxaria
 * ladrilhos de um servidor de terceiro a cada arrastar do dedo — dezenas de
 * domínios, e um script novo rodando dentro do painel que abre ordem de
 * serviço e dado de cliente.
 *
 * A moldura do Google Maps já era permitida, para o "Onde estamos" do site, e
 * roda em contexto próprio: ela não alcança nada daqui. Custa zero em
 * segurança e mostra a rua de verdade.
 *
 * ---------------------------------------------------------------------------
 * POR QUE A IDADE DA POSIÇÃO APARECE SEMPRE
 * ---------------------------------------------------------------------------
 * Um ponto no mapa parece o agora. Se a última posição chegou há 20 minutos,
 * ele é onde o motorista ESTAVA — e quem responde ao cliente com base nele
 * erra. Por isso a idade vem junto do ponto, e passa a alertar depois de 10
 * minutos: nesse ponto o rastro parou, e o que importa é saber disso.
 */
export default async function AoVivo() {
  const { ctx } = await exigirPapel(
    Papel.ADMIN_EMPRESA,
    Papel.GESTOR,
    Papel.ATENDENTE,
    Papel.FINANCEIRO,
  )
  // A aba também: o papel diz o que ela pode fazer, a marcação diz o que ela vê.
  await exigirAba('rota')
  const paradas = await paradasAoVivo(ctx)
  const comPosicao = paradas.filter((p) => p.posicao).length

  return (
    <>
      <div className={estilo.cab}>
        <div>
          <p className={estilo.grav}>O trabalho</p>
          <h1 className={estilo.titulo}>Rota</h1>
          <p className={estilo.texto} style={{ marginTop: 'var(--s2)' }}>
            Quem está na rua agora, e onde.
          </p>
          <AtualizaSozinho segundos={30} />
        </div>
      </div>

      <AbasDaRota atual="aoVivo" />

      <div className={estilo.resumo}>
        <div className={estilo.indicador}>
          <span className={estilo.indNota}>Na rua agora</span>
          <span className={estilo.indValor}>{paradas.length}</span>
          <span className={estilo.indNota}>paradas em rota</span>
        </div>
        <div className={estilo.indicador}>
          <span className={estilo.indNota}>Com posição</span>
          <span className={estilo.indValor}>{comPosicao}</span>
          <span className={estilo.indNota}>
            {comPosicao < paradas.length ? 'o resto não compartilhou' : 'todas compartilhando'}
          </span>
        </div>
      </div>

      {paradas.length === 0 ? (
        <p className={estilo.vazio}>
          Ninguém na rua agora. Quando um motorista marcar a saída para uma retirada ou
          entrega, a parada aparece aqui.
        </p>
      ) : (
        <div className={estilo.gradeAoVivo}>
          {paradas.map((p) => {
            const velha = p.posicao ? p.posicao.minutosAtras >= 10 : false
            const impreciso = p.posicao?.precisaoM != null && p.posicao.precisaoM > 200
            return (
              <article key={p.agendamentoId} className={estilo.cartaoAoVivo}>
                <div className={estilo.acompTopo}>
                  <span className={estilo.cardOs}>#{String(p.numero).padStart(4, '0')}</span>
                  <span className={`${estilo.tag} ${estilo.tagNeutra}`}>
                    {p.tipo === 'RETIRADA' ? 'indo buscar' : 'indo entregar'}
                  </span>
                </div>

                <p className={estilo.acompCliente}>{p.cliente}</p>
                <p className={estilo.acompEq}>{p.equipamento}</p>
                <p className={estilo.fraco}>{p.endereco}</p>

                <p className={estilo.aoVivoQuem}>
                  <span className={estilo.aoVivoPulso} aria-hidden="true" />
                  {p.motorista}
                  {p.saiuEm ? ` · saiu ${hora(p.saiuEm)}` : ''}
                </p>

                {!p.posicao ? (
                  <p className={estilo.texto}>
                    Sem posição. O motorista precisa tocar em <strong>Compartilhar minha
                    rota</strong> no aplicativo — enquanto não tocar, só o endereço de destino
                    é conhecido.
                  </p>
                ) : (
                  <>
                    <iframe
                      className={estilo.aoVivoMapa}
                      title={`Onde está ${p.motorista}`}
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      src={`https://maps.google.com/maps?q=${p.posicao.latitude},${p.posicao.longitude}&z=15&output=embed`}
                    />
                    <p className={velha ? estilo.aoVivoVelha : estilo.fraco}>
                      {p.posicao.minutosAtras === 0
                        ? 'agora mesmo'
                        : `há ${p.posicao.minutosAtras} min`}
                      {velha ? ' — o rastro parou, confirme por telefone' : ''}
                      {impreciso ? ` · precisão de ${Math.round(p.posicao.precisaoM!)} m` : ''}
                      {p.posicao.velocidade != null && p.posicao.velocidade > 1
                        ? ` · ${Math.round(p.posicao.velocidade * 3.6)} km/h`
                        : ''}
                    </p>
                    <a
                      className={estilo.btnSec}
                      href={`https://www.google.com/maps/search/?api=1&query=${p.posicao.latitude},${p.posicao.longitude}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Abrir no mapa
                    </a>
                  </>
                )}

                <Link href={`/painel/ordens/${p.ordemId}`} className={estilo.aoVivoFicha}>
                  Abrir a ordem
                </Link>
              </article>
            )
          })}
        </div>
      )}
    </>
  )
}

const hora = (s: string) =>
  new Date(s).toLocaleTimeString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
  })
