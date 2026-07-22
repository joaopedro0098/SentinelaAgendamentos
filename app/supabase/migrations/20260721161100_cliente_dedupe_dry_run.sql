-- Fase E1: relatório read-only antes do merge de clientes.

CREATE OR REPLACE FUNCTION public.cliente_dedupe_dry_run(p_sample_limit int DEFAULT 20)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _groups int;
  _rows_to_archive int;
  _sample json;
BEGIN
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
  dup_groups AS (
    SELECT titular_user_id, whatsapp_digits
    FROM ranked
    WHERE grp_size > 1
    GROUP BY titular_user_id, whatsapp_digits
  )
  SELECT count(*)::int INTO _groups FROM dup_groups;

  WITH digits AS (
    SELECT
      c.id,
      c.titular_user_id,
      public.cliente_whatsapp_digits(c.whatsapp) AS whatsapp_digits,
      (c.avatar_url IS NOT NULL)::int + (c.data_nascimento IS NOT NULL)::int AS profile_score,
      c.updated_at,
      count(a.id) AS agendamento_count
    FROM public.clientes c
    LEFT JOIN public.agendamentos a ON a.cliente_id = c.id
    WHERE c.titular_user_id IS NOT NULL
      AND length(public.cliente_whatsapp_digits(c.whatsapp)) >= 10
    GROUP BY c.id
  ),
  ranked AS (
    SELECT
      d.titular_user_id,
      d.whatsapp_digits,
      count(*) OVER (PARTITION BY d.titular_user_id, d.whatsapp_digits) AS grp_size
    FROM digits d
  )
  SELECT coalesce(sum(sub.grp_size - 1), 0)::int INTO _rows_to_archive
  FROM (
    SELECT titular_user_id, whatsapp_digits, max(grp_size) AS grp_size
    FROM ranked
    WHERE grp_size > 1
    GROUP BY titular_user_id, whatsapp_digits
  ) sub;

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
  )
  SELECT coalesce(json_agg(row_to_json(s) ORDER BY s.titular_user_id, s.whatsapp_digits, s.rank_in_group), '[]'::json)
  INTO _sample
  FROM (
    SELECT
      r.titular_user_id,
      r.whatsapp_digits,
      r.grp_size,
      r.id AS cliente_id,
      r.barbearia_id,
      r.nome,
      r.agendamento_count,
      r.profile_score,
      (r.rn = 1) AS would_survive,
      r.rn AS rank_in_group
    FROM ranked r
    WHERE r.grp_size > 1
    ORDER BY r.titular_user_id, r.whatsapp_digits, r.rn
    LIMIT GREATEST(1, LEAST(coalesce(p_sample_limit, 20), 100))
  ) s;

  RETURN json_build_object(
    'duplicate_groups', _groups,
    'cliente_rows_to_archive', _rows_to_archive,
    'sample', _sample
  );
END;
$$;

COMMENT ON FUNCTION public.cliente_dedupe_dry_run(int) IS
  'Somente leitura: quantos merges e amostra. Não altera dados.';

GRANT EXECUTE ON FUNCTION public.cliente_dedupe_dry_run(int) TO service_role;
