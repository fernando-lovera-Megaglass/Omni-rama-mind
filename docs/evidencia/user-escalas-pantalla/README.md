# Evidencia — user-escalas-pantalla (27-nov-2026)

Decisión del usuario (27-nov-2026): aplicar la regla «Escala por tamaño de pantalla» ya escrita en DESIGN.md §1
(tras Estructura): dos media queries sobre `:root` en `src/app.css`, nada cambia entre 1280 y 1919px.

## Qué cambió (`src/app.css`, bloque al final del archivo)

```css
@media (max-width: 1180px) {            /* densidad compacta ≈ −10 % */
  :root { --fs-xs: 12px; --fs-sm: 13px; --sp-8: 6px; --sp-10: 8px; --sp-16: 12px; }
  .assoc-card__head .assoc__logo { width: 24px; height: 24px; }
}
@media (min-width: 1920px) {            /* densidad grande ≈ +14 % */
  :root { --fs-xs: 14px; --fs-sm: 16px; --sp-8: 10px; --sp-10: 12px; --sp-16: 20px; }
  .assoc-card__head .assoc__logo { width: 32px; height: 32px; }
}
```

- Solo se mueven tokens de `:root`; los valores son exactamente los de la tabla de DESIGN.md. El logo de las
  tarjetas de asociación (`.assoc-card__head .assoc__logo`, hoy 28px sueltos en la línea ~8844) es la única medida
  por componente que la regla fija (24px / 32px); va en las mismas dos media queries. El bloque está al final del
  archivo para que gane por orden de fuente al logo base (con la misma especificidad, al inicio del archivo no
  ganaba: se comprobó y se movió). El `.assoc__logo` de 40px (cabeceras, no tarjetas) no se toca: la regla habla
  de las tarjetas laterales.
- **Tarjetas del centro de la ficha (`.card`)**: todas sus medidas ya salen de tokens, así que escalan igual que
  las laterales sin tocar nada: `.card` padding `--sp-20`, margen inferior `--sp-16`; `.card--tight` (la variante
  que usa la ficha) padding `--sp-16 --sp-20`; `.card__title` `--fs-md` + margen `--sp-16`; `.card__head` gap
  `--sp-16` + margen `--sp-8`; `.card__toggle` `--fs-md` + margen `--sp-16`; `.card__tools` gap `--sp-8`;
  `.card__note` `--fs-xs`. Las laterales: `.assoc-card` padding `--sp-16`, margen `--sp-10`. Medido en la ficha de
  contacto (tabla abajo): a 1180 la tarjeta del centro pasa de `16px 20px` a `12px 20px` y la lateral de `16px`
  a `12px`; a 1920 a `20px` y `20px`. Nada que pasar a token en esta tarea.
- Valores sueltos que viven junto a `.card` pero **no son medidas de la tarjeta** (no se tocaron; se listan para
  decidir): `.card--report { min-height: 300px }` (alto mínimo de los informes), `.card__grip` (asa de arrastre:
  `top/left 6px`, `padding 2px 5px`, `font-size 13px`), `.card__head--about .icon-btn--round { 34px }` y su icono
  `16px`; y en las laterales `.assoc-card { gap: 6px }`. Ninguno tiene token equivalente exacto (2/4/8/10/16/20/
  24/32) y la tarea prohíbe inventar tokens sin documentarlos.
- No hay cambios de disposición (columnas, menús): solo medidas.

## Medidas computadas (Playwright, Chromium; `antes` = HEAD, `despues` = este cambio)

