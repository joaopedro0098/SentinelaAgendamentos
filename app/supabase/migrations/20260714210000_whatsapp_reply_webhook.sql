-- Webhook de respostas do paciente via WhatsApp (Twilio):
--   1) WhatsApp por profissional (staff/barbeiros)
--   2) Rastreamento de mensagens enviadas (lembrete D-1 + alerta ao profissional)
--   3) Alertas de agendamento (cancelamento/alteração pedidos pelo paciente)
--   4) Log interno de uso de mensageria (base para billing — Stripe Meter Events fica para depois)
--   5) RPCs de painel (listar/resolver alertas + has_pending_alert em get_agendamentos_painel)

-- =============================================================================
-- 1. WhatsApp por profissional
-- =============================================================================

ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS whatsapp text;

COMMENT ON COLUMN public.staff.whatsapp IS
  'WhatsApp do profissional (somente dígitos, com DDI) — recebe alertas de cancelamento/alteração via Twilio.';

ALTER TABLE public.barbeiros
  ADD COLUMN IF NOT EXISTS whatsapp text;

COMMENT ON COLUMN public.barbeiros.whatsapp IS
  'Espelho de staff.whatsapp, sincronizado por ensure_agenda_from_barbershop_slug.';

-- Reescreve a bridge staff -> barbeiros incluindo o whatsapp do profissional.
CREATE OR REPLACE FUNCTION public.ensure_agenda_from_barbershop_slug(p_slug text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _shop record;
  _barbearia_id uuid;
  _staff record;
  _barbeiro_id uuid;
  _slot_minutes int;
BEGIN
  SELECT
    id,
    slug,
    display_name,
    avatar_url,
    owner_id,
    slot_interval_minutes,
    allow_client_self_service,
    allow_client_public_booking,
    show_service_prices
  INTO _shop
  FROM public.barbershops
  WHERE slug = trim(p_slug)
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  _slot_minutes := public.effective_slot_interval_minutes_for_shop(_shop.id);

  INSERT INTO public.barbearias (
    slug,
    nome,
    logo_url,
    owner_id,
    ativa,
    allow_client_self_service,
    allow_client_public_booking,
    show_service_prices
  )
  VALUES (
    _shop.slug,
    _shop.display_name,
    COALESCE(_shop.avatar_url, ''),
    _shop.owner_id,
    true,
    COALESCE(_shop.allow_client_self_service, true),
    COALESCE(_shop.allow_client_public_booking, true),
    COALESCE(_shop.show_service_prices, false)
  )
  ON CONFLICT (slug) DO UPDATE SET
    nome = EXCLUDED.nome,
    logo_url = EXCLUDED.logo_url,
    owner_id = EXCLUDED.owner_id,
    ativa = true,
    allow_client_self_service = EXCLUDED.allow_client_self_service,
    allow_client_public_booking = EXCLUDED.allow_client_public_booking,
    show_service_prices = EXCLUDED.show_service_prices,
    updated_at = now()
  RETURNING id INTO _barbearia_id;

  DELETE FROM public.barbeiros
  WHERE barbearia_id = _barbearia_id
    AND staff_id IS NULL;

  FOR _staff IN
    SELECT id, name, whatsapp FROM public.staff
    WHERE barbershop_id = _shop.id AND is_active = true
    ORDER BY sort_order, name
  LOOP
    INSERT INTO public.barbeiros (barbearia_id, nome, ativo, staff_id, slot_minutos, whatsapp)
    VALUES (_barbearia_id, _staff.name, true, _staff.id, _slot_minutes, _staff.whatsapp)
    ON CONFLICT (staff_id) DO UPDATE SET
      barbearia_id = EXCLUDED.barbearia_id,
      nome = EXCLUDED.nome,
      ativo = true,
      slot_minutos = EXCLUDED.slot_minutos,
      whatsapp = EXCLUDED.whatsapp
    RETURNING id INTO _barbeiro_id;

    DELETE FROM public.barbeiro_services WHERE barbeiro_id = _barbeiro_id;
    INSERT INTO public.barbeiro_services (barbeiro_id, nome, duracao_minutos, preco_centavos, ativo)
    SELECT _barbeiro_id, ss.name, ss.duration_minutes, COALESCE(ss.price_cents, 0), true
    FROM public.staff_services ss
    WHERE ss.staff_id = _staff.id;

    DELETE FROM public.disponibilidades WHERE barbeiro_id = _barbeiro_id;
    INSERT INTO public.disponibilidades (barbeiro_id, dia_semana, hora_inicio, hora_fim)
    SELECT _barbeiro_id, sch.day_of_week, sch.start_time, sch.end_time
    FROM public.staff_schedules sch
    WHERE sch.staff_id = _staff.id;
  END LOOP;

  RETURN _barbearia_id;
END;
$$;

COMMENT ON FUNCTION public.ensure_agenda_from_barbershop_slug(text) IS
  'Sincroniza barbearia/barbeiros da agenda, incluindo WhatsApp do profissional (staff.whatsapp -> barbeiros.whatsapp).';

-- =============================================================================
-- 2. Rastreamento de mensagens WhatsApp enviadas (lembrete D-1 e alerta ao profissional)
-- =============================================================================

ALTER TABLE public.agendamentos
  ADD COLUMN IF NOT EXISTS reminder_whatsapp_sent_at timestamptz;

COMMENT ON COLUMN public.agendamentos.reminder_whatsapp_sent_at IS
  'Quando o lembrete D-1 via WhatsApp (Twilio, com botões Confirmar/Alterar/Cancelar) foi enviado ao paciente.';

CREATE TABLE IF NOT EXISTS public.whatsapp_mensagens_enviadas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agendamento_id uuid NOT NULL REFERENCES public.agendamentos(id) ON DELETE CASCADE,
  barbearia_id uuid NOT NULL REFERENCES public.barbearias(id) ON DELETE CASCADE,
  telefone text NOT NULL,
  tipo text NOT NULL DEFAULT 'lembrete_d1'
    CHECK (tipo IN ('lembrete_d1', 'alerta_profissional')),
  twilio_message_sid text,
  status text NOT NULL DEFAULT 'aguardando_resposta'
    CHECK (status IN ('aguardando_resposta', 'respondida', 'expirada')),
  enviado_em timestamptz NOT NULL DEFAULT now(),
  respondido_em timestamptz
);

