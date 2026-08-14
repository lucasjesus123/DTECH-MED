/**
 * Ícones do site.
 *
 * Desenhados aqui, e não puxados de uma biblioteca, por dois motivos concretos:
 * nenhuma dependência a mais no pacote que o visitante baixa, e traço uniforme
 * — 1,5px, cantos arredondados, mesma caixa de 24 — que é o que faz um conjunto
 * de ícones parecer um conjunto, e não seis desenhos avulsos.
 *
 * Todos herdam `currentColor`, então mudam de cor com o texto ao redor sem
 * ninguém precisar lembrar de trocar nada.
 */

type Props = { className?: string }

const base = {
  width: 24,
  height: 24,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  focusable: false,
}

/** Chave de boca sobre um parafuso: o conserto do que já quebrou. */
export function IconeChave({ className }: Props) {
  return (
    <svg {...base} className={className}>
      <path d="M15.2 6.6a3.6 3.6 0 0 0 4.6 4.6l-8 8a2.4 2.4 0 0 1-3.4-3.4l8-8Z" />
      <path d="M15.2 6.6 17.6 4.2a4.8 4.8 0 0 1 2.2 8.6" />
      <circle cx="6.4" cy="17.6" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  )
}

/** Calendário com um dia marcado: a revisão que acontece antes da falha. */
export function IconeCalendario({ className }: Props) {
  return (
    <svg {...base} className={className}>
      <rect x="3.2" y="5" width="17.6" height="15.8" rx="2.4" />
      <path d="M3.2 9.8h17.6M8 3v4M16 3v4" />
      <path d="M8.6 14.4h2.2v2.2H8.6z" fill="currentColor" stroke="none" />
    </svg>
  )
}

/** Ponteiro de medição: a calibração, que é acerto fino e não conserto. */
export function IconeMedidor({ className }: Props) {
  return (
    <svg {...base} className={className}>
      <path d="M3.6 17.4a9 9 0 1 1 16.8 0" />
      <path d="M12 17.4 16 10.8" />
      <circle cx="12" cy="17.4" r="1.5" />
      <path d="M5.6 13.2h1.6M16.8 13.2h1.6M11.2 7.4h1.6" />
    </svg>
  )
}

/** Documento com selo: o laudo que vale para garantia e seguro. */
export function IconeLaudo({ className }: Props) {
  return (
    <svg {...base} className={className}>
      <path d="M14 3H7.2A2.2 2.2 0 0 0 5 5.2v13.6A2.2 2.2 0 0 0 7.2 21h9.6a2.2 2.2 0 0 0 2.2-2.2V8.2Z" />
      <path d="M14 3v5.2h5" />
      <path d="M8.6 12.6h6.8M8.6 16h4.2" />
    </svg>
  )
}

/** Caixa com fita: o transporte com embalagem e rastreio. */
export function IconeCaixa({ className }: Props) {
  return (
    <svg {...base} className={className}>
      <path d="M3.4 8.2 12 3.6l8.6 4.6v7.6L12 20.4l-8.6-4.6Z" />
      <path d="M3.4 8.2 12 12.8l8.6-4.6M12 12.8v7.6" />
      <path d="M7.7 5.9 16.3 10.5" />
    </svg>
  )
}

/** Escudo com confirmação: a garantia que a oficina assume. */
export function IconeEscudo({ className }: Props) {
  return (
    <svg {...base} className={className}>
      <path d="M12 3.2 4.8 6v5.6c0 4.4 3 8.2 7.2 9.2 4.2-1 7.2-4.8 7.2-9.2V6Z" />
      <path d="M9.2 12.2 11.3 14.4 15 10.4" />
    </svg>
  )
}

export const ICONES = {
  chave: IconeChave,
  calendario: IconeCalendario,
  medidor: IconeMedidor,
  laudo: IconeLaudo,
  caixa: IconeCaixa,
  escudo: IconeEscudo,
} as const

/**
 * Estrela cheia da avaliação.
 *
 * Preenchida, e não contornada como as demais: aqui a forma carrega um valor,
 * não uma categoria. Cinco estrelas contornadas leem como "cinco vazias".
 */
export function IconeEstrela({ className }: Props) {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      focusable={false}
      className={className}
    >
      <path d="M12 2.6l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5-5.8-3-5.8 3 1.1-6.5L2.6 9.4l6.5-.9Z" />
    </svg>
  )
}

/** Marca do Instagram, redesenhada no mesmo traço dos outros. */
export function IconeInstagram({ className }: Props) {
  return (
    <svg {...base} className={className}>
      <rect x="3.2" y="3.2" width="17.6" height="17.6" rx="5" />
      <circle cx="12" cy="12" r="4.1" />
      <circle cx="17.1" cy="6.9" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  )
}

/** Alfinete de mapa, para o bloco de endereço. */
export function IconeLocal({ className }: Props) {
  return (
    <svg {...base} className={className}>
      <path d="M12 21.2c4-4.2 6-7.6 6-10.2a6 6 0 1 0-12 0c0 2.6 2 6 6 10.2Z" />
      <circle cx="12" cy="10.8" r="2.4" />
    </svg>
  )
}

/**
 * O logotipo do WhatsApp.
 *
 * Este é o único ícone do conjunto que NÃO segue o traço da casa, e não é
 * descuido: é uma marca registrada, e marca registrada não se redesenha "no
 * nosso estilo". O desenho aproximado que estava aqui antes tinha o telefone
 * no lugar errado e o balão com o rabo do lado errado — ninguém reconhecia.
 *
 * Preenchido em vez de contornado, como o original. Herda `currentColor`, e
 * é isso que permite pintá-lo de escuro sobre o botão verde e de verde sobre
 * fundo escuro sem manter duas cópias.
 *
 * O uso é o permitido pela própria WhatsApp: identificar um canal de contato
 * pelo WhatsApp. Não vale colocá-lo como se fosse marca da empresa.
 */
export function IconeWhatsapp({ className }: Props) {
  return (
    <svg
      width={24}
      height={24}
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="none"
      aria-hidden
      focusable={false}
      className={className}
    >
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
    </svg>
  )
}

/** X de fechar. Traço grosso porque ele vive pequeno, dentro de um botão. */
export function IconeFechar({ className }: Props) {
  return (
    <svg {...base} strokeWidth={2} className={className}>
      <path d="M6.5 6.5 17.5 17.5M17.5 6.5 6.5 17.5" />
    </svg>
  )
}

/**
 * Seta do botão.
 *
 * Ela não existe para decorar: entra deslizando no hover e diz para onde o
 * clique leva. Um botão que só muda de cor no hover confirma que é clicável;
 * um que mostra a direção diz o que vai acontecer.
 */
export function IconeSeta({ className }: Props) {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable={false}
      className={className}
    >
      <path d="M5 12h13M13 6.5 18.5 12 13 17.5" />
    </svg>
  )
}
