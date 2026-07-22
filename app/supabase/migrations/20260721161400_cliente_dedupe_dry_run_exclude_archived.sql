-- Fase E1c: dry-run ignora clientes arquivados (já fundidos).

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
      AND c.archived_at IS NULL
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
      AND c.archived_at IS NULL
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
      AND c.archived_at IS NULL
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
  'Somente leitura: duplicatas ativas (archived_at IS NULL) por (titular, whatsapp), split auto-merge vs needs_review.';
