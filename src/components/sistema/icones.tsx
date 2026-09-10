/**
 * OS ÍCONES DO SISTEMA NOVO.
 *
 * =============================================================================
 * POR QUE DESENHADOS AQUI, E NÃO UMA BIBLIOTECA
 * =============================================================================
 * Mesma razão que o sistema antigo já registrou: glifo Unicode depende da fonte
 * instalada, muda de forma entre Windows, Mac e Android, e alguns viram
 * quadrado vazio. Biblioteca resolve isso e traz outro problema — um pacote
 * inteiro no navegador de quem só precisa de quatorze desenhos.
 *
 * Estes catorze compartilham a mesma caixa de 24, o mesmo traço de 1,6 e as
 * mesmas pontas arredondadas. Parecem uma família porque são.
 *
 * `currentColor` em tudo: o ícone é da cor do texto ao lado dele, sempre. É o
 * que faz o item ativo do menu acender inteiro — rótulo e ícone juntos — sem
 * uma única regra de cor escrita aqui.
 */

const T = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

/** Painel: o radar — o sistema varrendo e apontando o que fazer. */
const Painel = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...T}>
    <circle cx="12" cy="12" r="8.2" />
    <circle cx="12" cy="12" r="3.4" />
    <path d="M12 12 17.8 6.2" />
    <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
  </svg>
)

/** Ordens: folhas empilhadas — a esteira de papéis que anda. */
const Ordens = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...T}>
    <path d="M7 4h7l4 4v11a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z" />
    <path d="M14 4v4h4M9 13h6M9 16.5h4" />
  </svg>
)

/** Bancada: a mesa com o aparelho aberto em cima. */
const Bancada = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...T}>
    <rect x="5" y="5.5" width="14" height="9" rx="1.6" />
    <path d="M8.5 9h4M8.5 11.5h2" />
    <path d="M3.5 18h17M6.5 18v2.5M17.5 18v2.5" />
  </svg>
)

/** Rotas: o caminho com duas paradas. */
const Rotas = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...T}>
    <circle cx="6" cy="7" r="2.2" />
    <circle cx="18" cy="17" r="2.2" />
    <path d="M6 9.2v3.3a3 3 0 0 0 3 3h6" />
  </svg>
)

/** Clientes: duas pessoas. */
const Clientes = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...T}>
    <circle cx="9.5" cy="8.5" r="3" />
    <path d="M4 19a5.5 5.5 0 0 1 11 0" />
    <path d="M16 6.2a3 3 0 0 1 0 5.6M17.5 19a5.5 5.5 0 0 0-2-4.2" />
  </svg>
)

/** Equipamentos: o aparelho com visor. */
const Equipamentos = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...T}>
    <rect x="3.5" y="5" width="17" height="12" rx="1.6" />
    <path d="M7 9h6M7 12h3" />
    <path d="M9 20h6" />
  </svg>
)

/** Conferência: o visto sobre a folha — alguém olhou e liberou. */
const Conferencia = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...T}>
    <path d="M6 4.5h9l3.5 3.5V19a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5.5a1 1 0 0 1 1-1Z" />
    <path d="M15 4.5v3.5h3.5" />
    <path d="M8.5 14.2 10.8 16.5l4.4-4.6" />
  </svg>
)

/** Financeiro: a nota com o valor. */
const Financeiro = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...T}>
    <rect x="3.5" y="6" width="17" height="12" rx="1.6" />
    <circle cx="12" cy="12" r="2.4" />
    <path d="M6.5 12h.01M17.5 12h.01" />
  </svg>
)

/** Preventiva: o calendário que volta sozinho. */
const Preventiva = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...T}>
    <rect x="3.5" y="5.5" width="17" height="14" rx="1.8" />
    <path d="M3.5 9.5h17M8 3.8v3.4M16 3.8v3.4" />
    <path d="M9 15.2a3 3 0 1 0 .9-2.1" />
    <path d="M9.4 10.9v2.4h2.4" />
  </svg>
)

/** Relatórios: as barras que sobem. */
const Relatorios = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...T}>
    <path d="M4 20h16" />
    <path d="M7 20v-5.5M12 20V8M17 20v-8.5" />
  </svg>
)

