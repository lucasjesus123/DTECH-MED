import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTypescript from 'eslint-config-next/typescript'

/**
 * Configuração do ESLint.
 *
 * ---------------------------------------------------------------------------
 * POR QUE ESTE ARQUIVO PASSOU A EXISTIR
 * ---------------------------------------------------------------------------
 * O `package.json` chamava `next lint`, que o Next 16 REMOVEU. O comando não
 * falhava dizendo "não existe mais": ele lia "lint" como se fosse a pasta do
 * projeto e respondia
 *
 *     Invalid project directory provided, no such directory: .../lint
 *
 * Ou seja, `npm run lint` vinha errando desde a subida para o 16 — e como
 * `next build` também parou de rodar lint nessa versão, nenhuma regra estava
 * sendo aplicada em lugar nenhum. A documentação da própria versão instalada
 * confirma os dois fatos, em
 * `node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md`:
 *
 *     The `next lint` command has been removed. Use Biome or ESLint directly.
 *     `next build` no longer runs linting.
 *
 * O formato abaixo é o que a documentação da versão instalada manda usar
 * (`03-api-reference/05-config/03-eslint.md`): `core-web-vitals` como base e
 * `typescript` por cima.
 *
 * ---------------------------------------------------------------------------
 * O QUE FICA DE FORA, E POR QUÊ
 * ---------------------------------------------------------------------------
 * `src/generated/prisma` é código que a máquina escreve e reescreve a cada
 * `prisma generate`. Analisá-lo não conserta nada — ninguém edita aquilo — e
 * enche o relatório de ruído que esconde o achado de verdade.
 */
export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  globalIgnores([
    // Os padrões do próprio eslint-config-next, que precisam ser repetidos
    // porque declarar `globalIgnores` substitui a lista dele.
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    // Os nossos.
    'src/generated/**',
    'worker/dist/**',
    'public/**',
    // A bateria de ensaio. São roteiros de Node que dirigem um navegador, não
    // código do sistema: eles não vão para produção, não são importados por
    // nada, e o estilo deles é deliberadamente diferente — `cond ? ok() : nao()`
    // como linha inteira lê melhor num roteiro de conferência do que um `if`
    // de três linhas, e é exatamente o que `no-unused-expressions` reclama.
    // A trava que importa neles é `node --check`, que a própria bateria roda.
    'qa/**',
  ]),
  {
    rules: {
      // Variável não usada é quase sempre resto de refatoração — o `prisma`
      // importado e nunca chamado em `sessao.ts` era exatamente isso. O prefixo
      // `_` continua liberado para o argumento que a assinatura exige e o corpo
      // ignora, como o `_anterior` das server actions.
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
    },
  },
])
