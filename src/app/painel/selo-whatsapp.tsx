import Link from 'next/link'
import estilo from './painel.module.css'

/**
 * O SELO DO WHATSAPP NA BARRA DE CIMA.
 *
 * =============================================================================
 * O PROBLEMA QUE ELE RESOLVE
 * =============================================================================
 * A queda do número é a falha mais silenciosa do sistema. Quando a instância
 * desconecta, absolutamente nada muda na tela: a ordem anda, o orçamento salva,
 * o gestor aprova. O que para é o aviso ao cliente — e ele para sem erro, sem
 * alerta, engordando uma fila que ninguém tem motivo para abrir.
 *
 * Quem descobre é o cliente, ligando para perguntar por que ninguém avisou que
 * o aparelho ficou pronto. Dias depois.
 *
 * =============================================================================
 * POR QUE NA BARRA, E NÃO NA TELA DE WHATSAPP
 * =============================================================================
 * A tela de WhatsApp é visitada por quem já desconfia que algo está errado. Um
 * aviso ali chega para quem já sabe.
 *
 * O selo fica onde a pessoa já está — em toda tela, o dia inteiro, na altura
 * dos olhos. É o mesmo motivo de o painel do carro ter luz de óleo: ninguém vai
 * abrir o capô todo dia para conferir.
 *
 * =============================================================================
 * POR QUE O ESTADO BOM É DISCRETO E O RUIM NÃO É
 * =============================================================================
 * Conectado: um ponto verde e o número, sem moldura. É a situação de 99% dos
 * dias, e um selo verde gritando o dia inteiro vira parte do papel de parede —
 * aí, no dia em que ficar vermelho, ninguém repara na diferença.
 *
 * Desconectado: moldura, cor de alerta, texto por extenso, e é um LINK para a
 * tela que resolve. Um aviso que não leva à solução obriga a pessoa a procurar
 * onde arrumar, e é aí que ela desiste e deixa para depois.
 */
export default function SeloWhatsapp({
  estado,
}: {
  estado: { status: string; numero: string | null } | null
}) {
  // Dono da plataforma fora de uma visita: ele não tem número. Um selo
  // "desconectado" ali seria simplesmente falso.
  if (!estado) return null

  const conectada = estado.status === 'CONECTADA'

  if (conectada) {
    return (
      <span className={estilo.zapOk} title={`WhatsApp conectado${estado.numero ? `: ${estado.numero}` : ''}`}>
        <i className={estilo.zapPonto} aria-hidden="true" />
        <span className={estilo.zapTxt}>{formatarNumero(estado.numero) ?? 'WhatsApp conectado'}</span>
      </span>
    )
  }

  const semInstancia = estado.status === 'SEM_INSTANCIA'

  return (
    <Link
      href="/painel/whatsapp"
      className={semInstancia ? estilo.zapFalta : estilo.zapCaiu}
      // O `title` repete porque no celular o texto é cortado — e é justamente
      // no celular que alguém vai ler isto correndo.
      title={
        semInstancia
          ? 'Nenhum número conectado. Os avisos ao cliente não saem.'
          : 'O WhatsApp caiu. Os avisos ao cliente estão parados na fila.'
      }
    >
      <i className={estilo.zapPonto} aria-hidden="true" />
      <span className={estilo.zapTxt}>
        {semInstancia ? 'WhatsApp não conectado' : 'WhatsApp caiu'}
      </span>
    </Link>
  )
}

/** 5551980449274 → (51) 98044-9274. Número cru na barra ninguém lê. */
function formatarNumero(bruto: string | null): string | null {
  if (!bruto) return null
  const d = bruto.replace(/\D/g, '')
  const semDdi = d.startsWith('55') && d.length > 11 ? d.slice(2) : d
  if (semDdi.length === 11) return `(${semDdi.slice(0, 2)}) ${semDdi.slice(2, 7)}-${semDdi.slice(7)}`
  if (semDdi.length === 10) return `(${semDdi.slice(0, 2)}) ${semDdi.slice(2, 6)}-${semDdi.slice(6)}`
  return bruto
}
