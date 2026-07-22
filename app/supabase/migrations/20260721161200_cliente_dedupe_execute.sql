-- Fase E2: executa merge (após revisar dry-run). Não invocar execute(false) sem autorização explícita.

CREATE OR REPLACE FUNCTION public.cliente_dedupe_execute(p_dry_run boolean DEFAULT true)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _batch uuid := gen_random_uuid();
  _groups_merged int := 0;
  _archived int := 0;
  _agendamentos_this_loser int;
  _total_agendamentos_remapped int := 0;
  g record;
  _survivor_id uuid;
  l record;
  _merged_nome text;
  _merged_nasc date;
  _merged_avatar text;
BEGIN
  IF p_dry_run THEN
    RETURN (public.cliente_dedupe_dry_run(100)::jsonb || jsonb_build_object('dry_run', true))::json;
  END IF;

  CREATE TEMP TABLE _dedupe_plan ON COMMIT DROP AS
  WITH digits AS (
    SELECT
      c.*,
      public.cliente_whatsapp_digits(c.whatsapp) AS whatsapp_digits,
      (c.avatar_url IS NOT NULL)::int + (c.data_nascimento IS NOT NULL)::int AS profile_score,
      count(a.id) AS agendamento_count
    FROM public.clientes c
    LEFT JOIN public.agendamentos a ON a.cliente_id = c.id
    WHERE c.titular_user_id IS NOT NULL
      AND length(public.cliente_whatsapp_digits(c.whatsapp)) >= 10
    GROUP BY c.id
  ),
  ranked AS (
    SELECT
      d.*,
      row_number() OVER (
        PARTITION BY d.titular_user_id, d.whatsapp_digits
        ORDER BY d.agendamento_count DESC, d.profile_score DESC, d.updated_at DESC, d.id
      ) AS rn,
      count(*) OVER (PARTITION BY d.titular_user_id, d.whatsapp_digits) AS grp_size
    FROM digits d
  )
  SELECT
    titular_user_id,
    whatsapp_digits,
    id AS cliente_id,
    rn,
    grp_size,
    (rn = 1) AS is_survivor
  FROM ranked
  WHERE grp_size > 1;

  FOR g IN
    SELECT titular_user_id, whatsapp_digits
    FROM _dedupe_plan
    GROUP BY titular_user_id, whatsapp_digits
  LOOP
    SELECT p.cliente_id INTO _survivor_id
    FROM _dedupe_plan p
    WHERE p.titular_user_id = g.titular_user_id
      AND p.whatsapp_digits = g.whatsapp_digits
      AND p.is_survivor
    LIMIT 1;

    SELECT c.nome INTO _merged_nome
    FROM public.clientes c
    JOIN _dedupe_plan p ON p.cliente_id = c.id
    WHERE p.titular_user_id = g.titular_user_id
      AND p.whatsapp_digits = g.whatsapp_digits
    ORDER BY c.updated_at DESC, length(trim(c.nome)) DESC
    LIMIT 1;

    SELECT max(c.data_nascimento) INTO _merged_nasc
    FROM public.clientes c
    JOIN _dedupe_plan p ON p.cliente_id = c.id
    WHERE p.titular_user_id = g.titular_user_id
      AND p.whatsapp_digits = g.whatsapp_digits;

    SELECT c.avatar_url INTO _merged_avatar
    FROM public.clientes c
    JOIN _dedupe_plan p ON p.cliente_id = c.id
    WHERE p.titular_user_id = g.titular_user_id
      AND p.whatsapp_digits = g.whatsapp_digits
      AND c.avatar_url IS NOT NULL
    ORDER BY c.updated_at DESC
    LIMIT 1;

    UPDATE public.clientes
    SET
      nome = coalesce(_merged_nome, nome),
      data_nascimento = coalesce(_merged_nasc, data_nascimento),
      avatar_url = coalesce(_merged_avatar, avatar_url),
      updated_at = now()
    WHERE id = _survivor_id;

    FOR l IN
      SELECT p.cliente_id, p.rn
      FROM _dedupe_plan p
      WHERE p.titular_user_id = g.titular_user_id
        AND p.whatsapp_digits = g.whatsapp_digits
        AND NOT p.is_survivor
    LOOP
      WITH moved AS (
        UPDATE public.agendamentos a
        SET cliente_id = _survivor_id
        WHERE a.cliente_id = l.cliente_id
        RETURNING 1
      )
      SELECT count(*)::int INTO _agendamentos_this_loser FROM moved;

      _total_agendamentos_remapped := _total_agendamentos_remapped + _agendamentos_this_loser;

      INSERT INTO public.cliente_dedupe_merge_map (
        merge_batch_id, titular_user_id, whatsapp_digits,
        old_cliente_id, new_cliente_id, survivor_rank,
        old_row_snapshot, agendamentos_remapped
      )
      SELECT
        _batch, g.titular_user_id, g.whatsapp_digits,
        l.cliente_id, _survivor_id, l.rn,
        to_jsonb(c.*), _agendamentos_this_loser
      FROM public.clientes c
      WHERE c.id = l.cliente_id;

      UPDATE public.clientes
      SET archived_at = now(), updated_at = now()
      WHERE id = l.cliente_id
        AND archived_at IS NULL;

      _archived := _archived + 1;
    END LOOP;

    PERFORM public.refresh_cliente_last_clinical_activity(_survivor_id);
    _groups_merged := _groups_merged + 1;
  END LOOP;

  RETURN json_build_object(
    'dry_run', false,
    'merge_batch_id', _batch,
    'groups_merged', _groups_merged,
    'clientes_archived', _archived,
    'agendamentos_remapped', _total_agendamentos_remapped
  );
END;
$$;

COMMENT ON FUNCTION public.cliente_dedupe_execute(boolean) IS
  'p_dry_run=true delega ao dry-run. false executa merge + merge_map + archive duplicatas.';

GRANT EXECUTE ON FUNCTION public.cliente_dedupe_execute(boolean) TO service_role;
