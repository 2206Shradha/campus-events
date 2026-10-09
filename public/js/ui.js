// Small UI helpers: safe HTML templating, formatting, toasts, dialogs and shared components.

// ---------- escaping template tag ----------
class Raw { constructor(s) { this.s = s; } }
export const raw = (s) => new Raw(s);
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

function renderValue(v) {
  if (v instanceof Raw) return v.s;
  if (Array.isArray(v)) return v.map(renderValue).join('');
  if (v === null || v === undefined || v === false) return '';
  return esc(v);
}
/** html`<p>${userText}</p>` – every interpolation is escaped unless it is itself html`` output. */
export function html(strings, ...values) {
  let out = strings[0];
  values.forEach((v, i) => { out += renderValue(v) + strings[i + 1]; });
  return new Raw(out);
}
export function mount(el, template) { el.innerHTML = renderValue(template); }

// ---------- dates (strings are campus-local, so never run them through Date() timezone math) ----------
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function dateParts(date) {
  const [y, m, d] = date.split('-').map(Number);
  return { year: y, month: MONTHS[m - 1], day: d, weekday: DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()] };
}
export function fmtDate(date) {
  const p = dateParts(date);
  return `${p.weekday}, ${p.day} ${p.month} ${p.year}`;
}
export function fmtTime(time) {
  const [h, m] = time.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'pm' : 'am'}`;
}
export function fmtDateTimeIso(iso) {
  return new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

// ---------- feedback ----------
export function toast(message, type = 'info') {
  const box = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.setAttribute('role', type === 'error' ? 'alert' : 'status');
  el.textContent = message;
  box.appendChild(el);
  setTimeout(() => el.remove(), 4500);
}

export const loading = (label = 'Loading…') =>
  html`<div class="state" role="status"><div class="spinner"></div><p class="muted">${label}</p></div>`;

export const gridSkeleton = (n = 6) =>
  html`<div class="grid" aria-busy="true" aria-label="Loading events">${Array.from({ length: n }, () => html`<div class="skeleton"></div>`)}</div>`;

export const emptyState = (title, message, action) =>
  html`<div class="state"><h3>${title}</h3><p class="muted">${message}</p>${action || ''}</div>`;

export const errorState = (err, retryId = 'retry') =>
  html`<div class="state"><h3>Couldn't load this page</h3><p class="muted">${err.message}</p><button class="btn btn-ghost" id="${retryId}">Try again</button></div>`;

/** Promise-based confirm dialog (replaces window.confirm so it matches the UI). */
export function confirmAction({ title, message, confirmLabel = 'Confirm', danger = false }) {
  return new Promise((resolve) => {
    const dlg = document.createElement('dialog');
    mount(dlg, html`
      <div class="dialog-head"><h2>${title}</h2></div>
      <div class="dialog-body"><p>${message}</p></div>
      <div class="dialog-foot">
        <button class="btn btn-ghost" data-v="no">Keep it</button>
        <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-v="yes">${confirmLabel}</button>
      </div>`);
    document.body.appendChild(dlg);
    dlg.addEventListener('click', (e) => {
      const v = e.target.closest('[data-v]')?.dataset.v;
      if (v) dlg.close(v);
    });
    dlg.addEventListener('close', () => { resolve(dlg.returnValue === 'yes'); dlg.remove(); });
    dlg.showModal();
  });
}

/** Open a modal whose content is `template`; returns the <dialog> element. */
export function openDialog(template) {
  const dlg = document.createElement('dialog');
  mount(dlg, template);
  document.body.appendChild(dlg);
  dlg.addEventListener('close', () => dlg.remove());
  dlg.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) dlg.close(); });
  dlg.showModal();
  return dlg;
}

// ---------- shared components ----------
export function dateStub(date, { large = false, dim = false } = {}) {
  const p = dateParts(date);
  return html`<div class="stub ${large ? 'stub-lg' : ''} ${dim ? 'is-dim' : ''}" aria-hidden="true"><span class="stub-month">${p.month}</span><span class="stub-day">${p.day}</span></div>`;
}

export function banner(ev, href) {
  const tag = href ? 'a' : 'div';
  const inner = html`${ev.image_url ? html`<img src="${ev.image_url}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ''}<span>${ev.category}</span>`;
  return raw(`<${tag} class="banner ${ev.image_url ? 'has-image' : ''}" data-cat="${esc(ev.category)}"${href ? ` href="${esc(href)}" tabindex="-1" aria-hidden="true"` : ''}>${inner.s}</${tag}>`);
}

export function spotsMeter(ev) {
  const pct = Math.min(100, Math.round((ev.registered_count / ev.capacity) * 100));
  const cls = ev.is_full ? 'is-full' : pct >= 80 ? 'is-low' : '';
  return html`
    <div class="meter ${cls}" role="img" aria-label="${ev.registered_count} of ${ev.capacity} spots taken"><span style="width:${pct}%"></span></div>
    <p class="spots"><span>${ev.is_full ? 'Full' : `${ev.spots_left} of ${ev.capacity} spots left`}</span>${ev.my_registration?.status === 'registered' ? html`<span class="chip chip-ok">You're registered</span>` : ''}</p>`;
}

export function statusChip(ev) {
  if (ev.status === 'cancelled') return html`<span class="chip chip-bad">Cancelled</span>`;
  if (ev.status === 'completed') return html`<span class="chip">Completed</span>`;
  if (ev.is_past) return html`<span class="chip">Started</span>`;
  return '';
}

export function eventCard(ev) {
  const href = `#/events/${ev.id}`;
  const dim = ev.status !== 'upcoming' || ev.is_past;
  return html`
    <article class="card" data-cat="${ev.category}">
      ${banner(ev, href)}
      <div class="card-body">
        ${dateStub(ev.date, { dim })}
        <div class="card-main">
          <h3><a href="${href}">${ev.title}</a></h3>
          <p class="card-meta">${fmtTime(ev.time)} at ${ev.venue}<br>${ev.organizer}</p>
          <div class="card-foot">${statusChip(ev)}${ev.status === 'upcoming' && !ev.is_past ? spotsMeter(ev) : ''}</div>
        </div>
      </div>
    </article>`;
}

/** Show server-side field errors under the matching inputs of a form. */
export function showFieldErrors(form, details = {}) {
  form.querySelectorAll('.field').forEach((f) => {
    f.classList.remove('has-error');
    f.querySelector('.field-error')?.remove();
  });
  for (const [name, message] of Object.entries(details)) {
    const input = form.elements[name];
    const field = input?.closest('.field');
    if (!field) continue;
    field.classList.add('has-error');
    input.setAttribute('aria-invalid', 'true');
    const p = document.createElement('p');
    p.className = 'field-error';
    p.textContent = message;
    field.appendChild(p);
  }
  form.querySelector('.has-error input, .has-error select, .has-error textarea')?.focus();
}

export function setBusy(button, busy, busyLabel = 'Please wait…') {
  if (busy) { button.dataset.label = button.textContent; button.textContent = busyLabel; }
  else if (button.dataset.label) button.textContent = button.dataset.label;
  button.disabled = busy;
}
