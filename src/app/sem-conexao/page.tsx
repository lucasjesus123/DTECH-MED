import Link from 'next/link'
import type { Metadata } from 'next'
import estilo from '../app/app.module.css'

export const metadata: Metadata = { title: 'Sem conexão', robots: { index: false } }

/**
 * A tela que aparece quando o sinal cai.
 *
 * ---------------------------------------------------------------------------
 * POR QUE ELA MORA FORA DE `/app`
 * ---------------------------------------------------------------------------
 * O layout de `/app` exige sessão e o middleware protege o caminho inteiro.
 * Esta página precisa abrir justamente quando o servidor está inalcançável —
 * conferir sessão aqui seria conferir com quem não responde. Pior: o service
 * worker a busca na INSTALAÇÃO, e dentro de `/app` ele guardaria o redirecionamento
 * para o login em vez da página.
 *
 * Fora de `/app` ela é pública, e pode ser: não mostra nada de ninguém, é
 * texto fixo. Usa a folha de estilo do aplicativo para não parecer outra
 * coisa quando aparece.
 *
 * ---------------------------------------------------------------------------
 * POR QUE O TEXTO É ESTE
 * ---------------------------------------------------------------------------
 * Quem está sem sinal já sabe que está sem sinal. O que ele não sabe é o que
 * pode fazer agora e o que acontece com o que ele já registrou — e é isso que
 * a tela responde, em vez de repetir o óbvio com um ícone triste.
 */
export default function SemConexao() {
  return (
    <div className={estilo.aparelho}>
      <header className={estilo.cabecalho}>
        <span className={estilo.grav}>Sem conexão</span>
        <h1>O sinal caiu</h1>
      </header>

      <main className={estilo.corpo}>
        <p className={estilo.notaCampo}>
          O aplicativo abriu, mas não está conseguindo falar com o servidor.
        </p>

        <div className={estilo.blocoCampo}>
          <p className={estilo.grav}>O que já está registrado</p>
          <p className={estilo.notaCampo}>
            Tudo que apareceu confirmado na tela está no servidor e não se perde.
            Nada que você fez até agora depende deste aparelho.
          </p>
        </div>

        <div className={estilo.blocoCampo}>
          <p className={estilo.grav}>O que ainda não dá para fazer</p>
          <p className={estilo.notaCampo}>
            Assinar, enviar foto e fechar parada precisam do servidor confirmando.
            O aplicativo não vai dizer que salvou sem ter salvado — se ele
            dissesse, você iria embora achando que registrou.
          </p>
        </div>

        <div className={estilo.blocoCampo}>
          <p className={estilo.grav}>O que costuma resolver</p>
          <p className={estilo.notaCampo}>
            Sair do subsolo ou do elevador, dar alguns passos para a rua, ou
            ligar e desligar o modo avião. Assim que voltar, toque em tentar de
            novo — a tela recarrega do jeito que estava.
          </p>
        </div>

        <Link href="/app" className={estilo.btnGrande}>
          Tentar de novo
        </Link>
      </main>
    </div>
  )
}
