/**
 * OS TIPOS DE DOCUMENTO QUE SE ESCREVEM — a parte pura.
 *
 * =============================================================================
 * POR QUE ISTO SAIU DE `server/consultas/modelos.ts`
 * =============================================================================
 * A lista dos tipos é um FATO, não uma consulta: nome, rótulo e a pergunta "este
 * texto é um tipo válido?". Ela morava junto das funções que leem o banco, e no
 * dia em que o editor de modelo — que roda no navegador — precisou perguntar
 * "qual é o tipo aberto?", o `import` arrastou `@/lib/db` junto, e com ele o
 * driver do PostgreSQL para dentro do pacote do cliente. O build parou com sete
 * erros de `Can't resolve 'dns'` — que é o Postgres tentando abrir soquete no
 * navegador.
 *
 * Aqui não há banco. `server/consultas/modelos.ts` reexporta tudo, então quem
 * importava de lá continua importando de lá — a fonte da verdade é uma só.
 */

export const TIPOS_MODELAVEIS = ['CONTRATO_PRESTACAO', 'NOTA_PROMISSORIA', 'ORDEM_SERVICO'] as const
export type TipoModelavel = (typeof TIPOS_MODELAVEIS)[number]

export const ROTULO_TIPO: Record<TipoModelavel, string> = {
  CONTRATO_PRESTACAO: 'Contratos',
  NOTA_PROMISSORIA: 'Notas promissórias',
  ORDEM_SERVICO: 'Ordem de serviço',
}

/** O singular, para quando a tela fala de UM. */
export const ROTULO_TIPO_UM: Record<TipoModelavel, string> = {
  CONTRATO_PRESTACAO: 'Contrato',
  NOTA_PROMISSORIA: 'Nota promissória',
  ORDEM_SERVICO: 'Ordem de serviço',
}

export function ehTipoModelavel(t: string): t is TipoModelavel {
  return (TIPOS_MODELAVEIS as readonly string[]).includes(t)
}
