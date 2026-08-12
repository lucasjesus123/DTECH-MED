import 'dotenv/config'
import path from 'node:path'
import { defineConfig } from 'prisma/config'

/**
 * Configuração do Prisma 7.
 *
 * As URLs vivem aqui (não no schema) e são deliberadamente DUAS:
 *
 *  - `DATABASE_URL`        → runtime da aplicação. Usuário SEM BYPASSRLS e sem
 *                            poder de DDL. É o usuário que o RLS realmente
 *                            constrange.
 *  - `DIRECT_DATABASE_URL` → migrações. Usuário dono do schema, usado só pelo
 *                            CLI, nunca pelo servidor web.
 *
 * Separar os dois é o que impede que uma falha na aplicação vire alteração de
 * estrutura — e é o que faz o RLS não ser contornável pelo próprio app.
 */
export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  migrations: {
    path: path.join('prisma', 'migrations'),
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL ?? '',
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
  },
})