| Ancho | Fase | `--fs-sm`/`--fs-xs` | `--sp-8`/`--sp-10`/`--sp-16` | texto base | `.card--tight` (ficha) padding · margen | `.assoc-card` padding · margen | logo | botón cabecera ficha (`.btn--sm`) |
|---|---|---|---|---|---|---|---|---|
| 1180 | antes | 14 / 12.8 | 8 / 10 / 16 | 14px | 16px 20px · 16px | 16px · 10px | 28px | 32px alto · padding 0 10px · 14px |
| 1180 | después | **13 / 12** | **6 / 8 / 12** | **13px** | **12px 20px · 12px** | **12px · 8px** | **24px** | 32px · **0 8px** · **13px** |
| 1280 | antes = después | 14 / 12.8 | 8 / 10 / 16 | 14px | 16px 20px · 16px | 16px · 10px | 28px | 32px · 0 10px · 14px |
| 1440 | antes = después | 14 / 12.8 | 8 / 10 / 16 | 14px | 16px 20px · 16px | 16px · 10px | 28px | 32px · 0 10px · 14px |
| 1920 | antes | 14 / 12.8 | 8 / 10 / 16 | 14px | 16px 20px · 16px | 16px · 10px | 28px | 32px · 0 10px · 14px |
| 1920 | después | **16 / 14** | **10 / 12 / 20** | **16px** | **20px · 20px** | **20px · 12px** | **32px** | 32px · **0 12px** · **16px** |
| 2560 | después | 16 / 14 | 10 / 12 / 20 | 16px | 20px · 20px | 20px · 12px | 32px | 32px · 0 12px · 16px |

En Contactos (lista), Negocios (lista) e Informes el texto base y los botones escalan igual (14 → 13 / 16); las
filas de tabla conservan su alto (48px: `height` suelto en la tabla, no token) y los botones su alto de 40px
(`height: 40px` suelto en `.btn`, DESIGN.md §2): solo escalan sus rellenos y su letra, como dice la regla (solo
tokens). A 1280 y 1440 las 20 medidas son idénticas antes y después (comparación automática de
`/tmp/escalas-medidas-antes.json` contra `-despues.json`).

## Capturas

`docs/evidencia/user-escalas-pantalla/antes|despues/`: `contactos-lista`, `contactos-ficha`, `negocios-lista` e
`informes` a **1180, 1920, 2560, 1440 y 1280** (`<pantalla>-<ancho>.png`), más recortes de la primera tarjeta
del centro y de la primera lateral de la ficha (`contactos-ficha-<ancho>-card.png`, `-assoc-card.png`). A 1440 y
1280 las capturas antes/después son idénticas.

Avisos preexistentes (iguales en `antes`, no los causa este cambio): Informes tiene desplazamiento lateral a 1280
y 1180 (ya en HEAD); en la ficha de contacto a ≥1920 el título «Resumen de registro» de la columna de asociaciones
queda tapado por la insignia «Datos del registro» (ya en HEAD a ese ancho). Sin texto encimado ni cortado nuevo
a 1440/1280 (las capturas base lo demuestran) ni a 1180/1920/2560 en las cuatro pantallas.

## Pruebas

- Suite Playwright a 1440 y 1280 (`npx playwright test` con las especificaciones del repo; sin tocar capturas
  base; se excluyeron solo las especificaciones temporales `tests/_sp12*.spec.js` del carril que construye
  user-espaciado-fantasma-sp12, para no pisar su evidencia): **160 en verde, 6 fallan**, ninguna por este cambio
  y las mismas que fallaban antes de tocarlo:
  - Bandeja ×2 (17 píxeles de la flecha de «Asignar a», pendientes de aprobación desde la tarea del selector de
    propietario).
  - Contactos-lista ×2 y Contactos-ficha ×2: cambios de la tarea `user-frontend-contactos` (ya commiteada por el
    otro carril, en review); sus capturas base esperan la aprobación del usuario.
  A 1440 y 1280 las dos media queries no se activan, así que este cambio no puede mover ninguna captura base.
- `npm run build` en verde.
- Las dos media queries no se activan entre 1181 y 1919px, así que por construcción las capturas base (1440/1280)
  no pueden cambiar; la tabla de arriba lo confirma con medidas.

## Qué falta / para decidir

- Si se quiere que también escalen el alto de botones (40/32), el alto de filas (44/48/36) y las medidas sueltas
  listadas arriba: hoy no salen de tokens (DESIGN.md §2/§5 los documenta como valores fijos), por lo que la regla
  «solo tokens» no los mueve.
- `.assoc__logo` de 40px (cabeceras) y `.assoc-card { gap: 6px }` quedan como están.
- Los dos avisos preexistentes (desplazamiento lateral de Informes ≤1280; insignia sobre el título de «Resumen de
  registro» a ≥1920).
