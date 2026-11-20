# Informes personalizados

En `/reports/`, **Añadir informe** abre la biblioteca. **Crear informe** permite elegir fuente, medida, dimensión y visualización, revisar los datos y guardar. El botón **Biblioteca de informes** también abre la lista. Permite buscar por nombre (sin distinguir mayúsculas ni acentos), abrir, duplicar, renombrar y eliminar con confirmación, además de anclar o quitar del panel. La copia conserva la configuración y se crea sin anclar. La ilustración «en construcción» solo aparece cuando la carga termina correctamente y no hay informes; búsquedas sin coincidencias y errores tienen estados distintos. Las tarjetas personalizadas usan todos los registros cargados, independientemente del filtro temporal de los informes predefinidos.

Las seis fuentes se obtienen de `src/data.js`; llamadas filtra las actividades de tipo `call`. Suma y promedio corresponden al importe de negocios en la moneda de la cuenta. Los importes ausentes se excluyen del promedio; el KPI calcula el promedio de registros, no el promedio de grupos. Los campos de dimensión ausentes aparecen como «Sin dato».

## Persistencia

`supabase/reports.sql` crea la tabla `reports`, configuración JSONB, anclaje y políticas RLS privadas por usuario autenticado. La migración se entrega sin aplicar a ninguna base remota. Debe aplicarse en el entorno de desarrollo antes de probar persistencia Supabase. Con conexión configurada, los errores de carga/escritura se muestran y no se sustituyen por guardados locales. Sin variables Supabase se utiliza localStorage, identificado como modo local en la biblioteca.

## Verificación

- `node scripts/smoke-custom-reports.mjs`: creación de «Negocios por etapa (barras)», guardado, biblioteca, anclaje, remontaje, búsqueda, apertura, duplicación, renombrado, eliminación, estado vacío, promedio ponderado por registros y fallo de escritura. Desactiva Supabase para evitar escrituras remotas.
- `node scripts/smoke-reports.mjs`: regresión de los dashboards existentes (ejecutar sin variables Supabase).
- `npm run build`.

Verificación realizada localmente: build y ambas pruebas satisfactorias. Debido a un bloqueo al importar dependencias de Node en este entorno, las pruebas se ejecutaron empaquetadas con esbuild y jsdom 26 instalado en un directorio temporal, sin cambiar las dependencias del proyecto. No se verificó una escritura en Supabase ni se aplicó la migración.