/** Modelos: a folha com o campo variável marcado. */
const Modelos = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...T}>
    <rect x="4.5" y="4" width="15" height="16" rx="1.8" />
    <path d="M8 8.5h5M8 12h8M8 15.5h4" />
    <rect x="14.5" y="7" width="4" height="3" rx="1" fill="currentColor" stroke="none" opacity=".5" />
  </svg>
)

/** Usuários e papéis: a pessoa com o crachá. */
const Usuarios = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...T}>
    <circle cx="10" cy="8.5" r="3.2" />
    <path d="M4.2 19.5a5.8 5.8 0 0 1 11.6 0" />
    <path d="M16.5 10.5h4M16.5 13.5h2.5" />
  </svg>
)

/** Integrações: dois elos ligados. */
const Integracoes = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...T}>
    <path d="M10.5 13.5a3.4 3.4 0 0 0 5 .4l2-2a3.4 3.4 0 0 0-4.8-4.8l-1.1 1.1" />
    <path d="M13.5 10.5a3.4 3.4 0 0 0-5-.4l-2 2a3.4 3.4 0 0 0 4.8 4.8l1.1-1.1" />
  </svg>
)

/** Configurações: o disco com o ajuste. */
const Config = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...T}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 3.5v2.2M12 18.3v2.2M20.5 12h-2.2M5.7 12H3.5M18 6l-1.6 1.6M7.6 16.4 6 18M18 18l-1.6-1.6M7.6 7.6 6 6" />
  </svg>
)

// --- App de campo: os cinco da bottom-nav -----------------------------------

/** Tarefas: a lista com o item da vez marcado. */
const Tarefas = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...T}>
    <path d="M9 6.5h10M9 12h10M9 17.5h6" />
    <path d="M4.2 6.2l1.2 1.2 2-2.2" />
    <circle cx="5.2" cy="12" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="5.2" cy="17.5" r="1.1" />
  </svg>
)

/** Agenda: o calendário do dia. */
const Agenda = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...T}>
    <rect x="3.5" y="5.5" width="17" height="14" rx="1.8" />
    <path d="M3.5 9.5h17M8 3.8v3.4M16 3.8v3.4" />
    <rect x="7" y="12.5" width="4" height="3.5" rx="1" fill="currentColor" stroke="none" opacity=".55" />
  </svg>
)

/** Mapa: o alfinete no mapa dobrado. */
const Mapa = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...T}>
    <path d="M9 4.5 3.8 6.6v13L9 17.4l6 2.1 5.2-2.1v-13L15 6.6Z" />
    <path d="M9 4.5v12.9M15 6.6v12.9" />
  </svg>
)

/** SOS: o aviso. Triangular de propósito — é a forma que o mundo lê como perigo. */
const Sos = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...T}>
    <path d="M12 4.2 21 19.4H3Z" />
    <path d="M12 10v4" />
    <circle cx="12" cy="16.6" r="1" fill="currentColor" stroke="none" />
  </svg>
)

/** Perfil: a pessoa. */
const Perfil = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...T}>
    <circle cx="12" cy="8.5" r="3.4" />
    <path d="M5.5 20a6.5 6.5 0 0 1 13 0" />
  </svg>
)

export const ICONES = {
  painel: Painel,
  ordens: Ordens,
  bancada: Bancada,
  rotas: Rotas,
  clientes: Clientes,
  equipamentos: Equipamentos,
  conferencia: Conferencia,
  financeiro: Financeiro,
  preventiva: Preventiva,
  relatorios: Relatorios,
  modelos: Modelos,
  usuarios: Usuarios,
  integracoes: Integracoes,
  config: Config,
  tarefas: Tarefas,
  agenda: Agenda,
  mapa: Mapa,
  sos: Sos,
  perfil: Perfil,
} as const

export type NomeIcone = keyof typeof ICONES

/** O ícone pelo nome. Um lugar só que sabe traduzir nome em desenho. */
export function Icone({ nome }: { nome: NomeIcone }) {
  const D = ICONES[nome]
  return <D />
}
