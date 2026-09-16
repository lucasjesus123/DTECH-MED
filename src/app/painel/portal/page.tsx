import Link from 'next/link'
import type { Metadata } from 'next'
import { Papel } from '@/generated/prisma/enums'
import { exigirAba, exigirNivel } from '@/server/auth/guarda'
import { clientesDoPortal, ordensDoCliente } from '@/server/consultas/portal'
import { formatarDocumento, formatarTelefone } from '@/lib/documentos'
import Lista from './lista'
import estilo from '../painel.module.css'

export const metadata: Metadata = { title: 'Painel do cliente', robots: { index: false } }
export const dynamic = 'force-dynamic'

/**
 * O PAINEL DO CLIENTE — ver o sistema com os olhos de quem está do outro lado.
 *
 * =============================================================================
 * O QUE FALTAVA
 * =============================================================================
 * Toda ordem nasce com um link público, e é ele que o cliente recebe no
 * WhatsApp. Esse endereço saía uma vez, na mensagem, e sumia: não havia nenhum
 * lugar no painel que o mostrasse.
 *
 * Quem atende, então, conversava sobre uma tela que nunca tinha visto. O cliente
 * liga dizendo "aqui está escrito que meu aparelho está em análise", e de cá se
 * olha uma tela diferente, com outras palavras e outros degraus. É o tipo de
 * conversa que termina com os dois certos e nenhum entendido.
 *
 * =============================================================================
 * DOIS PASSOS, E O PRIMEIRO É ESCOLHER O CLIENTE
 * =============================================================================
 * A tela não abre num cliente qualquer nem no último atendido: ela pergunta.
 * Uma página do cliente é o histórico do aparelho dele, o valor combinado e os
 * documentos — abrir isso por acidente, porque a tela "lembrou" de alguém, é
 * mostrar dado de um cliente a quem estava ligando por outro.
 *
 * Escolhido o cliente, vêm TODAS as ordens dele com o link de cada uma: o
 * mesmo, lido da ordem, e não um gerado agora. Ver uma página parecida com a do
 * cliente não resolve nada — só faria a divergência passar despercebida.
 *
 * =============================================================================
 * ABRE EM ABA NOVA, E ISSO É PROPOSITAL
 * =============================================================================
 * A página do cliente não tem o menu do painel, e é assim que ela é. Abrir por
 * cima faria quem atende perder o lugar no meio da ligação; e embutir num
 * quadro dentro do painel mostraria a página com moldura — que é precisamente o
 * que ela NÃO tem na mão do cliente.
 */
export default async function PainelDoCliente({
  searchParams,
}: {
  searchParams: Promise<{ busca?: string; cliente?: string }>
}) {
  /**
   * Piso ATENDENTE, e não o piso do menu por acaso: esta tela entrega o LINK de
   * acesso às ordens de um cliente. Quem alcança o link alcança a página, e ela
   * traz valor combinado e documentos. O técnico e o motorista têm os
   * aplicativos deles; isto aqui é de quem atende.
   */
  const { ctx } = await exigirNivel(Papel.ATENDENTE)
  await exigirAba('portal')

  const q = await searchParams
  const escolhido = q.cliente ? await ordensDoCliente(ctx, q.cliente) : null

  // Id que não é desta empresa não é achado — e a resposta é a mesma de um id
  // inventado: a tela volta a perguntar qual cliente, sem dizer que existe.
  const clientes = escolhido ? [] : await clientesDoPortal(ctx, q.busca ?? '')

  return (
    <>
      <div className={estilo.cab}>
        <div>
          <p className={estilo.grav}>O trabalho na rua</p>
          <h1 className={estilo.titulo}>Painel do cliente</h1>
        </div>
        {escolhido ? (
          <Link href="/painel/portal" className={estilo.btnSec}>
            Trocar de cliente
          </Link>
        ) : null}
      </div>

      {escolhido ? (
        <VistaDoCliente dados={escolhido} />
      ) : (
        <Escolha clientes={clientes} busca={q.busca ?? ''} />
      )}
    </>
  )
}

/* -------------------------------------------------------------------------- */
/* PASSO 1 — qual cliente                                                      */
/* -------------------------------------------------------------------------- */

