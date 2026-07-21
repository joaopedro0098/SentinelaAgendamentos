-- face_has_existing_match ficou com 2 overloads (real[],double precision) e (real[],uuid,double precision)
-- criadas em migrations separadas de 2026-05-25. Chamadas com 1 argumento (ex.: check_facial_trial_eligibility,
-- handle_new_user) ficaram ambíguas para o Postgres: "function ... is not unique". Remove o overload antigo
-- (sem exclude_user_id); o overload mais novo cobre o mesmo caso via default p_exclude_user_id = NULL.

DROP FUNCTION IF EXISTS public.face_has_existing_match(real[], double precision);
