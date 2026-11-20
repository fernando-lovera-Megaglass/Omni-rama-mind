// Shared table pagination. Menus are wired by the caller with wireMenus.
export function pagination({ page = 1, pages = 1, size = 25 } = {}) {
  pages = Math.max(1, pages);
  page = Math.max(1, Math.min(page, pages));
  const numbers = new Set([1, pages]);
  for (let n = Math.max(1, page - 4); n <= Math.min(pages, page + 4); n++) numbers.add(n);
  if (pages <= 11) for (let n = 1; n <= pages; n++) numbers.add(n);
  let previous = 0;
  const buttons = [...numbers].sort((a, b) => a - b).map((n) => {
    const gap = previous && n > previous + 1 ? '<span class="pager__ellipsis" aria-hidden="true">…</span>' : '';
    previous = n;
    return `${gap}<button class="pager__num${n === page ? ' is-active' : ''}" type="button" data-pagination-page="${n}" ${n === page ? 'aria-current="page"' : ''}>${n}</button>`;
  }).join('');
  return `<nav class="pager pager--center" aria-label="Paginación">
    <button class="pager__btn" type="button" data-pagination-page="${page - 1}" ${page <= 1 ? 'disabled' : ''}>‹ Anterior</button>
    <span class="pager__nums">${buttons}</span>
    <button class="pager__btn" type="button" data-pagination-page="${page + 1}" ${page >= pages ? 'disabled' : ''}>Siguiente ›</button>
    <div class="menu pager__sizemenu">
      <button class="pager__btn" type="button" aria-haspopup="menu" aria-expanded="false">${size} por página <span class="caret"></span></button>
      <div class="menu__panel menu__panel--up" role="menu" aria-label="Registros por página">
        ${[25, 50, 100].map((n) => `<button class="menu__item" type="button" role="menuitemradio" aria-checked="${n === size}" data-pagination-size="${n}">${n} por página</button>`).join('')}
      </div>
    </div>
  </nav>`;
}

export function bindPagination(scope, onChange) {
  const pager = scope.querySelector('.pager');
  if (!pager) return;
  pager.onclick = (event) => {
    const button = event.target.closest('button');
    if (!button || button.disabled) return;
    if (button.dataset.paginationPage !== undefined) onChange({ page: Number(button.dataset.paginationPage) });
    if (button.dataset.paginationSize !== undefined) onChange({ page: 1, size: Number(button.dataset.paginationSize) });
  };
}
