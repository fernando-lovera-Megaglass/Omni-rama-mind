# Inventario de las 83 declaraciones con `--sp-12` / `--sp-48` en `src/app.css` (líneas de ANTES del cambio)

Acción: **quitada** (no pintaba nada y nada toma el relevo) · **escrita con el valor actual** (al quitarla, otra regla anterior o el valor por defecto del navegador pasaría a verse: se deja `0`/`auto`, que es exactamente lo que pinta hoy) · **sin tocar**.
«Medida en»: pantallas o sub-estados (de los 30 + 95 medidos con Playwright) donde la regla alcanza elementos; vacío = no se renderiza en ningún estado medido (el análisis se hizo sobre el CSS y las plantillas).

| Línea | Selector | Declaración | Acción | Motivo / qué tomaría el relevo | Medida en |
|---|---|---|---|---|---|
| 691 | `.acrop` | `margin: var(--sp-12) 0` | quitada |  |  |
| 720 | `.acrop__zoom` | `gap: var(--sp-12)` | quitada |  |  |
| 1517 | `.estate--compact` | `padding: var(--sp-16) var(--sp-12)` | escrita con el valor actual: `padding: 0` | tapaba `.estate { padding: var(--sp-32) var(--sp-16) }` (L1454) | datos |
| 2690 | `.seg__searchrow` | `margin-bottom: var(--sp-12)` | quitada |  | segmentos |
| 2816 | `.seg__stat` | `padding: var(--sp-12) var(--sp-16)` | quitada |  |  |
| 2964 | `.sedit__filters-head, .sedit__preview-head` | `margin-bottom: var(--sp-12)` | quitada |  | segmento-editar |
| 2980 | `.sedit__ai` | `margin-bottom: var(--sp-12)` | quitada (la regla queda vacía y se quita entera) |  | segmento-editar |
| 3048 | `.sedit__addmember` | `margin-bottom: var(--sp-12)` | quitada (la regla queda vacía y se quita entera) |  | segmento-editar |
| 3320 | `.imp__map th, .imp__map td` | `padding: var(--sp-10) var(--sp-12)` | escrita con el valor actual: `padding: 0` | tapaba `.table th, .table td { padding: 0 var(--sp-16) }` (L1182); sin ninguna regla, `<td>/<th>` tendrían 1px del navegador | importar-mapeo |
| 3371 | `.imp__consent` | `padding: var(--sp-12) var(--sp-16)` | quitada |  |  |
| 3544 | `.imp__stat` | `padding: var(--sp-12) var(--sp-16)` | quitada |  |  |
| 3566 | `.imp__errors td, .imp__failed td, .imp__errors th, .imp__failed th` | `padding: var(--sp-8) var(--sp-12)` | escrita con el valor actual: `padding: 0` | tapaba `.table th, .table td { padding: 0 var(--sp-16) }` (L1182) |  |
| 4959 | `.kcol--collapsed.tip .tip__text` | `top: var(--sp-12)` | escrita con el valor actual: `top: auto` | tapaba `.tip__text { top: calc(100% + 10px) }` (L4682): el globo de la columna plegada se movería | negocios-tablero-plegado |
| 5027 | `.pmenu` | `padding: var(--sp-12) 0 0` | escrita con el valor actual: `padding: 0` | tapaba `.menu__panel { padding: var(--sp-8) 0 }` (L1370) | negocios-lista, negocios-menu-pipeline, negocios-tablero, negocios-tablero-plegado, tickets-lista |
| 5032 | `.pmenu__search` | `margin: 0 var(--sp-12) var(--sp-8)` | quitada |  | negocios-lista, negocios-menu-pipeline, negocios-tablero, negocios-tablero-plegado, tickets-lista |
| 5062 | `.pmenu__item` | `gap: var(--sp-12)` | quitada |  | negocios-lista, negocios-menu-pipeline, negocios-tablero, negocios-tablero-plegado, tickets-lista |
| 5087 | `.pmenu__empty` | `padding: var(--sp-12) var(--sp-20)` | quitada |  |  |
| 5093 | `.pmenu__foot` | `padding: var(--sp-12) var(--sp-20)` | quitada |  | negocios-lista, negocios-menu-pipeline, negocios-tablero, negocios-tablero-plegado, tickets-lista |
| 5122 | `.kpis` | `padding: var(--sp-12) var(--sp-8)` | quitada |  | contactos-lista, empresas-lista, informes, negocios-lista, negocios-menu-pipeline … (10) |
| 5195 | `.kpi__value` | `margin-top: var(--sp-12)` | escrita con el valor actual: `margin-top: 0` | en informes personalizados el valor es un `<p>`: sin regla, el navegador le pone `margin: 1em 0` | informes, negocios-lista, negocios-menu-pipeline, negocios-tablero, negocios-tablero-plegado … (6) |
| 10290 | `.snav--rail` | `gap: var(--sp-12)` | quitada |  | settings-rail |
| 10465 | `.gsave` | `padding: var(--sp-12) 0` | quitada |  | configuracion, settings-obj-companies-lifecycle, settings-obj-contacts-lifecycle, settings-prefs-general, settings-rail |
| 10918 | `.ofield .muted` | `margin: 0 0 var(--sp-12)` | escrita con el valor actual: `margin: 0` | es un `<p class="muted">`: sin regla, margen `1em 0` del navegador | settings-data-objects, settings-obj-deals-config, settings-obj-deals-lifecycle, settings-obj-tickets-config, settings-obj-tickets-lifecycle |
| 10934 | `.ginput--xs` | `padding: 0 var(--sp-12)` | escrita con el valor actual: `padding: 0` | tapaba `.ginput { padding: 0 var(--sp-20) }` (L10420) | settings-data-objects, settings-obj-deals-config, settings-obj-deals-lifecycle |
| 10940 | `.ocheck` | `gap: var(--sp-12)` | quitada |  | settings-data-objects, settings-obj-companies-config, settings-obj-companies-index, settings-obj-companies-pipelines, settings-obj-contacts-config … (13) |
| 10978 | `.oradio` | `gap: var(--sp-12)` | quitada |  | settings-data-objects, settings-obj-deals-config, settings-obj-deals-lifecycle |
| 10979 | `.oradio` | `margin: var(--sp-12) 0` | quitada |  | settings-data-objects, settings-obj-deals-config, settings-obj-deals-lifecycle |
| 11061 | `.opreview` | `gap: var(--sp-12)` | quitada |  |  |
| 11062 | `.opreview` | `padding: var(--sp-12)` | quitada |  |  |
| 11114 | `.opreview__tabs` | `gap: var(--sp-12)` | quitada |  |  |
| 11346 | `.acc__radio` | `gap: var(--sp-12)` | quitada |  |  |
| 11389 | `.acc__tabs` | `margin: var(--sp-12) 0 var(--sp-16)` | quitada |  |  |
| 11470 | `.pvedit` | `padding: var(--sp-24) var(--sp-32) var(--sp-48)` | quitada |  | diseno-previsualizacion |
| 11505 | `.pvedit__mockhead` | `gap: var(--sp-12)` | quitada |  |  |
| 11537 | `.pvmock__head` | `gap: var(--sp-12)` | quitada |  |  |
| 11556 | `.pvmock__quick` | `padding: var(--sp-12) var(--sp-16)` | quitada |  |  |
| 11568 | `.pvmock__card` | `padding: var(--sp-12) var(--sp-16)` | quitada |  |  |
| 11605 | `.pvmock__foot` | `padding: var(--sp-12) var(--sp-16)` | quitada (la regla queda vacía y se quita entera) |  |  |
| 11619 | `.pvcard` | `padding: var(--sp-12) var(--sp-20)` | quitada |  |  |
| 11650 | `.uname` | `gap: var(--sp-12)` | quitada |  | settings-account-users |
| 11722 | `.seat > p` | `margin: 0 0 var(--sp-12)` | escrita con el valor actual: `margin: 0` | `<p>`: sin regla, margen `1em 0` del navegador |  |
| 11745 | `.seat__foot` | `margin-top: var(--sp-12)` | quitada |  |  |
| 11749 | `.permgroup` | `margin: 0 0 var(--sp-12)` | escrita con el valor actual: `margin: 0` | `<fieldset>`: sin regla, `margin: 0 2px` del navegador |  |
| 11750 | `.permgroup` | `padding: var(--sp-12) var(--sp-16)` | escrita con el valor actual: `padding: 0` | `<fieldset>`: sin regla, `padding: 0.35em 0.75em 0.625em` del navegador |  |
| 11767 | `#s-modal .pgrid` | `gap: var(--sp-12) var(--sp-16)` | quitada |  |  |
| 11858 | `.mv__list` | `margin: var(--sp-12) 0 var(--sp-16)` | quitada (la regla queda vacía y se quita entera) |  | administrar-vistas, vistas-pestana-2, vistas-pestana-3 |
| 11885 | `.mv__search` | `margin: var(--sp-12) 0` | quitada |  | administrar-vistas, vistas-pestana-2, vistas-pestana-3, vistas-tabla |
| 11893 | `.mv__main` | `padding: var(--sp-24) var(--sp-24) var(--sp-48)` | quitada (la regla queda vacía y se quita entera) |  | administrar-vistas, vistas-pestana-2, vistas-pestana-3, vistas-tabla |
| 11899 | `.mv__banner` | `gap: var(--sp-12)` | quitada |  | administrar-vistas, vistas-pestana-2, vistas-pestana-3 |
| 11923 | `.mv__title` | `margin-bottom: var(--sp-12)` | quitada |  | administrar-vistas, vistas-pestana-2, vistas-pestana-3 |
| 11942 | `.mv__tab` | `gap: var(--sp-12)` | quitada |  | administrar-vistas, vistas-pestana-2, vistas-pestana-3 |
| 11945 | `.mv__tab` | `padding: var(--sp-12) var(--sp-12) var(--sp-12) var(--sp-16)` | quitada |  | administrar-vistas, vistas-pestana-2, vistas-pestana-3 |
| 12022 | `.mvtable td` | `padding-top: var(--sp-12)` | escrita con el valor actual: `padding-top: 0` | tapaba `.mini-table th, .mini-table td { padding: var(--sp-10) var(--sp-8) }` (L2208) | vistas-tabla |
| 12023 | `.mvtable td` | `padding-bottom: var(--sp-12)` | escrita con el valor actual: `padding-bottom: 0` | ídem L2208 | vistas-tabla |
| 12099 | `.ixpick__sel li` | `padding: var(--sp-8) var(--sp-12)` | quitada |  |  |
| 12176 | `.ptabs button` | `padding: var(--sp-12) var(--sp-24)` | escrita con el valor actual: `padding: 0` | `<button>`: sin regla, `padding: 1px 6px` del navegador (pestañas de redacción de la Bandeja) | bandeja, settings-obj-companies-lifecycle, settings-obj-contacts-lifecycle, settings-obj-deals-pipelines, settings-obj-tickets-pipelines … (7) |
| 12196 | `.pcolors` | `margin-top: var(--sp-12)` | quitada |  | settings-obj-companies-lifecycle, settings-obj-contacts-lifecycle, settings-obj-deals-pipelines, settings-sl-deals |
| 12381 | `.ptabs--sub button` | `padding: var(--sp-12) var(--sp-16)` | escrita con el valor actual: `padding: 0` | ídem: `padding: 1px 6px` del navegador | bandeja, settings-obj-companies-lifecycle, settings-obj-contacts-lifecycle |
| 12401 | `.ptable--stages th` | `padding: var(--sp-12) var(--sp-16) var(--sp-16)` | escrita con el valor actual: `padding: 0` | tapaba `.mini-table th { padding: var(--sp-10) var(--sp-8) }` (L2208) | settings-obj-companies-lifecycle, settings-obj-contacts-lifecycle |
| 12577 | `.logic__btns` | `gap: var(--sp-12)` | quitada |  |  |
| 12629 | `.lcond` | `gap: var(--sp-12)` | quitada |  |  |
| 12630 | `.lcond` | `margin: var(--sp-10) var(--sp-12)` | quitada |  |  |
| 12631 | `.lcond` | `padding: var(--sp-12) var(--sp-16)` | quitada |  |  |
| 12650 | `.lgroup > .pill` | `margin: 0 var(--sp-12) var(--sp-12)` | quitada (la regla queda vacía y se quita entera) |  |  |
| 12691 | `.lpreview__field` | `margin: var(--sp-12) 0` | quitada (la regla queda vacía y se quita entera) |  |  |
| 12727 | `.lcinfo` | `padding: var(--sp-12) var(--sp-20)` | quitada |  | settings-obj-companies-lifecycle, settings-obj-contacts-lifecycle |
| 14258 | `.log-attendees` | `margin: 0 0 var(--sp-12)` | escrita con el valor actual: `margin: 0` | `<fieldset>`: sin regla, `margin: 0 2px` del navegador | ficha-modal-reunion |
| 14334 | `.funnel__row` | `gap: var(--sp-12)` | quitada |  | informes |
| 14375 | `.funnel__conv` | `padding: 0 0 var(--sp-4) calc(140px + var(--sp-12))` | quitada |  | informes |
| 18265 | `.wfl__head` | `margin-bottom: var(--sp-12)` | escrita con el valor actual: `margin-bottom: 0` | tapaba `.tpls__head { margin-bottom: var(--sp-16) }` (L15164): la cabecera de Workflows bajaría 16px | workflows |
| 18350 | `.wfe__bar` | `gap: var(--sp-12)` | escrita con el valor actual: `gap: 0` | tapaba `.wfe__bar { gap: var(--sp-16) }` (L17461): la barra del editor se abriría 16px entre elementos | workflow-crear, workflow-editor, workflows-editor-ayuda |
| 18502 | `.wfe__help section + section` | `margin-top: var(--sp-12)` | quitada (la regla queda vacía y se quita entera) |  | workflows-editor-ayuda |
| 19064 | `.callreview__section` | `padding-top: var(--sp-12, 12px)` | sin tocar | NO está muerta: tiene reserva `12px` y pinta 12px hoy. No es de las 80 anuladas; fuera del alcance, pendiente de decisión |  |
| 19509 | `.dtags__bar` | `gap: var(--sp-12)` | quitada |  |  |
| 19510 | `.dtags__bar` | `margin-bottom: var(--sp-12)` | quitada |  |  |
| 19573 | `.dtags__name` | `gap: var(--sp-12)` | quitada |  |  |
| 19595 | `.dtags__list` | `margin: 0 0 var(--sp-12)` | escrita con el valor actual: `margin: 0` | `<ul>`: sin regla, `margin: 1em 0` del navegador |  |
| 19617 | `.dtag__body` | `gap: var(--sp-12)` | escrita con el valor actual: `gap: 0` | tapaba `.drawer__body { gap: var(--sp-16) }` (L1639) |  |
| 19790 | `.dtag__empty` | `gap: var(--sp-12)` | quitada |  |  |
| 20650 | `.record__left.is-collapsed .record__colbar, .record__right.is-collapsed .record__colbar` (@media (max-width: 900px)) | `padding: var(--sp-8) var(--sp-12)` | escrita con el valor actual: `padding: 0` | tapaba `.record__colbar { padding: var(--sp-8) 0 }` (L13003); solo a ≤900px | contactos-ficha, empresas-ficha, ficha-modal-reunion, negocios-ficha, tareas-ficha … (6) |
| 20834 | `.custom-library .search` | `margin: var(--sp-12) 0` | quitada (la regla queda vacía y se quita entera) |  | informes |
| 20836 | `.custom-library form > .field` | `margin-bottom: var(--sp-12)` | quitada (la regla queda vacía y se quita entera) |  |  |
| 20841 | `.custom-library-row__actions` | `gap: var(--sp-12)` | quitada |  |  |