COMMENT ON TABLE public.whatsapp_mensagens_enviadas IS
  'Toda mensagem de template WhatsApp (Twilio) disparada pelo backend. Usada para casar a resposta do webhook '
  'com o agendamento (telefone + status=aguardando_resposta mais recente).';

CREATE INDEX IF NOT EXISTS idx_whatsapp_msg_telefone_status
  ON public.whatsapp_mensagens_enviadas (telefone, status, enviado_em DESC);

CREATE INDEX IF NOT EXISTS idx_whatsapp_msg_agendamento
  ON public.whatsapp_mensagens_enviadas (agendamento_id);

ALTER TABLE public.whatsapp_mensagens_enviadas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "no public whatsapp mensagens enviadas" ON public.whatsapp_mensagens_enviadas;
CREATE POLICY "no public whatsapp mensagens enviadas"
  ON public.whatsapp_mensagens_enviadas FOR ALL USING (false) WITH CHECK (false);

-- =============================================================================
-- 3. Alertas de agendamento (cancelamento/alteração solicitados pelo paciente)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.alertas_agendamento (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agendamento_id uuid NOT NULL REFERENCES public.agendamentos(id) ON DELETE CASCADE,
  barbearia_id uuid NOT NULL REFERENCES public.barbearias(id) ON DELETE CASCADE,
  barbeiro_id uuid REFERENCES public.barbeiros(id) ON DELETE SET NULL,
  tipo text NOT NULL CHECK (tipo IN ('cancelamento', 'alteracao')),
  mensagem text NOT NULL,
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'resolvido')),
  criado_em timestamptz NOT NULL DEFAULT now(),
  resolvido_em timestamptz
);

COMMENT ON TABLE public.alertas_agendamento IS
  'Alerta criado quando o paciente responde "Cancelar" ou "Alterar" no WhatsApp. '
  'Não altera o status do agendamento automaticamente — fica a critério do profissional.';

CREATE INDEX IF NOT EXISTS idx_alertas_agendamento_agendamento
  ON public.alertas_agendamento (agendamento_id, criado_em DESC);

CREATE INDEX IF NOT EXISTS idx_alertas_agendamento_pendente
  ON public.alertas_agendamento (agendamento_id)
  WHERE status = 'pendente';

