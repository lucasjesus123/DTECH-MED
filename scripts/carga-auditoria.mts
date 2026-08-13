import 'dotenv/config'
import { Client } from 'pg'

/**
 * Gera volume realista para medir escalabilidade: 30 empresas, 5 usuários cada,
 * e ordens acumuladas como se o sistema rodasse há dois anos.
 *
 * Roda SÓ contra banco local. Não é seed de produção.
 */
if (!/@(127\.0\.0\.1|localhost)[:/]/.test(process.env.DIRECT_DATABASE_URL ?? '')) {
  throw new Error('Só contra banco local.')
}
const c = new Client({ connectionString: process.env.DIRECT_DATABASE_URL })
await c.connect()

const EMPRESAS = 30
const CLIENTES_POR_EMPRESA = 40
const ORDENS_POR_EMPRESA = 900   // ~450/ano, dois anos de operação

console.time('carga')
await c.query(`DELETE FROM tenants WHERE slug LIKE 'carga-%'`)

for (let e = 0; e < EMPRESAS; e++) {
  const t = `tcarga${e}`
  await c.query(
    `INSERT INTO tenants (id,slug,nome,ativo,bloqueado,plano,"corPrimaria","corSecundaria","criadoEm","atualizadoEm")
     VALUES ($1,$2,$3,true,false,'padrao','#4A0D8F','#1B5CFF',now(),now())`,
    [t, `carga-${e}`, `Franquia Carga ${e}`])

  await c.query(
    `INSERT INTO usuarios (id,"tenantId",nome,email,"senhaHash",papel,ativo,"trocarSenha","tentativasFalhas","criadoEm","atualizadoEm")
     SELECT $1 || '_u' || g, $1, 'Usuario ' || g, 'u' || g || '@carga' || $2 || '.test',
            '$argon2id$v=19$m=19456,t=2,p=1$aaaaaaaaaaaaaaaa$bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
            (ARRAY['ADMIN_EMPRESA','GESTOR','ATENDENTE','TECNICO','MOTORISTA'])[g]::"Papel",
            true,false,0,now(),now()
       FROM generate_series(1,5) g`, [t, String(e)])

  await c.query(
    `INSERT INTO clientes (id,"tenantId",tipo,nome,documento,"documentoHash",ativo,cidade,uf,"criadoEm","atualizadoEm")
     SELECT $1 || '_c' || g, $1, 'PJ', 'Clinica ' || g || ' da ' || $1,
            lpad((($2::bigint * 100000) + g)::text, 14, '0'), md5(g::text), true, 'Lajeado','RS', now(), now()
       FROM generate_series(1,$3) g`, [t, e, CLIENTES_POR_EMPRESA])

  await c.query(
    `INSERT INTO equipamentos (id,"tenantId","clienteId",marca,modelo,"numeroSerie","criadoEm","atualizadoEm")
     SELECT $1 || '_e' || g, $1, $1 || '_c' || (1 + (g % $2)),
            (ARRAY['Ibramed','WEM','Cristofoli','Medical San','HTM'])[1 + (g % 5)],
            'Modelo-' || (g % 30), 'NS' || $1 || '-' || g, now(), now()
       FROM generate_series(1,$2) g`, [t, CLIENTES_POR_EMPRESA])

  await c.query(
    `INSERT INTO ordens (id,"tenantId",numero,"clienteId","equipamentoId",etapa,"tokenPublico",
                         "defeitoRelatado",prioridade,origem,"viaCorreio","abertaEm","atualizadoEm")
     SELECT $1 || '_o' || g, $1, g,
            $1 || '_c' || (1 + (g % $2)), $1 || '_e' || (1 + (g % $2)),
            (ARRAY['ORDEM_RETIRADA_GERADA','RETIRADA_AGENDADA','EM_ROTA_RETIRADA','COLETADO',
                   'RECEBIDO_NA_EMPRESA','EM_ANALISE','ORCAMENTO_INTERNO','ORCAMENTO_ENVIADO',
                   'ORCAMENTO_APROVADO','EM_MANUTENCAO','MANUTENCAO_CONCLUIDA','FATURAMENTO',
                   'FATURADO','ENTREGUE','FINALIZADO'])[1 + (g % 15)]::"EtapaOrdem",
            $1 || '_tok' || g,
            'Defeito relatado numero ' || g || ' com texto de tamanho parecido com o real.',
            'NORMAL','SITE',false,
            now() - (g || ' hours')::interval, now() - (g || ' hours')::interval
       FROM generate_series(1,$3) g`, [t, CLIENTES_POR_EMPRESA, ORDENS_POR_EMPRESA])
}
console.timeEnd('carga')

const r = await c.query(`
  SELECT (SELECT count(*) FROM tenants) empresas,
         (SELECT count(*) FROM usuarios) usuarios,
         (SELECT count(*) FROM clientes) clientes,
         (SELECT count(*) FROM equipamentos) equipamentos,
         (SELECT count(*) FROM ordens) ordens,
         pg_size_pretty(pg_database_size(current_database())) tamanho`)
console.table(r.rows)
await c.query('ANALYZE')
await c.end()
