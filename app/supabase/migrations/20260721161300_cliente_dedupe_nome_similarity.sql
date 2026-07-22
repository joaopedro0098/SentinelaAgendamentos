-- Fase E1b: dedupe só auto-merge quando nomes são similares (pg_trgm).

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE OR REPLACE FUNCTION public.cliente_dedupe_nome_similar(p_nome_a text, p_nome_b text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT CASE
    WHEN length(trim(coalesce(p_nome_a, ''))) = 0 OR length(trim(coalesce(p_nome_b, ''))) = 0 THEN
      false
    WHEN lower(trim(p_nome_a)) = lower(trim(p_nome_b)) THEN
      true
    ELSE
      similarity(lower(trim(p_nome_a)), lower(trim(p_nome_b))) >= 0.4
  END;
$$;

COMMENT ON FUNCTION public.cliente_dedupe_nome_similar(text, text) IS
  'Conservador: true se nomes iguais (case-insensitive) ou similarity >= 0.4 (pg_trgm). Vazio = não fundir.';

CREATE OR REPLACE FUNCTION public.cliente_dedupe_dry_run(p_sample_limit int DEFAULT 20)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _limit int;
  _auto_groups int;
  _review_groups int;
  _rows_auto_archive int;
  _auto_sample json;
  _review_sample json;
BEGIN
  _limit := GREATEST(1, LEAST(coalesce(p_sample_limit, 20), 100));

  WITH digits AS (
    SELECT
      c.id,
      c.titular_user_id,
      public.cliente_whatsapp_digits(c.whatsapp) AS whatsapp_digits,
      c.barbearia_id,
      c.nome,
      c.updated_at,
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
  ),
  group_summary AS (
    SELECT
      r.titular_user_id,
      r.whatsapp_digits,
      max(r.grp_size) AS grp_size,
      max(r.nome) FILTER (WHERE r.rn = 1) AS survivor_nome,
      NOT EXISTS (
        SELECT 1
        FROM ranked r2
        WHERE r2.titular_user_id = r.titular_user_id
          AND r2.whatsapp_digits = r.whatsapp_digits
          AND r2.rn > 1
          AND NOT public.cliente_dedupe_nome_similar(
            (SELECT r3.nome FROM ranked r3
             WHERE r3.titular_user_id = r2.titular_user_id
               AND r3.whatsapp_digits = r2.whatsapp_digits
               AND r3.rn = 1),
            r2.nome
          )
      ) AS auto_merge_ok
    FROM ranked r
    WHERE r.grp_size > 1
    GROUP BY r.titular_user_id, r.whatsapp_digits
  )
  SELECT
    count(*) FILTER (WHERE auto_merge_ok)::int,
    count(*) FILTER (WHERE NOT auto_merge_ok)::int,
    coalesce(sum(grp_size - 1) FILTER (WHERE auto_merge_ok), 0)::int
  INTO _auto_groups, _review_groups, _rows_auto_archive
  FROM group_summary;

  WITH digits AS (
    SELECT
      c.id,
      c.titular_user_id,
      public.cliente_whatsapp_digits(c.whatsapp) AS whatsapp_digits,
      c.barbearia_id,
      c.nome,
      c.updated_at,
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
  ),
  group_summary AS (
    SELECT
      r.titular_user_id,
      r.whatsapp_digits,
      max(r.grp_size) AS grp_size,
      NOT EXISTS (
        SELECT 1
        FROM ranked r2
        WHERE r2.titular_user_id = r.titular_user_id
          AND r2.whatsapp_digits = r.whatsapp_digits
          AND r2.rn > 1
          AND NOT public.cliente_dedupe_nome_similar(
            (SELECT r3.nome FROM ranked r3
             WHERE r3.titular_user_id = r2.titular_user_id
               AND r3.whatsapp_digits = r2.whatsapp_digits
               AND r3.rn = 1),
            r2.nome
          )
      ) AS auto_merge_ok
    FROM ranked r
    WHERE r.grp_size > 1
    GROUP BY r.titular_user_id, r.whatsapp_digits
  ),
  group_members AS (
    SELECT
      gs.titular_user_id,
      gs.whatsapp_digits,
      gs.auto_merge_ok,
      json_agg(
        json_build_object(
          'cliente_id', r.id,
          'nome', r.nome,
          'rank_in_group', r.rn,
          'would_survive', (r.rn = 1),
          'agendamento_count', r.agendamento_count,
          'barbearia_id', r.barbearia_id
        )
        ORDER BY r.rn
      ) AS members
    FROM group_summary gs
    JOIN ranked r
      ON r.titular_user_id = gs.titular_user_id
     AND r.whatsapp_digits = gs.whatsapp_digits
    GROUP BY gs.titular_user_id, gs.whatsapp_digits, gs.auto_merge_ok, gs.grp_size
  )
  SELECT coalesce(json_agg(row_to_json(g)), '[]'::json)
  INTO _auto_sample
  FROM (
    SELECT titular_user_id, whatsapp_digits, members AS clientes
    FROM group_members
    WHERE auto_merge_ok
    ORDER BY titular_user_id, whatsapp_digits
    LIMIT _limit
  ) g;

  WITH digits AS (
    SELECT
      c.id,
      c.titular_user_id,
      public.cliente_whatsapp_digits(c.whatsapp) AS whatsapp_digits,
      c.barbearia_id,
      c.nome,
      c.updated_at,
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
  ),
  group_summary AS (
    SELECT
      r.titular_user_id,
      r.whatsapp_digits,
      NOT EXISTS (
        SELECT 1
        FROM ranked r2
        WHERE r2.titular_user_id = r.titular_user_id
          AND r2.whatsapp_digits = r.whatsapp_digits
          AND r2.rn > 1
          AND NOT public.cliente_dedupe_nome_similar(
            (SELECT r3.nome FROM ranked r3
             WHERE r3.titular_user_id = r2.titular_user_id
               AND r3.whatsapp_digits = r2.whatsapp_digits
               AND r3.rn = 1),
            r2.nome
          )
      ) AS auto_merge_ok
    FROM ranked r
    WHERE r.grp_size > 1
    GROUP BY r.titular_user_id, r.whatsapp_digits
  ),
  group_members AS (
    SELECT
      gs.titular_user_id,
      gs.whatsapp_digits,
      gs.auto_merge_ok,
      json_agg(
        json_build_object(
          'cliente_id', r.id,
          'nome', r.nome,
          'rank_in_group', r.rn,
          'would_survive', (r.rn = 1),
          'agendamento_count', r.agendamento_count,
          'barbearia_id', r.barbearia_id
        )
        ORDER BY r.rn
      ) AS members
    FROM group_summary gs
    JOIN ranked r
      ON r.titular_user_id = gs.titular_user_id
     AND r.whatsapp_digits = gs.whatsapp_digits
    GROUP BY gs.titular_user_id, gs.whatsapp_digits, gs.auto_merge_ok
  )
  SELECT coalesce(json_agg(row_to_json(g)), '[]'::json)
  INTO _review_sample
  FROM (
    SELECT titular_user_id, whatsapp_digits, members AS clientes
    FROM group_members
    WHERE NOT auto_merge_ok
    ORDER BY titular_user_id, whatsapp_digits
    LIMIT _limit
  ) g;

  RETURN json_build_object(
    'duplicate_groups', _auto_groups + _review_groups,
    'auto_mergeable_groups', _auto_groups,
    'needs_review_groups', _review_groups,
    'cliente_rows_to_archive_auto_only', _rows_auto_archive,
    'auto_mergeable_sample', _auto_sample,
    'needs_review_sample', _review_sample,
    'nome_similarity_threshold', 0.4
  );
END;
$$;

COMMENT ON FUNCTION public.cliente_dedupe_dry_run(int) IS
  'Somente leitura: duplicatas por (titular, whatsapp), split auto-merge vs needs_review (similaridade de nome).';

GRANT EXECUTE ON FUNCTION public.cliente_dedupe_dry_run(int) TO service_role;

CREATE OR REPLACE FUNCTION public.cliente_dedupe_execute(p_dry_run boolean DEFAULT true)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _batch uuid := gen_random_uuid();
  _groups_merged int := 0;
  _groups_skipped_review int := 0;
  _archived int := 0;
  _agendamentos_this_loser int;
  _total_agendamentos_remapped int := 0;
  g record;
  _survivor_id uuid;
  l record;
  _merged_nome text;
  _merged_nasc date;
  _merged_avatar text;
  _survivor_nome text;
  _auto_merge_ok boolean;
  _needs_review jsonb := '[]'::jsonb;
  _member_nomes text[];
  _member_ids uuid[];
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
    nome,
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
    SELECT p.cliente_id, c.nome INTO _survivor_id, _survivor_nome
    FROM _dedupe_plan p
    JOIN public.clientes c ON c.id = p.cliente_id
    WHERE p.titular_user_id = g.titular_user_id
      AND p.whatsapp_digits = g.whatsapp_digits
      AND p.is_survivor
    LIMIT 1;

    SELECT NOT EXISTS (
      SELECT 1
      FROM _dedupe_plan p
      WHERE p.titular_user_id = g.titular_user_id
        AND p.whatsapp_digits = g.whatsapp_digits
        AND NOT p.is_survivor
        AND NOT public.cliente_dedupe_nome_similar(_survivor_nome, p.nome)
    ) INTO _auto_merge_ok;

    IF NOT _auto_merge_ok THEN
      SELECT
        array_agg(p.cliente_id ORDER BY p.rn),
        array_agg(p.nome ORDER BY p.rn)
      INTO _member_ids, _member_nomes
      FROM _dedupe_plan p
      WHERE p.titular_user_id = g.titular_user_id
        AND p.whatsapp_digits = g.whatsapp_digits;

      _needs_review := _needs_review || jsonb_build_array(
        jsonb_build_object(
          'titular_user_id', g.titular_user_id,
          'whatsapp_digits', g.whatsapp_digits,
          'cliente_ids', to_jsonb(_member_ids),
          'nomes', to_jsonb(_member_nomes)
        )
      );
      _groups_skipped_review := _groups_skipped_review + 1;
      CONTINUE;
    END IF;

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
    'groups_skipped_needs_review', _groups_skipped_review,
    'clientes_archived', _archived,
    'agendamentos_remapped', _total_agendamentos_remapped,
    'needs_review', _needs_review
  );
END;
$$;

COMMENT ON FUNCTION public.cliente_dedupe_execute(boolean) IS
  'Merge automático só se nomes similares (pg_trgm). Grupos divergentes vão para needs_review no JSON, sem alterar dados.';

GRANT EXECUTE ON FUNCTION public.cliente_dedupe_execute(boolean) TO service_role;
