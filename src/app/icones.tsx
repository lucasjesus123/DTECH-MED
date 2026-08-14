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

/** Balão do WhatsApp, no traço da casa. */
export function IconeZap({ className }: Props) {
  return (
    <svg {...base} className={className}>
      <path d="M3.6 20.4l1.3-4.2a8 8 0 1 1 3.1 3Z" />
      <path d="M9.1 9.2c.3 2.4 2.5 4.6 5 5 .8.1 1.4-.6 1.3-1.4l-.1-.6-1.9-.5-.8 1a6.3 6.3 0 0 1-2.2-2.2l1-.8-.5-1.9-.6-.1c-.8-.1-1.3.5-1.2 1.3Z" />
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
