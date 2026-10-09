import { api } from '../api.js';
import { html, mount, eventCard, gridSkeleton, errorState, emptyState } from '../ui.js';

const STATUS_OPTIONS = [['upcoming', 'Upcoming'], ['completed', 'Completed'], ['cancelled', 'Cancelled'], ['all', 'All events']];

export async function render(main, { query, isCurrent }) {
  const filters = {
    q: query.q || '', category: query.category || '', date_from: query.date_from || '',
    date_to: query.date_to || '', status: query.status || 'upcoming', page: Number(query.page) || 1,
  };

  let categories = [];
  try { categories = (await api('/categories')).data; } catch { /* filter still works without the list */ }

  mount(main, html`
    <div class="wrap page">
      <div class="page-head"><div><h1>Events</h1><p class="muted">Search and filter everything happening on campus.</p></div></div>
      <form class="filters" id="filters" role="search">
        <div class="field"><label for="f-q">Search</label><input id="f-q" name="q" type="search" value="${filters.q}" placeholder="Name, venue, organizer"></div>
        <div class="field"><label for="f-cat">Category</label>
          <select id="f-cat" name="category"><option value="">All categories</option>
            ${categories.map((c) => html`<option value="${c}" ${c === filters.category ? 'selected' : ''}>${c}</option>`)}
          </select></div>
        <div class="field"><label for="f-from">From</label><input id="f-from" type="date" name="date_from" value="${filters.date_from}"></div>
        <div class="field"><label for="f-to">To</label><input id="f-to" type="date" name="date_to" value="${filters.date_to}"></div>
        <div class="field"><label for="f-status">Show</label>
          <select id="f-status" name="status">${STATUS_OPTIONS.map(([v, l]) => html`<option value="${v}" ${v === filters.status ? 'selected' : ''}>${l}</option>`)}</select></div>
        <div class="field"><button class="btn btn-ghost btn-block" type="button" id="clear">Clear filters</button></div>
      </form>
      <div id="results" aria-live="polite"></div>
    </div>`);

  const form = main.querySelector('#filters');
  const results = main.querySelector('#results');

  function pushFilters(next) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(next)) {
      if (v && !(k === 'status' && v === 'upcoming') && !(k === 'page' && v === 1)) params.set(k, v);
    }
    const qs = params.toString();
    history.replaceState(null, '', `#/events${qs ? `?${qs}` : ''}`); // keeps the URL shareable without re-rendering the form
  }

  async function load() {
    pushFilters(filters);
    mount(results, gridSkeleton(6));
    try {
      const { data, pagination } = await api('/events', { query: { ...filters, limit: 9 } });
      if (!isCurrent()) return;
      if (!data.length) {
        mount(results, emptyState('No events match', 'Try a different search or clear the filters.'));
        return;
      }
      mount(results, html`
        <div class="results-bar"><strong>${pagination.total} ${pagination.total === 1 ? 'event' : 'events'}</strong>
          <span class="muted small">Page ${pagination.page} of ${pagination.pages}</span></div>
        <div class="grid">${data.map(eventCard)}</div>
        ${pagination.pages > 1 ? html`
          <nav class="pager" aria-label="Pagination">
            <button class="btn btn-ghost" data-page="${pagination.page - 1}" ${pagination.page <= 1 ? 'disabled' : ''}>Previous</button>
            <span class="muted">Page ${pagination.page} of ${pagination.pages}</span>
            <button class="btn btn-ghost" data-page="${pagination.page + 1}" ${pagination.page >= pagination.pages ? 'disabled' : ''}>Next</button>
          </nav>` : ''}`);
    } catch (err) {
      mount(results, errorState(err));
      results.querySelector('#retry').addEventListener('click', load);
    }
  }

  results.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-page]');
    if (!btn || btn.disabled) return;
    filters.page = Number(btn.dataset.page);
    load().then(() => window.scrollTo({ top: 0 }));
  });

  let timer;
  form.addEventListener('input', (e) => {
    filters[e.target.name] = e.target.value;
    filters.page = 1;
    clearTimeout(timer);
    timer = setTimeout(load, e.target.name === 'q' ? 300 : 0); // debounce typing only
  });
  form.addEventListener('submit', (e) => e.preventDefault());
  main.querySelector('#clear').addEventListener('click', () => {
    Object.assign(filters, { q: '', category: '', date_from: '', date_to: '', status: 'upcoming', page: 1 });
    form.reset();
    form.elements.status.value = 'upcoming';
    load();
  });

  await load();
}
