import { defineConfig } from 'vitest/config'
import path from 'node:path'

/**
 * Alvo separado para os testes que tocam o banco.
 *
 * Eles compartilham um banco só e limpam as tabelas entre si, então rodam em
 * arquivo único e sem paralelismo — do contrário um teste apagaria os dados
 * que o outro está usando, e a suíte falharia de forma intermitente, que é o
 * pior tipo de falha.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.integracao.test.ts'],
    fileParallelism: false,
    sequence: { concurrent: false },
    testTimeout: 30_000,
    setupFiles: ['./vitest.setup.ts'],
  },
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
})
