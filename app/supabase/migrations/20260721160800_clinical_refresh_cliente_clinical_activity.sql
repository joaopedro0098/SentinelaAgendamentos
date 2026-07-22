-- Fase D2: recalcula clientes.last_clinical_activity_at após eventos clínicos (triggers).
-- retention_until (gerado em clientes) segue automaticamente. Invisível na UI; só colunas novas.

CREATE OR REPLACE FUNCTION public.compute_cliente_last_clinical_activity_at(p_cliente_id uuid)
RETURNS timestamptz
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT NULLIF(
    GREATEST(
      COALESCE((
        SELECT MAX(GREATEST(an.created_at, an.updated_at))
        FROM public.agendamento_anotacoes an
        INNER JOIN public.agendamentos a ON a.id = an.agendamento_id
        WHERE a.cliente_id = p_cliente_id
      ), '-infinity'::timestamptz),
      COALESCE((
        SELECT MAX((a.data + a.hora) AT TIME ZONE 'America/Sao_Paulo')
        FROM public.agendamentos a
        WHERE a.cliente_id = p_cliente_id
          AND a.status = 'concluido'::public.agendamento_status
      ), '-infinity'::timestamptz),
      COALESCE((
        SELECT MAX(pd.created_at)
        FROM public.paciente_documentos pd
        INNER JOIN public.clientes c ON c.id = p_cliente_id
        WHERE pd.barbearia_id = c.barbearia_id
          AND pd.whatsapp_digits = public.cliente_whatsapp_digits(c.whatsapp)
      ), '-infinity'::timestamptz)
    ),
    '-infinity'::timestamptz
  );
$$;

COMMENT ON FUNCTION public.compute_cliente_last_clinical_activity_at(uuid) IS
  'Último instante clínico do paciente: MAX(anotação, slot concluído data+hora SP, documento). Inclui registros arquivados (retenção legal; visibilidade na UI é outra camada).';

CREATE OR REPLACE FUNCTION public.refresh_cliente_last_clinical_activity(p_cliente_id uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF p_cliente_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.clientes
  SET last_clinical_activity_at = public.compute_cliente_last_clinical_activity_at(p_cliente_id)
  WHERE id = p_cliente_id;
END;
$$;

COMMENT ON FUNCTION public.refresh_cliente_last_clinical_activity(uuid) IS
  'Atualiza last_clinical_activity_at (e retention_until gerado) para um cliente após mudança clínica.';

CREATE OR REPLACE FUNCTION public.trg_refresh_cliente_clinical_activity_from_agendamento()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.cliente_id IS NOT NULL THEN
      PERFORM public.refresh_cliente_last_clinical_activity(OLD.cliente_id);
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE'
    AND OLD.cliente_id IS DISTINCT FROM NEW.cliente_id
    AND OLD.cliente_id IS NOT NULL
  THEN
    PERFORM public.refresh_cliente_last_clinical_activity(OLD.cliente_id);
  END IF;

  IF NEW.cliente_id IS NOT NULL THEN
    PERFORM public.refresh_cliente_last_clinical_activity(NEW.cliente_id);
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_refresh_cliente_clinical_activity_from_anotacao()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  _cliente_id uuid;
  _old_cliente_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT a.cliente_id INTO _cliente_id
    FROM public.agendamentos a
    WHERE a.id = OLD.agendamento_id;

    IF _cliente_id IS NOT NULL THEN
      PERFORM public.refresh_cliente_last_clinical_activity(_cliente_id);
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.agendamento_id IS DISTINCT FROM NEW.agendamento_id THEN
    SELECT a.cliente_id INTO _old_cliente_id
    FROM public.agendamentos a
    WHERE a.id = OLD.agendamento_id;

    IF _old_cliente_id IS NOT NULL THEN
      PERFORM public.refresh_cliente_last_clinical_activity(_old_cliente_id);
    END IF;
  END IF;

  SELECT a.cliente_id INTO _cliente_id
  FROM public.agendamentos a
  WHERE a.id = NEW.agendamento_id;

  IF _cliente_id IS NOT NULL THEN
    PERFORM public.refresh_cliente_last_clinical_activity(_cliente_id);
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_refresh_cliente_clinical_activity_from_documento()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  _row record;
BEGIN
  IF TG_OP = 'DELETE' THEN
    FOR _row IN
      SELECT c.id
      FROM public.clientes c
      WHERE c.barbearia_id = OLD.barbearia_id
        AND public.cliente_whatsapp_digits(c.whatsapp) = OLD.whatsapp_digits
    LOOP
      PERFORM public.refresh_cliente_last_clinical_activity(_row.id);
    END LOOP;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.barbearia_id IS DISTINCT FROM NEW.barbearia_id
      OR OLD.whatsapp_digits IS DISTINCT FROM NEW.whatsapp_digits
    THEN
      FOR _row IN
        SELECT c.id
        FROM public.clientes c
        WHERE c.barbearia_id = OLD.barbearia_id
          AND public.cliente_whatsapp_digits(c.whatsapp) = OLD.whatsapp_digits
      LOOP
        PERFORM public.refresh_cliente_last_clinical_activity(_row.id);
      END LOOP;
    END IF;
  END IF;

  FOR _row IN
    SELECT c.id
    FROM public.clientes c
    WHERE c.barbearia_id = NEW.barbearia_id
      AND public.cliente_whatsapp_digits(c.whatsapp) = NEW.whatsapp_digits
  LOOP
    PERFORM public.refresh_cliente_last_clinical_activity(_row.id);
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_agendamentos_refresh_cliente_clinical_activity ON public.agendamentos;
CREATE TRIGGER trg_agendamentos_refresh_cliente_clinical_activity
  AFTER INSERT OR UPDATE OF status, data, hora, cliente_id, archived_at
  OR DELETE
  ON public.agendamentos
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_refresh_cliente_clinical_activity_from_agendamento();

DROP TRIGGER IF EXISTS trg_agendamento_anotacoes_refresh_cliente_clinical_activity ON public.agendamento_anotacoes;
CREATE TRIGGER trg_agendamento_anotacoes_refresh_cliente_clinical_activity
  AFTER INSERT OR UPDATE OF conteudo, created_at, updated_at, agendamento_id, archived_at
  OR DELETE
  ON public.agendamento_anotacoes
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_refresh_cliente_clinical_activity_from_anotacao();

DROP TRIGGER IF EXISTS trg_paciente_documentos_refresh_cliente_clinical_activity ON public.paciente_documentos;
CREATE TRIGGER trg_paciente_documentos_refresh_cliente_clinical_activity
  AFTER INSERT OR UPDATE OF created_at, barbearia_id, whatsapp_digits, archived_at
  OR DELETE
  ON public.paciente_documentos
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_refresh_cliente_clinical_activity_from_documento();
