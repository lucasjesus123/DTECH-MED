'use client'

import { useState } from 'react'
import estilo from '../painel.module.css'

/**
 * O ENDEREÇO, PARA COPIAR OU MANDAR NO WHATSAPP.
 *
 * =============================================================================
 * O ENDEREÇO FICA VISÍVEL, E NÃO ESCONDIDO ATRÁS DO BOTÃO
 * =============================================================================
 * A tentação é mostrar só "Copiar link". Ruim: quem vai ditar o endereço por
 * telefone para o motorista que está na rua precisa LER, e quem desconfia de um
 * botão que copia sabe-se lá o quê precisa conferir antes de mandar. O texto é
 * selecionável — copiar à mão continua funcionando se o botão falhar.
 *
 * =============================================================================
 * O BOTÃO CONFIRMA, E DEPOIS ESQUECE
 * =============================================================================
 * "Copiado" precisa aparecer, porque copiar é uma ação sem efeito visível — sem
 * a confirmação a pessoa clica três vezes por dúvida. E precisa SUMIR depois de
 * dois segundos: um "Copiado" permanente na tela deixa de dizer se foi o clique
 * de agora ou o de cinco minutos atrás.
 *
 * `navigator.clipboard` exige contexto seguro (HTTPS ou localhost). Em rede
 * local por HTTP ele não existe, e aí o `catch` diz o que fazer em vez de o
 * botão não responder e ninguém entender por quê.
 *
 * =============================================================================
 * POR QUE `wa.me` E NÃO A INTEGRAÇÃO DA CASA
 * =============================================================================
 * O sistema tem fila de WhatsApp pela uazapi, e ela é o caminho certo para
 * mensagem automática ao cliente. Aqui não serve: hoje o `UAZAPI_ADMIN_TOKEN`
 * está vazio e nenhum número está conectado, então um botão que dependesse da
 * fila entregaria silêncio — a pior resposta possível.
 *
 * `wa.me` é endereço comum: abre o WhatsApp de quem clicou, com o texto pronto,
 * e a pessoa escolhe o contato. Funciona sem integração, sem token e sem
 * servidor no meio.
 */
export default function Copiar({
  compacto = false,
  endereco,
  quem,
  mensagem,
}: {
  endereco: string
  quem: string
  /**
   * O texto do WhatsApp, quando o padrão não serve.
   *
   * O padrão manda "entre com o seu login", que é a verdade para os dois
   * aplicativos de campo e uma MENTIRA para o cliente: a página dele abre pelo
   * link, sem conta nenhuma. Mandar essa frase a quem não tem login é dar uma
   * instrução impossível de cumprir — e a pessoa conclui que o link está
   * quebrado, não que a frase é que estava errada.
   */
  mensagem?: string
  /**
   * O ENDEREÇO COLAPSA — e por que a regra de cima não vale em toda tela.
   *
   * A nota acima diz que o endereço fica visível porque alguém precisa DITAR
   * por telefone ao motorista na rua. Isso é verdade aqui em Aplicativos, onde
   * o endereço é `dtechmed.com.br/app` — curto, pronunciável, decorável.
   *
   * No Painel do cliente ele é outra coisa: um token de 60 caracteres
   * aleatórios, `/os/y1SoeZ-s7a3VZMkamOnz14pxQl8A1cm_VqqmZSXC6bU`. Ninguém dita
   * isso, ninguém confere isso de olho, e ele quebrava em duas linhas em alguns
   * cartões e uma em outros — era o maior elemento da tela sendo a informação
   * menos útil dela, e a causa direta de os cartões saírem com alturas
   * diferentes.
   *
   * Compacto, ele vira UMA linha que não quebra, com reticências no fim. Continua
   * selecionável e continua sendo o endereço de verdade — o que ele deixa de ser
   * é o protagonista.
   */
  compacto?: boolean
}) {
  const [copiou, setCopiou] = useState<'sim' | 'nao' | null>(null)

  const texto =
    mensagem ??
    `Oi! Este é o endereço do aplicativo do ${quem.toLowerCase()} da DTECH MED. Entre com o seu login: ${endereco}`

  async function copiar() {
    try {
      await navigator.clipboard.writeText(endereco)
      setCopiou('sim')
    } catch {
      // Contexto não seguro (HTTP em rede local) ou permissão negada. O texto
      // está na tela e dá para selecionar — é isso que a mensagem diz.
      setCopiou('nao')
    }
    setTimeout(() => setCopiou(null), 2400)
  }

  return (
    <>
      <p className={compacto ? estilo.enderecoCurto : estilo.enderecoApp}>
        <code title={endereco}>{endereco}</code>
      </p>

      <div className={estilo.modeloCartaoAcoes}>
        <button type="button" className={estilo.btnSec} onClick={copiar}>
          {copiou === 'sim' ? 'Copiado' : compacto ? 'Copiar o link' : 'Copiar endereço'}
        </button>
        <a
          className={estilo.btnSec}
          href={`https://wa.me/?text=${encodeURIComponent(texto)}`}
          target="_blank"
          rel="noreferrer"
        >
          {compacto ? 'WhatsApp' : 'Mandar no WhatsApp'}
        </a>
      </div>

      {copiou === 'nao' ? (
        <p className={estilo.dica} role="status">
          O navegador não deixou copiar sozinho — selecione o endereço acima e copie à mão.
        </p>
      ) : null}
    </>
  )
}