function Escolha({
  clientes,
  busca,
}: {
  clientes: Awaited<ReturnType<typeof clientesDoPortal>>
  busca: string
}) {
  return (
    <>
      <p className={estilo.texto} style={{ maxWidth: '62ch', marginBottom: 'var(--s5)' }}>
        Escolha o cliente para ver <strong>a mesma página que ele recebeu no WhatsApp</strong> — com
        as palavras, os degraus e os documentos que estão na tela dele, e não nesta.
      </p>

      <form method="get" className={estilo.filtros}>
        <div className={estilo.busca}>
          <input
            className={estilo.campo}
            type="search"
            name="busca"
            defaultValue={busca}
            placeholder="Nome, CNPJ, contato ou cidade"
            aria-label="Buscar cliente"
          />
        </div>
        <button type="submit" className={estilo.btn}>
          Buscar
        </button>
      </form>

      {clientes.length === 0 ? (
        <p className={estilo.vazio}>
          {busca
            ? 'Nenhum cliente com esse nome, documento ou cidade.'
            : 'Nenhum cliente cadastrado ainda. O primeiro entra junto com a primeira ordem de retirada.'}
        </p>
      ) : (
        <div className={`${estilo.quadro} ${estilo.rolaX}`}>
          <table className={estilo.tabela}>
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Documento</th>
                <th>WhatsApp</th>
                <th className={estilo.dir}>Ordens</th>
                <th>
                  <span className={estilo.soLeitor}>Abrir</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {clientes.map((c) => (
                <tr key={c.id}>
                  <td>
                    <strong>{c.nome}</strong>
                    {c.cidade ? (
                      <div className={estilo.fraco}>
                        {c.cidade}
                        {c.uf ? `/${c.uf}` : ''}
                      </div>
                    ) : null}
                  </td>
                  <td className={estilo.num}>
                    {c.documento ? formatarDocumento(c.documento) : '—'}
                  </td>
                  <td className={estilo.num}>
                    {c.whatsapp ? formatarTelefone(c.whatsapp) : '—'}
                  </td>
                  <td className={estilo.dir}>
                    {/* A contagem é o que diz de quem vale a pena abrir: cliente
                        sem ordem tem página nenhuma para mostrar. */}
                    {c.total === 0 ? (
                      <span className={estilo.fraco}>nenhuma</span>
                    ) : (
                      <>
                        <div className={estilo.forte}>
                          {c.total} {c.total === 1 ? 'ordem' : 'ordens'}
                        </div>
                        <div className={estilo.fraco}>
                          {c.abertas > 0 ? `${c.abertas} em andamento` : 'todas encerradas'}
                        </div>
                      </>
                    )}
                  </td>
                  <td className={estilo.dir}>
                    {c.total === 0 ? (
                      <span className={estilo.fraco}>—</span>
                    ) : (
                      <Link href={`/painel/portal?cliente=${c.id}`} className={estilo.btn}>
                        Ver o que ele vê
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

/* -------------------------------------------------------------------------- */
/* PASSO 2 — as ordens dele, com o link de cada uma                            */
/* -------------------------------------------------------------------------- */

function VistaDoCliente({
  dados,
}: {
  dados: NonNullable<Awaited<ReturnType<typeof ordensDoCliente>>>
}) {
  const { cliente, ordens } = dados
  const emAndamento = ordens.filter((o) => !o.encerrada)
  const encerradas = ordens.filter((o) => o.encerrada)

  return (
    <>
      <div className={estilo.bloco} style={{ marginBottom: 'var(--s5)' }}>
        <p className={estilo.blocoTitulo}>{cliente.nome}</p>
        <p className={estilo.dica} style={{ marginTop: 'calc(var(--s2) * -1)' }}>
          {cliente.documento ? formatarDocumento(cliente.documento) : 'sem documento no cadastro'}
          {cliente.whatsapp ? ` · ${formatarTelefone(cliente.whatsapp)}` : ''}
          {cliente.cidade ? ` · ${cliente.cidade}${cliente.uf ? `/${cliente.uf}` : ''}` : ''}
        </p>
        <p className={estilo.texto} style={{ maxWidth: '62ch' }}>
          Cada ordem abaixo tem <strong>o endereço que este cliente recebeu</strong>. É o mesmo
          link, lido da ordem — abrir aqui mostra exatamente a tela que está no celular dele, sem
          login e sem o menu do painel.
        </p>
      </div>

      {ordens.length === 0 ? (
        <p className={estilo.vazio}>
          Este cliente ainda não tem ordem nenhuma. A página dele nasce junto com a primeira ordem
          de retirada.
        </p>
      ) : (
        <>
          <ListaDeOrdens
            titulo="Em andamento"
            vazio="Nenhuma ordem aberta agora."
            ordens={emAndamento}
          />
          {encerradas.length > 0 ? (
            <ListaDeOrdens
              titulo="Encerradas"
              vazio=""
              ordens={encerradas}
              nota="A página de uma ordem encerrada continua de pé: é onde o cliente acha o histórico e os documentos depois da entrega."
            />
          ) : null}
        </>
      )}
    </>
  )
}

function ListaDeOrdens({
  titulo,
  vazio,
  ordens,
  nota,
}: {
  titulo: string
  vazio: string
  ordens: NonNullable<Awaited<ReturnType<typeof ordensDoCliente>>>['ordens']
  nota?: string
}) {
  return (
    <section style={{ marginBottom: 'var(--s5)' }}>
      <p className={estilo.blocoTitulo}>{titulo}</p>
      {nota ? <p className={estilo.dica}>{nota}</p> : null}

      {ordens.length === 0 ? (
        <p className={estilo.vazio}>{vazio}</p>
      ) : (
        /* LISTA E JANELA, como na Central de O.S. Ver a nota longa em
           `portal/lista.tsx`: isto era uma grade de cartões com seis blocos e
           quatro botões cada, e a URL de 60 caracteres quebrando em uma ou duas
           linhas conforme o token — que era a causa direta de os cartões saírem
           com alturas diferentes. */
        <Lista
          ordens={ordens.map((o) => ({
            id: o.id,
            numero: o.numero,
            equipamento: o.equipamento,
            serie: o.serie,
            etapaRotulo: o.etapaRotulo,
            link: o.link,
          }))}
        />
      )}
    </section>
  )
}
