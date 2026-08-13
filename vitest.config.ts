import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Os testes de módulo puro não tocam banco nem rede. Os que tocam ficam
    // em *.integracao.test.ts e rodam num alvo separado.
    exclude: ['**/node_modules/**', '**/*.integracao.test.ts'],
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
})
