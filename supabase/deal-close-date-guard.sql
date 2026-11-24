-- Local migration only. Deploy separately after review; does not backfill historical dates.
BEGIN;
CREATE OR REPLACE FUNCTION public.enforce_deal_close_date()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  lost boolean;
  entering boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.pipeline_stages s JOIN public.pipelines p ON p.id=s.pipeline_id
    WHERE p.objeto='deal' AND p.nombre=NEW.pipeline AND s.clave=NEW.stage AND s.probabilidad=0
  ) INTO lost;
  entering := TG_OP='INSERT';
  IF TG_OP='UPDATE' THEN
    entering := NEW.stage IS DISTINCT FROM OLD.stage OR NEW.pipeline IS DISTINCT FROM OLD.pipeline;
  END IF;
  IF entering THEN
    NEW.extra := coalesce(NEW.extra,'{}'::jsonb) || jsonb_build_object(
      'stageEnteredAt', statement_timestamp(), 'stageEnteredKey', NEW.stage,
      'stageEnteredPipeline', NEW.pipeline);
  END IF;
  IF lost AND NEW.deleted_at IS NULL AND
    (NEW.close_date IS NULL OR (NEW.close_date AT TIME ZONE 'America/Mexico_City')::date >
      (statement_timestamp() AT TIME ZONE 'America/Mexico_City')::date) THEN
    -- An existing valid close date remains authoritative on later edits.
    IF TG_OP='UPDATE' AND NOT entering AND OLD.close_date IS NOT NULL AND
      (OLD.close_date AT TIME ZONE 'America/Mexico_City')::date <=
      (statement_timestamp() AT TIME ZONE 'America/Mexico_City')::date THEN
      NEW.close_date := OLD.close_date;
    ELSE
      NEW.close_date := statement_timestamp();
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS deals_close_date_guard ON public.deals;
CREATE TRIGGER deals_close_date_guard BEFORE INSERT OR UPDATE ON public.deals
FOR EACH ROW EXECUTE FUNCTION public.enforce_deal_close_date();
COMMIT;