ALTER TABLE public.alertas_agendamento ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "no public alertas agendamento" ON public.alertas_agendamento;
CREATE POLICY "no public alertas agendamento"
  ON public.alertas_agendamento FOR ALL USING (false) WITH CHECK (false);

-- =============================================================================
-- 4. Log interno de uso de mensageria (billing)
-- =============================================================================
-- TODO(billing-stripe-meter): Quando o Meter for criado no Stripe Dashboard, a função
-- `registrar_uso_mensageria` abaixo — chamada SEMPRE pelo shared helper único
-- `registrarUsoMensageria()` (app/supabase/functions/_shared/whatsappUsageLog.ts) — deve
-- passar a também chamar `stripe.billing.meterEvents.create(...)` usando
-- STRIPE_USAGE_METER_EVENT_NAME. Por enquanto só grava este log interno. NÃO espalhe
-- chamadas de billing em outros arquivos: tudo passa por esse único ponto.

CREATE TABLE IF NOT EXISTS public.whatsapp_usage_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  barbearia_id uuid NOT NULL REFERENCES public.barbearias(id) ON DELETE CASCADE,
  profissional_id uuid REFERENCES public.barbeiros(id) ON DELETE SET NULL,
  agendamento_id uuid REFERENCES public.agendamentos(id) ON DELETE SET NULL,
  tipo text NOT NULL CHECK (tipo IN ('lembrete_d1', 'alerta_profissional')),
  twilio_message_sid text,
  criado_em timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.whatsapp_usage_log IS
  'Log interno de toda mensagem WhatsApp disparada pelo backend, para cobrança futura via Stripe Meter Events. '
  'Ver TODO(billing-stripe-meter) na função registrar_uso_mensageria.';

CREATE INDEX IF NOT EXISTS idx_whatsapp_usage_log_barbearia
  ON public.whatsapp_usage_log (barbearia_id, criado_em DESC);

