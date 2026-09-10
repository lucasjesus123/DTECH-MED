import { redirect } from 'next/navigation'
import { EMPRESA } from '@/lib/empresa'
import { contextoDe, lerSessao } from '@/server/auth/sessao'
import { comEscopo } from '@/lib/db'
import { Bloco } from '@/components/sistema/pecas'
import estilo from '@/components/sistema/pecas.module.css'

/**
 * SOS — "deu problema e eu estou na rua".
 *
 * =============================================================================
 * O QUE ESTA TELA É, E O QUE ELA NÃO É
 * =============================================================================
 * Ela NÃO é um formulário de chamado. Quem está com o carro na chuva, ou com o
 * cliente ausente, ou com um aparelho que não cabe no porta-malas, não vai
 * preencher campo nenhum: vai ligar para alguém.
 *
 * Então a tela é uma lista de botões que discam. Um toque, e o telefone toca do
 * outro lado. É o desenho mais simples possível e é o certo para o momento em
 * que ela é aberta.
 *
 * =============================================================================
 * OS NÚMEROS SÃO OS DA EMPRESA, NÃO OS DA PLATAFORMA
 * =============================================================================
 * Numa rede multiempresa, o motorista da franquia precisa falar com a central
 * DELE. O número sai do cadastro do tenant; o da plataforma só aparece quando a
 * empresa não tem um cadastrado, e aí a tela diz de quem é o número.
 */
export default async function Sos() {
  const sessao = await lerSessao()
  if (!sessao) redirect('/entrar')

  const empresa = sessao.tenantId
    ? await comEscopo(contextoDe(sessao), (tx) =>
        tx.tenant.findUnique({
          where: { id: sessao.tenantId! },
          select: { nome: true, telefone: true, whatsapp: true },
        }),
      )
    : null

  const telefone = empresa?.telefone ?? empresa?.whatsapp ?? null
  const zap = (empresa?.whatsapp ?? empresa?.telefone)?.replace(/\D/g, '') ?? null

  return (
    <>
      <header className={estilo.campoTopo}>
        <div className={estilo.campoTopoTxt}>
          <strong>SOS</strong>
          <span>Deu problema na rua? Fale com alguém agora.</span>
        </div>
      </header>

      <Bloco titulo={`Central · ${empresa?.nome ?? 'sua empresa'}`}>
        {telefone ? (
          <a className={estilo.acaoLarga} href={`tel:${telefone.replace(/\D/g, '')}`}>
            Ligar para a central
          </a>
        ) : (
          <p className={estilo.campoDica}>
            A sua empresa ainda não cadastrou um telefone de contato. Quem
            resolve isso é o administrador, nas Configurações.
          </p>
        )}

        {zap ? (
          <a
            className={estilo.acaoLinha}
            href={`https://wa.me/55${zap}`}
            target="_blank"
            rel="noreferrer"
          >
            WhatsApp da central
          </a>
        ) : null}
      </Bloco>

      <Bloco titulo="Emergência">
        {/* Os três números que salvam alguém. Eles não dependem de cadastro
            nenhum e por isso estão escritos aqui: numa emergência, ninguém
            deveria depender de um campo que o administrador esqueceu de
            preencher. */}
        <a className={estilo.acaoLinha} href="tel:190">
          Polícia · 190
        </a>
        <a className={estilo.acaoLinha} href="tel:192">
          SAMU · 192
        </a>
        <a className={estilo.acaoLinha} href="tel:193">
          Bombeiros · 193
        </a>
      </Bloco>

      <Bloco titulo="O que fazer antes de ligar">
        <p className={estilo.campoDica}>
          <strong>Cliente ausente:</strong> tente o WhatsApp da parada pela aba
          Tarefas. Se ninguém responder em 10 minutos, ligue para a central antes
          de sair — a parada precisa ser remarcada por lá.
        </p>
        <p className={estilo.campoDica}>
          <strong>Aparelho não cabe ou está danificado:</strong> fotografe antes
          de encostar nele. A foto de como estava é o que separa o que veio assim
          do que aconteceu no transporte.
        </p>
        <p className={estilo.campoDica}>
          <strong>Sem sinal:</strong> a captura precisa de internet para enviar.
          Ande alguns metros, tente de novo, e só saia depois que a tela disser
          que enviou.
        </p>
      </Bloco>

      <p className={estilo.campoDica}>
        {EMPRESA.nome} · sistema de campo
      </p>
    </>
  )
}
