# Sistema de decisión de duplicados de contactos (diseñado con el usuario, 27-nov-2026)

**Estado:** diseño aprobado; construcción en pausa hasta después de la migración HubSpot
(`docs/migracion-hubspot.md`). Aplica sobre los datos REALES importados.

## Jerarquía de identidad (del usuario)

Cara y voz no están disponibles, así que cada dato pesa según qué tan personal es:
**correo > celular (móvil personal) > nombre > empresa > teléfono fijo** (el fijo puede
ser conmutador compartido).

## Niveles de detección

| Nivel | Condición | Acción |
|---|---|---|
| **A — confianza alta** | Mismo correo + mismo nombre | Fusión propuesta sin preguntar (el usuario aprueba la lista completa de una vez) |
| **B — probable** | Mismo nombre + mismo celular con correos distintos, O mismo correo con nombre distinto | **Preguntar** al usuario caso por caso |
| **C — posible** | Mismo nombre + misma empresa, correo y celular distintos | **Preguntar** (homónimos compañeros de trabajo son comunes) |
| — | Nombre distinto y datos distintos | No se propone nada |

Caso real que valida la regla (27-nov-2026): «Carmen Ruiz» (demo) y «Fernando Lovera Colin»
(real) comparten dígitos de celular — mismo número, personas distintas → Nivel B, jamás
automático.

## Si se fusiona: orden para decidir qué datos quedan

1. **Empresa** — primero para cuál trabaja.
2. **Correo verdadero** — cuál queda como principal.
3. **Teléfonos** — no se pierde ninguno: uno principal, el otro secundario.
4. **Resto de campos** — gana el dato lleno; si ambos traen datos distintos, el usuario elige.
   En Nivel A gana el registro más completo.
5. **Historial, notas, negocios y tickets** del duplicado se mudan al registro que sobrevive.
6. El sobrante va a la **papelera** con sello «fusionado con #id» (recuperable).

## Salvaguardas

- Respaldo antes de cualquier fusión masiva.
- En Nivel A, antes de ejecutar, se entrega la lista de fusiones propuestas (qué registro
  sobrevive y qué datos quedan) para aprobación en bloque.
- El índice único de correo se crea DESPUÉS del dedupe post-importación, no antes.
