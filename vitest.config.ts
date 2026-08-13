import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Os testes de módulo puro não tocam banco nem rede. Os que tocam ficam
    // em *.integracao.test.ts e rodam num alvo separado.
    exclude: ['**/node_modules/**', '**/*.integracao.test.ts'],
    // Carrega o .env: os módulos de criptografia validam a configuração na
    // importação, e é exatamente esse comportamento que se quer manter — um
    // segredo ausente precisa quebrar cedo, inclusive no teste.
    setupFiles: ['./vitest.setup.ts'],
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
})
