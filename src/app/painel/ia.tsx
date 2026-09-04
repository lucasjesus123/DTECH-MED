import Link from 'next/link'
import type { Fonte } from '@/server/ia/contrato'
import estilo from './painel.module.css'

/**
 * AS PEÇAS DE INFERÊNCIA — o primeiro teal do sistema.
 *
 * =============================================================================
 * ATÉ AQUI, O TEAL FOI GUARDADO DE PROPÓSITO
 * =============================================================================
 * Nas seis fases anteriores ele foi recusado três vezes: no halo da aura, no
 * selo de gargalo da esteira e no chip "ao vivo" do cabeçalho. Nos três casos
 * a informação era aritmética — um max(), uma média, um "os dados são de
 * agora" — e nenhuma delas é conclusão da máquina.
 *
 * Isto aqui é. E é por isso que ele existe: quando o operador vir teal pela
 * primeira vez, ele estará olhando para a única coisa da tela que o sistema
 * DEDUZIU em vez de ter registrado. Se o teal já estivesse gasto em enfeite,
 * essa distinção não existiria mais.
 *
 * =============================================================================
 * AS TRÊS PEÇAS SÃO OBRIGATÓRIAS JUNTAS
 * =============================================================================
 * Selo, confiança e fonte. Não há caminho que renderize uma inferência sem as
 * três, e isso é do TIPO, não da boa vontade de quem escreve a tela: o
 * `Inferencia<T>` do servidor não compila sem `confianca`, `base` e `fontes`.
 *
 * A regra em uma frase: se não dá para clicar e conferir, não pode ser
 * afirmado.
 */

/**
 * O SELO — `⌁ PREVISÃO`.
 *
 * O glifo é decoração declarada; quem ouve a tela ouve "previsão", e não
 * "raio previsão". A palavra é o que carrega o sentido, e ela é escrita em
 * caixa normal no HTML — a caixa alta é do CSS, porque leitor de tela soletra
 * "PREVISÃO" letra por letra em vários motores.
 */
export function SeloIA({ children }: { children: React.ReactNode }) {
  return (
    <p className={estilo.seloIa}>
      <span className={estilo.seloIaGlifo} aria-hidden="true">
        ⌁
      </span>
      <span>{children}</span>
    </p>
  )
}

/**
 * A CONFIANÇA — barra, percentual e a base do cálculo.
 *
 * =============================================================================
 * ELA NÃO É A PROBABILIDADE, E A TELA TEM DE DEIXAR ISSO ÓBVIO
 * =============================================================================
 * São dois números fáceis de confundir e com significados opostos: "76% de
 * chance de estourar" é o que o modelo aponta; "confiança 68%" é o quanto esse
 * apontamento vale. Uma previsão de 90% com confiança de 20% quer dizer "o
 * modelo grita, e mal tem base para gritar".
 *
 * Por isso a confiança aparece SEMPRE colada à base em português — "14 O.S.
 * concluídas no histórico" — e nunca sozinha como um número solto. É a base
 * que transforma o percentual em algo que dá para discutir.
 */
export function Confianca({ valor, base }: { valor: number; base: string }) {
  const pct = Math.round(valor * 100)
  return (
    <div className={estilo.confianca}>
      <div className={estilo.confiancaCab}>
        <span>Confiança</span>
        <strong>{pct}%</strong>
      </div>
      <div
        className={estilo.confiancaTrilho}
        role="meter"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Confiança da previsão: ${pct} por cento. Base: ${base}`}
      >
        <i style={{ width: `${pct}%` }} />
      </div>
      <p className={estilo.confiancaBase}>{base}</p>
    </div>
  )
}

/**
 * O CHIP DE FONTE — a origem, clicável.
 *
 * É a peça que separa "o sistema acha" de "o sistema mostra por quê". Cada
 * chip abre a O.S. que sustenta o número: quem duvidar da previsão pode ir
 * conferir a evidência em um clique, e é essa possibilidade — mais do que o
 * ato — que faz o número ser levado a sério.
 */
export function ChipsDeFonte({ fontes }: { fontes: Fonte[] }) {
  if (fontes.length === 0) return null
  return (
    <ul className={estilo.fontes} aria-label="Fontes desta previsão">
      {fontes.map((f) => (
        <li key={f.href + f.rotulo}>
          <Link href={f.href} className={estilo.fonte}>
            {f.rotulo}
          </Link>
        </li>
      ))}
    </ul>
  )
}

/**
 * A BARRA DE RISCO.
 *
 * =============================================================================
 * A COR VEM DA FAIXA, E A FAIXA TEM NOME
 * =============================================================================
 * Percentual sozinho não decide nada: "62%" exige que a pessoa saiba de cor
 * onde fica o corte. A barra é dividida em três faixas com nome — provável,
 * incerto, improvável — e a cor segue o ESTADO, não a inferência: âmbar e
 * vermelho porque exigem ação, neutro quando não exigem.
 *
 * O TEAL NÃO ENTRA AQUI, e a razão é fina. O selo lá em cima já disse que a
 * linha inteira é inferência; pintar também a barra de teal misturaria as duas
 * escalas que o operador precisa ler separadas — "isto é conclusão da máquina"
 * e "isto é grave". A barra fala de gravidade.
 *
 * E o estado nunca é comunicado só por cor: o rótulo em texto vai junto.
 */
export function BarraDeRisco({ valor }: { valor: number }) {
  const pct = Math.round(valor * 100)
  const faixa = pct >= 60 ? 'provável' : pct >= 30 ? 'incerto' : 'improvável'
  const classe =
    pct >= 60 ? estilo.riscoAlto : pct >= 30 ? estilo.riscoMedio : estilo.riscoBaixo

  return (
    <div className={estilo.risco}>
      <div className={estilo.riscoTopo}>
        <strong className={classe}>{pct}%</strong>
        <span className={estilo.riscoFaixa}>{faixa}</span>
      </div>
      <div className={estilo.riscoTrilho} aria-hidden="true">
        <i className={classe} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

/**
 * A RECUSA — o que a tela mostra quando o modelo não sabe.
 *
 * =============================================================================
 * ESTE COMPONENTE É A PARTE MAIS IMPORTANTE DO ARQUIVO
 * =============================================================================
 * Um estimador que sempre responde é um estimador que mente quando não sabe, e
 * a mentira é silenciosa: a tela mostra "76%" e nada denuncia que aquilo saiu
 * de três observações.
 *
 * Então a recusa tem lugar próprio, e ela é uma resposta — não um erro, não um
 * vazio. Ela diz o que falta e, quando dá, quanto falta: "são 5 O.S.
 * concluídas no histórico, e o modelo só abre a boca a partir de 8". Quem lê
 * entende que o sistema vai passar a prever sozinho conforme a empresa
 * trabalha, e que não há nada quebrado.
 *
 * Ela é CINZA, e não teal: não há inferência aqui para marcar. Marcá-la de
 * teal seria usar a tinta de conclusão para dizer que não houve conclusão.
 */
export function SemBase({ motivo }: { motivo: string }) {
  return (
    <div className={estilo.semBase}>
      <p className={estilo.semBaseTitulo}>Ainda sem base para prever</p>
      <p className={estilo.semBaseTexto}>{motivo}</p>
    </div>
  )
}