ALTER TABLE public.whatsapp_usage_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "no public whatsapp usage log" ON public.whatsapp_usage_log;
CREATE POLICY "no public whatsapp usage log"
  ON public.whatsapp_usage_log FOR ALL USING (false) WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.registrar_uso_mensageria(
  p_barbearia_id uuid,
  p_tipo text,
  p_profissional_id uuid DEFAULT NULL,
  p_agendamento_id uuid DEFAULT NULL,
  p_twilio_message_sid text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id uuid;
BEGIN
  -- TODO(billing-stripe-meter): ver comentário acima da tabela whatsapp_usage_log.
  INSERT INTO public.whatsapp_usage_log (barbearia_id, profissional_id, agendamento_id, tipo, twilio_message_sid)
  VALUES (p_barbearia_id, p_profissional_id, p_agendamento_id, p_tipo, p_twilio_message_sid)
  RETURNING id INTO _id;

  RETURN _id;
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_uso_mensageria(uuid, text, uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registrar_uso_mensageria(uuid, text, uuid, uuid, text) TO service_role;

-- =============================================================================
-- 5. RPCs de painel: alertas de agendamento
-- =============================================================================

CREATE OR REPLACE FUNCTION public.list_agendamento_alerts(p_agendamento_id uuid)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _barbearia_ids uuid[];
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('error', 'not_authenticated');
  END IF;

  _barbearia_ids := public.painel_barbearia_ids_visiveis();

  RETURN json_build_object(
    'items',
    coalesce(
      (
        SELECT json_agg(row_to_json(t) ORDER BY t.criado_em DESC)
        FROM (
          SELECT al.id, al.agendamento_id, al.tipo, al.mensagem, al.status, al.criado_em, al.resolvido_em
          FROM public.alertas_agendamento al
          JOIN public.agendamentos a ON a.id = al.agendamento_id
          WHERE al.agendamento_id = p_agendamento_id
            AND a.barbearia_id = ANY(_barbearia_ids)
        ) t
      ),
      '[]'::json
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_agendamento_alert(p_alert_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _barbearia_ids uuid[];
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('error', 'not_authenticated');
  END IF;

  _barbearia_ids := public.painel_barbearia_ids_visiveis();

  UPDATE public.alertas_agendamento al
  SET status = 'resolvido', resolvido_em = now()
  WHERE al.id = p_alert_id
    AND al.barbearia_id = ANY(_barbearia_ids)
    AND al.status = 'pendente';

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'not_found');
  END IF;

  RETURN json_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.list_agendamento_alerts(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_agendamento_alert(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_agendamento_alerts(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_agendamento_alert(uuid) TO authenticated;

-- =============================================================================
-- 6. Painel: has_pending_alert em get_agendamentos_painel
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_agendamentos_painel(
  p_data_inicio date,
  p_data_fim    date
)
RETURNS json
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _barbearia_ids                    uuid[];
  _barbearia_ids_agendamentos_edit  uuid[];
  _items                            json;
  _profissionais                    json;
  _total                            int;
  _confirmados                      int;
  _concluidos                       int;
  _aguardando                       int;
  _aguardando_pagamento             int;
  _cancelados                       int;
  _faturamento                      bigint;
  _status_visiveis                  public.agendamento_status[] := ARRAY[
    'confirmado'::public.agendamento_status,
    'concluido'::public.agendamento_status,
    'cancelado'::public.agendamento_status,
    'nao_veio'::public.agendamento_status,
    'aguardando_pagamento'::public.agendamento_status
  ];
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('error', 'not_authenticated');
  END IF;

  IF p_data_inicio IS NULL OR p_data_fim IS NULL OR p_data_fim < p_data_inicio THEN
    RETURN json_build_object('error', 'invalid_dates');
  END IF;

  _barbearia_ids := public.painel_barbearia_ids_visiveis();
  _barbearia_ids_agendamentos_edit := public.painel_barbearia_ids_agendamentos_editaveis();

  IF array_length(_barbearia_ids, 1) IS NULL OR array_length(_barbearia_ids, 1) = 0 THEN
    RETURN json_build_object(
      'items', '[]'::json,
      'profissionais', '[]'::json,
      'summary', json_build_object(
        'total', 0,
        'confirmados', 0,
        'concluidos', 0,
        'aguardando_confirmacao', 0,
        'aguardando_pagamento', 0,
        'cancelados', 0,
        'faturamento_centavos', 0
      )
    );
  END IF;

  PERFORM public.expirar_agendamentos_nao_confirmados(_barbearia_ids);
  PERFORM public.expirar_agendamentos_aguardando_pagamento();

  SELECT coalesce(json_agg(row_to_json(t) ORDER BY t.data, t.hora, t.barbeiro_nome), '[]'::json)
  INTO _items
  FROM (
    SELECT
      a.id,
      a.data,
      to_char(a.hora, 'HH24:MI') AS hora,
      public.cliente_nome_exibicao(a.barbearia_id, a.cliente_id, a.cliente_whatsapp, a.cliente_nome) AS cliente_nome,
      a.cliente_whatsapp,
      a.duracao_minutos,
      coalesce(a.servicos_nomes, ARRAY[]::text[]) AS servicos_nomes,
      a.observacao,
      a.barbeiro_id,
      coalesce(br.nome, 'Colaborador') AS barbeiro_nome,
      a.barbearia_id,
      a.confirmation_token,
      a.client_confirmed_at,
      coalesce(a.requires_client_confirmation, false) AS requires_client_confirmation,
      a.status::text AS status,
      a.valor_base_centavos,
      a.valor_pago_centavos,
      a.valor_restante_centavos,
      a.payment_expires_at,
      a.payment_status::text AS payment_status,
      (a.barbearia_id = ANY(_barbearia_ids_agendamentos_edit)) AS can_manage,
      EXISTS (
        SELECT 1 FROM public.alertas_agendamento al
        WHERE al.agendamento_id = a.id AND al.status = 'pendente'
      ) AS has_pending_alert
    FROM public.agendamentos a
    LEFT JOIN public.barbeiros br ON br.id = a.barbeiro_id
    WHERE a.barbearia_id = ANY(_barbearia_ids)
      AND a.data BETWEEN p_data_inicio AND p_data_fim
      AND a.status = ANY(_status_visiveis)
      AND (
        a.status <> 'aguardando_pagamento'::public.agendamento_status
        OR public.public_booking_hold_blocks_slot(a)
      )
  ) t;

  SELECT coalesce(json_agg(row_to_json(p) ORDER BY p.nome), '[]'::json)
  INTO _profissionais
  FROM (
    SELECT br.id, br.nome, br.barbearia_id
    FROM public.barbeiros br
    WHERE br.barbearia_id = ANY(_barbearia_ids)
      AND br.ativo = true

    UNION

    SELECT DISTINCT br.id, coalesce(br.nome, 'Colaborador'), a.barbearia_id
    FROM public.agendamentos a
    LEFT JOIN public.barbeiros br ON br.id = a.barbeiro_id
    WHERE a.barbearia_id = ANY(_barbearia_ids)
      AND a.data BETWEEN p_data_inicio AND p_data_fim
      AND a.status = ANY(_status_visiveis)
      AND (
        a.status <> 'aguardando_pagamento'::public.agendamento_status
        OR public.public_booking_hold_blocks_slot(a)
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.barbeiros bx
        WHERE bx.id = a.barbeiro_id AND bx.ativo = true
      )
  ) p;

  SELECT count(*)::int INTO _total
  FROM public.agendamentos a
  WHERE a.barbearia_id = ANY(_barbearia_ids)
    AND a.data BETWEEN p_data_inicio AND p_data_fim
    AND a.status = ANY(_status_visiveis)
    AND (
      a.status <> 'aguardando_pagamento'::public.agendamento_status
      OR public.public_booking_hold_blocks_slot(a)
    );

  SELECT count(*)::int INTO _confirmados
  FROM public.agendamentos a
  WHERE a.barbearia_id = ANY(_barbearia_ids)
    AND a.data BETWEEN p_data_inicio AND p_data_fim
    AND a.status = 'confirmado'::public.agendamento_status
    AND (
      NOT coalesce(a.requires_client_confirmation, false)
      OR a.client_confirmed_at IS NOT NULL
    );

  SELECT count(*)::int INTO _concluidos
  FROM public.agendamentos a
  WHERE a.barbearia_id = ANY(_barbearia_ids)
    AND a.data BETWEEN p_data_inicio AND p_data_fim
    AND a.status = 'concluido'::public.agendamento_status;

  SELECT count(*)::int INTO _aguardando
  FROM public.agendamentos a
  WHERE a.barbearia_id = ANY(_barbearia_ids)
    AND a.data BETWEEN p_data_inicio AND p_data_fim
    AND a.status = 'confirmado'::public.agendamento_status
    AND coalesce(a.requires_client_confirmation, false)
    AND a.client_confirmed_at IS NULL;

  SELECT count(*)::int INTO _aguardando_pagamento
  FROM public.agendamentos a
  WHERE a.barbearia_id = ANY(_barbearia_ids)
    AND a.data BETWEEN p_data_inicio AND p_data_fim
    AND a.status = 'aguardando_pagamento'::public.agendamento_status
    AND public.public_booking_hold_blocks_slot(a);

  SELECT count(*)::int INTO _cancelados
  FROM public.agendamentos a
  WHERE a.barbearia_id = ANY(_barbearia_ids)
    AND a.data BETWEEN p_data_inicio AND p_data_fim
    AND a.status = 'cancelado'::public.agendamento_status;

  SELECT coalesce(sum(sub.faturamento), 0)
  INTO _faturamento
  FROM public.agendamentos a
  LEFT JOIN LATERAL (
    SELECT coalesce(sum(coalesce(bs.preco_centavos, 0)), 0) AS faturamento
    FROM unnest(coalesce(a.servicos_nomes, ARRAY[]::text[])) AS sn(nome)
    LEFT JOIN public.barbeiro_services bs
      ON bs.barbeiro_id = a.barbeiro_id
     AND bs.nome = sn.nome
     AND bs.ativo = true
  ) sub ON true
  WHERE a.barbearia_id = ANY(_barbearia_ids)
    AND a.data BETWEEN p_data_inicio AND p_data_fim
    AND (
      a.status = 'concluido'::public.agendamento_status
      OR (
        a.status = 'confirmado'::public.agendamento_status
        AND (
          NOT coalesce(a.requires_client_confirmation, false)
          OR a.client_confirmed_at IS NOT NULL
        )
      )
    );

  RETURN json_build_object(
    'items', _items,
    'profissionais', _profissionais,
    'summary', json_build_object(
      'total', _total,
      'confirmados', _confirmados,
      'concluidos', _concluidos,
      'aguardando_confirmacao', _aguardando,
      'aguardando_pagamento', _aguardando_pagamento,
      'cancelados', _cancelados,
      'faturamento_centavos', _faturamento
    )
  );
END;
$$;
