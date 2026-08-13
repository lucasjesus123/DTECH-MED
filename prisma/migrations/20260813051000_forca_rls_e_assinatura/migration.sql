-- =============================================================================
-- Endurecimento: RLS obrigatório para todos, e assinatura imutável
-- =============================================================================
-- Duas lacunas encontradas na auditoria de segurança, com evidência registrada
-- em AUDITORIA_SEGURANCA.md (SEC-004 e SEC-006).
--
-- 1) FORCE ROW LEVEL SECURITY
--
--    No PostgreSQL, o DONO de uma tabela não é submetido às policies dela. As
--    tabelas pertencem a `dtechmed_owner`, então qualquer conexão com esse
--    papel enxergava e alterava tudo, de todas as franquias — sem erro, sem
--    aviso, sem rastro.
--
--    Medido antes desta migração:
--      dono, sem definir app.tenant_id ....... 4 ordens visíveis
--      aplicação, sem escopo ................. 0 ordens visíveis
--
--    Hoje isso é inofensivo porque a aplicação conecta como `dtechmed_app`.
--    Mas é uma condição frágil justamente no momento mais propenso a erro: o
--    `.env` de produção carrega AS DUAS urls, a do app e a do dono (usada
--    pelas migrações). Colar uma no lugar da outra desligaria o isolamento
--    inteiro em silêncio. Com FORCE, o erro de configuração vira erro visível
--    em vez de vazamento silencioso.
--
--    Migrações continuam funcionando: DDL não passa por RLS.
--
-- 2) UPDATE em `assinaturas`
--
--    A migração de endurecimento original revogou DELETE, mas não UPDATE. A
--    assinatura é a prova de que o cliente entregou o equipamento e de que
--    aprovou o orçamento — e o nome de quem assinou podia ser reescrito.
--    Os eventos da linha do tempo, ao lado, já estavam corretos.
--
--    Medido antes desta migração:
--      UPDATE em assinaturas ....... 1 linha alterada  ← conseguiu
--      UPDATE em eventos_ordem ..... permission denied ← barrado
--
--    Nenhum código do sistema atualiza assinatura. A revogação não quebra nada.
-- =============================================================================

-- ---- 1) RLS obrigatório, inclusive para o dono -----------------------------
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'tenants','usuarios','sessoes','clientes','equipamentos','ordens',
    'eventos_ordem','fotos','assinaturas','orcamentos','orcamento_itens',
    'pecas','movimentos_estoque','faturas','pagamentos','agendamentos',
    'documentos','outbox_jobs','mensagens_whatsapp','templates_mensagem',
    'whatsapp_instances','leads','audit_logs','contadores'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
  END LOOP;
END
$$;

-- ---- 2) Assinatura não se reescreve ----------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dtechmed_app') THEN
    EXECUTE 'REVOKE UPDATE ON assinaturas FROM dtechmed_app';
  END IF;
END
$$;
