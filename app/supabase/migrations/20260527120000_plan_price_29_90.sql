-- Atualiza o rótulo exibido no painel (valor cobrado vem das edge functions mp-create-*).
CREATE OR REPLACE FUNCTION public.get_my_subscription()
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = auth, public
AS $$
DECLARE
  _shop record;
  _trial_end date;
  _trial_days_left int;
  _can_book boolean;
  _barbearia_id uuid;
  _email text;
  _trial_already_used boolean;
  _facial_trial_used boolean;
  _my_embedding real[];
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('error', 'not_authenticated');
  END IF;

  IF public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RETURN json_build_object(
      'is_admin', true,
      'can_book', true,
      'subscription_status', 'active',
      'trial_already_used', false,
      'facial_trial_used', false,
      'label', 'Administrador — acesso ilimitado'
    );
  END IF;

  SELECT s.* INTO _shop
  FROM public.barbershops s
  WHERE s.owner_id = auth.uid()
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'no_shop', 'can_book', false);
  END IF;

  SELECT lower(trim(u.email)) INTO _email
  FROM auth.users u
  WHERE u.id = auth.uid();

  _trial_already_used := _email IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.trial_claims tc WHERE tc.email = _email
  );

  SELECT fe.embedding INTO _my_embedding
  FROM public.facial_embeddings fe
  WHERE fe.user_id = auth.uid()
  ORDER BY fe.created_at DESC
  LIMIT 1;

  _facial_trial_used := _my_embedding IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.facial_embeddings fe
    WHERE fe.user_id IS DISTINCT FROM auth.uid()
      AND public.face_descriptor_distance(fe.embedding, _my_embedding) < 0.55
  );

  SELECT b.id INTO _barbearia_id
  FROM public.barbearias b
  WHERE b.slug = _shop.slug
  LIMIT 1;

  _can_book := _barbearia_id IS NOT NULL AND public.barbearia_pode_agendar(_barbearia_id);
  _trial_end := _shop.trial_started_at + 13;
  _trial_days_left := GREATEST(0, (_shop.trial_started_at + 14) - CURRENT_DATE);

  RETURN json_build_object(
    'is_admin', false,
    'can_book', _can_book,
    'subscription_status', _shop.subscription_status,
    'trial_started_at', _shop.trial_started_at,
    'trial_days_left', _trial_days_left,
    'trial_last_day', _trial_end,
    'trial_already_used', _trial_already_used,
    'facial_trial_used', _facial_trial_used,
    'current_period_end', _shop.current_period_end,
    'grace_until', _shop.grace_until,
    'subscription_notice', _shop.subscription_notice,
    'mp_subscription_id', _shop.mp_subscription_id,
    'plan_price_label', 'R$ 29,90/mês'
  );
END;
$$;
