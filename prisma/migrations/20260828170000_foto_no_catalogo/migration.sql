-- =============================================================================
-- FOTO NA PEÇA E NO EQUIPAMENTO — o catálogo passa a se reconhecer
-- =============================================================================
-- O sistema já guardava foto, e só sabia guardar foto DE ORDEM: `fotos.ordemId`
-- é NOT NULL, porque aquelas imagens existem para PROVAR o estado de um
-- aparelho num momento — o que chegou riscado, o que saiu funcionando.
--
-- A foto de catálogo é outra coisa. Ela não prova nada: ela IDENTIFICA. Serve
-- para o técnico achar a peça certa na prateleira sem decorar código, e para o
-- atendente reconhecer o equipamento que o cliente descreve por telefone.
--
-- -----------------------------------------------------------------------------
-- POR QUE COLUNA, E NÃO UMA TABELA DE FOTOS DE PEÇA
-- -----------------------------------------------------------------------------
-- Porque é UMA foto. Galeria é o que a ordem precisa — seis do recebimento,
-- as da execução, a do teste final — e ela já existe. Uma peça precisa da
-- imagem que responde "é esta?".
--
-- Uma tabela para guardar no máximo uma linha por peça acrescenta um JOIN em
-- toda listagem de estoque para buscar um dado que cabe na própria linha. E
-- convida ao "só mais uma foto", que é como um campo de identificação vira
-- galeria sem ninguém decidir que deveria virar.
--
-- Se um dia precisar de várias, a migração é acrescentar a tabela e mover estas
-- três colunas — o caminho de volta continua aberto.
--
-- -----------------------------------------------------------------------------
-- AS TRÊS COLUNAS, E POR QUE SÃO TRÊS
-- -----------------------------------------------------------------------------
--   fotoCaminho       o arquivo cheio, para quando alguém amplia
--   fotoCaminhoThumb  a miniatura, que é o que a listagem carrega
--   fotoHash          SHA-256 do conteúdo
--
-- A miniatura é coluna separada, e não derivada por convenção de nome, porque
-- convenção de nome quebra em silêncio: renomeia-se o padrão do arquivo e todas
-- as miniaturas do sistema somem sem um erro sequer.
--
-- O hash é o mesmo desenho das fotos de ordem: o nome do arquivo sai dele, então
-- conteúdo diferente vira endereço diferente e o cache do navegador nunca
-- entrega a imagem velha depois de trocar a foto.
--
-- Nenhuma é obrigatória. Peça sem foto é o estado normal de quem está começando
-- a cadastrar, e obrigar foto no cadastro faria alguém subir qualquer coisa só
-- para conseguir salvar.
-- =============================================================================

ALTER TABLE public.pecas
  ADD COLUMN IF NOT EXISTS "fotoCaminho"      text,
  ADD COLUMN IF NOT EXISTS "fotoCaminhoThumb" text,
  ADD COLUMN IF NOT EXISTS "fotoHash"         text;

ALTER TABLE public.equipamentos
  ADD COLUMN IF NOT EXISTS "fotoCaminho"      text,
  ADD COLUMN IF NOT EXISTS "fotoCaminhoThumb" text,
  ADD COLUMN IF NOT EXISTS "fotoHash"         text;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
-- Não muda nada: as duas tabelas já têm política por empresa, e coluna nova
-- entra sob a política que a linha já tem. Fica registrado porque a pergunta
-- "e o isolamento?" precisa ter resposta escrita em toda migração que mexe em
-- tabela de negócio — a que não tem é a que ninguém confere.
