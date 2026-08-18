-- Fotos da COLETA, tiradas pelo motorista na casa do cliente.
--
-- O processo operacional prevê até 6 fotos no momento da retirada, e não havia
-- categoria para elas: o enum ia de RECEBIMENTO (o técnico, na bancada) direto
-- para ENTREGA. Na prática, o registro do estado em que o aparelho SAIU do
-- cliente não existia — e é justamente ele que resolve a discussão de "esse
-- risco já estava aí?".
--
-- `ADD VALUE IF NOT EXISTS` é idempotente: reaplicar não quebra.
ALTER TYPE "CategoriaFoto" ADD VALUE IF NOT EXISTS 'RETIRADA';
