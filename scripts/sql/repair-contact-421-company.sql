-- Reparación puntual, local hasta autorización expresa del orquestador.
-- Ejecutar el archivo completo: transacción + bloqueo evitan reparaciones simultáneas.
BEGIN;
LOCK TABLE public.companies IN SHARE ROW EXCLUSIVE MODE;
DO $$
DECLARE
  c public.contacts%ROWTYPE;
  company_key bigint;
  company_name text;
BEGIN
  SELECT * INTO c FROM public.contacts WHERE id = 421 FOR UPDATE;
  IF NOT FOUND OR c.deleted_at IS NOT NULL THEN RETURN; END IF;
  -- No sobrescribir una asociación corregida después de la auditoría.
  IF c.company_id IS NOT NULL THEN RETURN; END IF;
  IF btrim(coalesce(c.company, '')) <> 'Vidrios y Cristales Prueba' THEN
    RAISE EXCEPTION 'El texto de empresa del contacto 421 cambió; revisar antes de reparar';
  END IF;
  SELECT id, name INTO company_key, company_name FROM public.companies
   WHERE deleted_at IS NULL AND lower(btrim(name)) = lower(btrim(c.company))
   ORDER BY id LIMIT 1;
  IF company_key IS NULL THEN
    -- La app asigna ids explícitos; la secuencia identity puede estar rezagada.
    SELECT coalesce(max(id), 0) + 1 INTO company_key FROM public.companies;
    company_name := btrim(c.company);
    INSERT INTO public.companies(id, name, owner, lifecycle)
      VALUES (company_key, company_name, coalesce(c.owner, ''), coalesce(c.lifecycle, 'Lead'));
  END IF;
  UPDATE public.contacts SET company_id = company_key, company = company_name WHERE id = c.id;
  UPDATE public.contact_companies SET is_primary = false,
    label = CASE WHEN label = 'Principal' THEN 'Sin etiqueta' ELSE label END
    WHERE contact_id = c.id AND company_id <> company_key AND is_primary;
  INSERT INTO public.contact_companies(contact_id, company_id, label, is_primary)
    VALUES (c.id, company_key, 'Principal', true)
    ON CONFLICT (contact_id, company_id) DO UPDATE SET label = 'Principal', is_primary = true;
END $$;
COMMIT;
-- Verificación: una fila con los tres ids coincidentes e is_primary=true.
SELECT c.id, c.company, c.company_id, k.id AS linked_company_id, cc.is_primary
FROM public.contacts c
JOIN public.companies k ON k.id = c.company_id
JOIN public.contact_companies cc ON cc.contact_id = c.id AND cc.company_id = k.id
WHERE c.id = 421;
