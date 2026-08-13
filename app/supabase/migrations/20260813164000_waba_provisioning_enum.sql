-- Migration A: Adiciona o valor 'provisioning' ao enum waba_connect_status
-- IMPORTANTE: esta migration deve ser commitada isoladamente antes da Migration B
-- que usa 'provisioning' numa expressão de índice (limitação do PostgreSQL:
-- ADD VALUE não pode ser usado na mesma transação em que o valor foi criado).

ALTER TYPE public.waba_connect_status ADD VALUE IF NOT EXISTS 'provisioning' AFTER 'not_connected';
