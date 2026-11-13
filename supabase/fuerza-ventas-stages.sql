-- Omni CRM · Etapas reales del pipeline FUERZA DE VENTAS
-- Aplicar con: node scripts/apply-migration.mjs supabase/fuerza-ventas-stages.sql
-- (o pegando este archivo en el SQL Editor de Supabase).
--
-- Los negocios del pipeline FUERZA DE VENTAS pasan de las claves de muestra a las etapas reales:
--   appointment  → oferta          (OFERTA A+W, 10 %)
--   qualified    → cotizacion      (Proyecto en Cotización, 30 %)
--   presentation → ganado_cliente  (Proyecto Ganado por el cliente, 40 %)
--   decision     → evalua          (Evalua, 80 %)
--   contract     → evalua          (Evalua, 80 %)
--   won / lost   se conservan      (Ganado 100 %, Perdido 0 %); "deleted" (Eliminado, 0 %) es nueva y empieza vacía.
-- La probabilidad de cada etapa se guarda en la definición del pipeline (Configuración › Objetos › Negocios › Pipelines).
-- Idempotente: solo toca negocios de ese pipeline que aún tengan una clave antigua. Los demás pipelines no cambian.
-- La app aplica el mismo mapeo al leer, así que nada se pierde si esta migración se ejecuta más tarde.

update deals
   set stage = case stage
                 when 'appointment'  then 'oferta'
                 when 'qualified'    then 'cotizacion'
                 when 'presentation' then 'ganado_cliente'
                 when 'decision'     then 'evalua'
                 when 'contract'     then 'evalua'
                 else stage
               end
 where pipeline = 'FUERZA DE VENTAS'
   and stage in ('appointment', 'qualified', 'presentation', 'decision', 'contract');

-- Etiqueta "Importante" de la tarjeta del tablero: los negocios de prioridad alta del pipeline quedan marcados
-- (solo los que todavía no tienen el indicador; se cambia en la ficha del negocio, campo "Importante").
update deals
   set extra = extra || '{"important": true}'::jsonb
 where pipeline = 'FUERZA DE VENTAS'
   and priority = 'high'
   and not (extra ? 'important');
