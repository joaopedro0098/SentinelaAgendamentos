CREATE OR REPLACE FUNCTION public.parse_professional_specialty_from_text(p_raw text)
RETURNS public.professional_specialty
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE trim(coalesce(p_raw, ''))
    WHEN 'dentista' THEN 'dentista'::public.professional_specialty
    WHEN 'psicologo' THEN 'psicologo'::public.professional_specialty
    WHEN 'nutricionista' THEN 'nutricionista'::public.professional_specialty
    WHEN 'medico' THEN 'medico'::public.professional_specialty
    WHEN 'salao_beleza' THEN 'salao_beleza'::public.professional_specialty
    WHEN 'barbearia' THEN 'barbearia'::public.professional_specialty
    ELSE NULL
  END;
$$;
