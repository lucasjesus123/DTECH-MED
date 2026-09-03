import type { Metadata } from 'next'
import { Papel } from '@/generated/prisma/enums'
import { env } from '@/lib/env'
import { exigirAba, exigirSessao, podeVer } from '@/server/auth/guarda'
import Copiar from './copiar'
import estilo from '../painel.module.css'

export const metadata: Metadata = { title: 'Aplicativos de campo', robots: { index: false } }

/**
 * OS APLICATIVOS DE CAMPO — e por que esta tela precisou existir.
 *
 * =============================================================================
 * O ERRO QUE ELA CORRIGE, E O ERRO ERA MEU
 * =============================================================================
 * Os dois aplicativos existem desde o começo e estavam a TRÊS cliques de
 * distância: menu **O.S.** → aba **Rota** → botão *"Abrir app do motorista"*.
 *
 * Isso não aconteceu por descuido. Eu escrevi no `docs/PLANO.md`, com estas
 * palavras: *"os aplicativos como botões — porque aplicativo de campo não é
 * outra aba do painel, é outra superfície, feita para o celular de quem está na
 * rua"*. O argumento é verdadeiro e a conclusão estava errada: ser outra
 * superfície é justamente o motivo de eles precisarem de uma PORTA VISÍVEL, e
 * não de um botão dentro da terceira aba de outro assunto.
 *
 * A regra da casa — "o que responde à mesma pergunta vira aba" — também aponta
 * para cá quando lida direito: "quero usar o aplicativo de campo" não é recorte
 * de Ordens, de Acompanhar nem de Rota. É pergunta própria, e pergunta própria
 * é item de menu.
 *
 * =============================================================================
 * O QUE ELA FAZ QUE UM ATALHO NÃO FARIA
 * =============================================================================
 * Abrir o aplicativo no computador é o menos importante do que se faz aqui —
 * quem usa o aplicativo está na rua, com o celular. O trabalho real desta tela
 * é **levar o endereço até aquele celular**:
 *
 *   · o endereço à vista, com um botão que copia;
 *   · um link de WhatsApp que já abre a conversa com o texto pronto;
 *   · a instrução de instalar na tela inicial, que é o que faz o aplicativo
 *     abrir sem barra de navegador e continuar funcionando sem sinal.
 *
 * O link de WhatsApp é `wa.me`, e isso é deliberado: ele é um endereço comum,
 * não passa pela integração da uazapi. Hoje o `UAZAPI_ADMIN_TOKEN` está vazio e
 * nenhum número está conectado — um botão "enviar por WhatsApp" que depende da
 * fila entregaria silêncio. Este abre o WhatsApp de quem clicou, sempre.
 *
 * =============================================================================
 * QUEM VÊ O QUÊ
 * =============================================================================
 * Piso MOTORISTA, porque o próprio motorista precisa chegar ao aplicativo dele.
 * Mas o que a tela MOSTRA muda: quem é de campo vê o cartão do próprio
 * aplicativo em destaque e o do colega apenas mencionado, porque abrir o app do
 * técnico sendo motorista é uma porta que o sistema recusa — e oferecer porta
 * trancada todo dia é pior que não oferecer.
 *
 * A recusa em si não é desta tela: `/app/motorista` e `/app/tecnico` conferem o
 * papel por conta própria e mandam quem não é de campo (nem gestão) de volta ao
 * painel. Esconder aqui é conforto; quem autoriza é a trava de lá.
 */
export default async function Aplicativos() {
  const { sessao } = await exigirSessao()
  await exigirAba('aplicativos')

  // A gestão abre os dois para conferir o que a equipe está vendo na mão.
  const gerencia = podeVer(sessao.papel, Papel.GESTOR)
  const ehMotorista = sessao.papel === Papel.MOTORISTA
  const ehTecnico = sessao.papel === Papel.TECNICO

  const base = env.APP_URL.replace(/\/$/, '')

  const APPS = [
    {
      chave: 'motorista' as const,
      nome: 'Aplicativo do entregador',
      quem: 'Motorista',
      caminho: '/app/motorista',
      // O que ele faz, dito pelas ETAPAS da esteira que ele encosta. É o que
      // permite a quem monta a equipe saber a quem entregar o endereço.
      faz: [
        'Vê as paradas do dia, na ordem da rua',
        'Marca saída, chegada e coleta',
        'Tira a foto do aparelho na retirada',
        'Colhe a assinatura do cliente no dedo, na retirada e na entrega',
      ],
      etapas: 'Etapas 4, 5, 16 e 17 da esteira',
      alcanca: gerencia || ehMotorista,
    },
    {
      chave: 'tecnico' as const,
      nome: 'Aplicativo do técnico',
      quem: 'Técnico',
      caminho: '/app/tecnico',
      faz: [
        'Vê o que chegou na bancada',
        'Fotografa o aparelho recebido',
        'Registra o laudo e o que foi feito',
        'Monta o orçamento e baixa a peça do estoque',
      ],
      etapas: 'Etapas 6, 7, 11 e 12 da esteira',
      alcanca: gerencia || ehTecnico,
    },
  ]

  return (
    <>
      <div className={estilo.cab}>
        <div>
          <p className={estilo.grav}>O trabalho na rua</p>
          <h1 className={estilo.titulo}>Aplicativos de campo</h1>
        </div>
      </div>

      <p className={estilo.texto} style={{ maxWidth: '60ch', marginBottom: 'var(--s5)' }}>
        São duas telas feitas para <strong>celular</strong>, não para este computador. Elas usam o
        mesmo login do sistema: quem entra vê só as ordens que são dele, e o que ele faz lá aparece
        aqui na hora.
      </p>

      <div className={estilo.duasColunas}>
        {APPS.map((a) => (
          <div key={a.chave} className={estilo.bloco}>
            <p className={estilo.blocoTitulo}>{a.nome}</p>
            <p className={estilo.dica} style={{ marginTop: 'calc(var(--s2) * -1)' }}>
              Para o perfil <strong>{a.quem}</strong> · {a.etapas}
            </p>

            <ul className={estilo.listaSimples}>
              {a.faz.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>

            {a.alcanca ? (
              <>
                {/* Aba nova de propósito: quem confere o aplicativo daqui quer
                    voltar para onde estava, sem perder filtro nem rolagem. */}
                <div className={estilo.modeloCartaoAcoes}>
                  <a
                    href={a.caminho}
                    target="_blank"
                    rel="noreferrer"
                    className={estilo.btnPrimario}
                  >
                    Abrir agora
                  </a>
                </div>

                <p className={estilo.blocoTitulo} style={{ marginTop: 'var(--s5)' }}>
                  Levar para o celular
                </p>
                <Copiar endereco={`${base}${a.caminho}`} quem={a.quem} />

                <p className={estilo.dica}>
                  No celular, depois de entrar: no menu do navegador, toque em{' '}
                  <strong>Adicionar à tela de início</strong>. Aí ele abre como aplicativo, sem
                  barra de navegador, e a foto tirada sem sinal fica guardada até a internet voltar.
                </p>
              </>
            ) : (
              /* Porta que o papel não abre não vira botão. O aplicativo do
                 colega existe e é dito por escrito — sumir faria a pessoa
                 concluir que o sistema não tem aquilo. */
              <p className={estilo.dica}>
                Este aplicativo é do perfil <strong>{a.quem}</strong>. Seu perfil não abre — quem
                cuida da equipe consegue mandar o endereço para quem precisa.
              </p>
            )}
          </div>
        ))}
      </div>
    </>
  )
}
