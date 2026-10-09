import { api } from '../api.js';
import { state, navigate } from '../state.js';
import {
  html, mount, loading, errorState, emptyState, fmtDate, fmtTime, fmtDateTimeIso, toast, confirmAction,
  openDialog, showFieldErrors, setBusy,
} from '../ui.js';

const STATUSES = ['upcoming', 'completed', 'cancelled'];

export async function render(main, { query, isCurrent }) {
  if (!state.user) return navigate('/login?next=%2Fadmin');
  if (state.user.role !== 'admin') {
    mount(main, html`<div class="wrap page"><div class="state"><h2>Organizers only</h2><p class="muted">Your account doesn't have access to this page.</p><a class="btn btn-primary" href="#/events">Back to events</a></div></div>`);
    return;
  }

  let tab = query.tab === 'events' ? 'events' : 'overview';
  let categories = [];
  try { categories = (await api('/categories')).data; } catch { /* form falls back to text */ }
  if (!isCurrent()) return;

  const shell = () => {
    mount(main, html`
      <div class="wrap page">
        <div class="page-head"><div><h1>Organizer dashboard</h1><p class="muted">Manage events, registrations and attendance.</p></div>
          <button class="btn btn-primary" id="new-event">Create event</button></div>
        <div class="tabs" role="tablist">
          <button class="tab" role="tab" data-tab="overview" aria-selected="${tab === 'overview'}">Overview</button>
          <button class="tab" role="tab" data-tab="events" aria-selected="${tab === 'events'}">Events</button>
        </div>
        <div id="panel" role="tabpanel"></div>
      </div>`);
    main.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.tab; shell(); show(); }));
    main.querySelector('#new-event').addEventListener('click', () => eventForm());
  };

  const panel = () => main.querySelector('#panel');
  const show = () => (tab === 'overview' ? overview() : eventsTable());

  // ---------- overview ----------
  async function overview() {
    mount(panel(), loading());
    try {
      const { totals, by_category: cats, top_events: top, daily } = (await api('/admin/stats')).data;
      // Always show 14 bars (days with no registrations are empty) so one busy day doesn't fill the chart.
      const counts = new Map(daily.map((d) => [d.day, d.registrations]));
      const days = Array.from({ length: 14 }, (_, i) => {
        const day = new Date(Date.now() - (13 - i) * 86400000).toISOString().slice(0, 10);
        return { day, registrations: counts.get(day) || 0 };
      });
      const maxDaily = Math.max(1, ...days.map((d) => d.registrations));
      const maxCat = Math.max(1, ...cats.map((c) => c.registrations));
      mount(panel(), html`
        <div class="tiles">
          <div class="tile"><strong>${totals.events}</strong><span>Events (${totals.active_events} upcoming)</span></div>
          <div class="tile"><strong>${totals.registrations}</strong><span>Active registrations</span></div>
          <div class="tile"><strong>${totals.checked_in}</strong><span>Checked in</span></div>
          <div class="tile"><strong>${totals.users}</strong><span>Student accounts</span></div>
        </div>
        <div class="two-col">
          <section class="panel"><h3>Seats filled, most popular events</h3>
            ${top.length ? html`<div class="bars">${top.map((e) => {
              const pct = Math.min(100, Math.round((e.registered / e.capacity) * 100));
              return html`<div class="bar-row"><span class="bar-label" title="${e.title}">${e.title}</span>
                <div class="meter ${pct >= 100 ? 'is-full' : pct >= 80 ? 'is-low' : ''}"><span style="width:${pct}%"></span></div>
                <span class="small muted">${e.registered}/${e.capacity}</span></div>`;
            })}</div>` : html`<p class="muted">No events yet.</p>`}
          </section>
          <section class="panel"><h3>Registrations by category</h3>
            ${cats.length ? html`<div class="bars">${cats.map((c) => html`<div class="bar-row"><span class="bar-label">${c.category}</span>
              <div class="meter"><span style="width:${Math.round((c.registrations / maxCat) * 100)}%"></span></div>
              <span class="small muted">${c.registrations}</span></div>`)}</div>` : html`<p class="muted">No data yet.</p>`}
          </section>
        </div>
        <section class="panel" style="margin-top:1.25rem"><h3>New registrations, last 14 days</h3>
          <div class="spark" role="img" aria-label="Registrations per day over the last 14 days">${days.map((d) =>
            html`<div class="${d.registrations ? '' : 'zero'}" title="${d.day}: ${d.registrations}" style="height:${d.registrations ? Math.round((d.registrations / maxDaily) * 100) : 0}%"></div>`)}</div>
        </section>`);
    } catch (err) {
      mount(panel(), errorState(err));
      panel().querySelector('#retry').addEventListener('click', overview);
    }
  }

  // ---------- events table ----------
  let page = 1;
  async function eventsTable() {
    mount(panel(), loading());
    try {
      const { data, pagination } = await api('/events', { query: { status: 'all', limit: 15, page } });
      if (!data.length) {
        mount(panel(), emptyState('No events yet', 'Create the first event to get started.'));
        return;
      }
      mount(panel(), html`
        <div class="table-wrap"><table>
          <thead><tr><th scope="col">Event</th><th scope="col">When</th><th scope="col">Status</th><th scope="col">Registered</th><th scope="col"><span class="sr-only">Actions</span></th></tr></thead>
          <tbody>${data.map((e) => html`
            <tr><td><strong>${e.title}</strong><br><span class="small muted">${e.category}, ${e.venue}</span></td>
              <td>${fmtDate(e.date)}<br><span class="small muted">${fmtTime(e.time)}</span></td>
              <td><label class="sr-only" for="st-${e.id}">Status of ${e.title}</label>
                <select id="st-${e.id}" data-status="${e.id}">${STATUSES.map((s) => html`<option value="${s}" ${s === e.status ? 'selected' : ''}>${s[0].toUpperCase() + s.slice(1)}</option>`)}</select></td>
              <td>${e.registered_count} / ${e.capacity}</td>
              <td><div class="row-actions">
                <button class="btn btn-ghost btn-sm" data-people="${e.id}" data-title="${e.title}">Participants</button>
                <button class="btn btn-ghost btn-sm" data-edit="${e.id}">Edit</button>
                <button class="btn btn-danger-ghost btn-sm" data-delete="${e.id}" data-title="${e.title}">Delete</button></div></td></tr>`)}
          </tbody></table></div>
        ${pagination.pages > 1 ? html`<nav class="pager" aria-label="Pagination">
          <button class="btn btn-ghost" data-page="${page - 1}" ${page <= 1 ? 'disabled' : ''}>Previous</button>
          <span class="muted">Page ${page} of ${pagination.pages}</span>
          <button class="btn btn-ghost" data-page="${page + 1}" ${page >= pagination.pages ? 'disabled' : ''}>Next</button></nav>` : ''}`);

      const root = panel();
      const byId = (id) => data.find((e) => e.id === Number(id));
      root.querySelectorAll('[data-page]').forEach((b) => b.addEventListener('click', () => { page = Number(b.dataset.page); eventsTable(); }));
      root.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => eventForm(byId(b.dataset.edit))));
      root.querySelectorAll('[data-people]').forEach((b) => b.addEventListener('click', () => participants(byId(b.dataset.people))));
      root.querySelectorAll('[data-delete]').forEach((b) => b.addEventListener('click', () => removeEvent(byId(b.dataset.delete))));
      root.querySelectorAll('[data-status]').forEach((s) => s.addEventListener('change', async () => {
        try {
          await api(`/events/${s.dataset.status}/status`, { method: 'PATCH', body: { status: s.value } });
          toast(`Marked as ${s.value}`, 'success');
        } catch (err) { toast(err.message, 'error'); }
        eventsTable();
      }));
    } catch (err) {
      mount(panel(), errorState(err));
      panel().querySelector('#retry').addEventListener('click', eventsTable);
    }
  }

  async function removeEvent(ev) {
    const ok = await confirmAction({
      title: 'Delete this event?',
      message: `"${ev.title}" and all ${ev.registered_count} registrations for it will be permanently removed. To keep the history, mark it as cancelled instead.`,
      confirmLabel: 'Delete event', danger: true,
    });
    if (!ok) return;
    try { await api(`/events/${ev.id}`, { method: 'DELETE' }); toast('Event deleted', 'success'); }
    catch (err) { toast(err.message, 'error'); }
    eventsTable();
  }

  // ---------- create / edit ----------
  function eventForm(ev) {
    const v = ev || { title: '', description: '', category: categories[0] || 'Other', date: '', time: '', venue: '', organizer: 'ACM Student Chapter', capacity: 50, image_url: '' };
    const dlg = openDialog(html`
      <form id="event-form" novalidate>
        <div class="dialog-head"><h2>${ev ? 'Edit event' : 'Create event'}</h2><button type="button" class="icon-btn" data-close aria-label="Close">×</button></div>
        <div class="dialog-body">
          <div id="form-alert" role="alert"></div>
          <div class="form-grid">
            <div class="field span-2"><label for="e-title">Title</label><input id="e-title" name="title" value="${v.title}" required maxlength="120"></div>
            <div class="field"><label for="e-cat">Category</label><select id="e-cat" name="category">${categories.map((c) => html`<option ${c === v.category ? 'selected' : ''}>${c}</option>`)}</select></div>
            <div class="field"><label for="e-cap">Capacity</label><input id="e-cap" name="capacity" type="number" min="1" value="${v.capacity}" required></div>
            <div class="field"><label for="e-date">Date</label><input id="e-date" name="date" type="date" value="${v.date}" required></div>
            <div class="field"><label for="e-time">Start time</label><input id="e-time" name="time" type="time" value="${v.time}" required></div>
            <div class="field"><label for="e-venue">Venue</label><input id="e-venue" name="venue" value="${v.venue}" required></div>
            <div class="field"><label for="e-org">Organizer</label><input id="e-org" name="organizer" value="${v.organizer}" required></div>
            <div class="field span-2"><label for="e-img">Banner image link (optional)</label><input id="e-img" name="image_url" type="url" value="${v.image_url}" placeholder="https://…"></div>
            <div class="field span-2"><label for="e-desc">Description</label><textarea id="e-desc" name="description">${v.description}</textarea></div>
          </div>
        </div>
        <div class="dialog-foot"><button type="button" class="btn btn-ghost" data-close>Cancel</button><button type="submit" class="btn btn-primary">${ev ? 'Save changes' : 'Create event'}</button></div>
      </form>`);
    const form = dlg.querySelector('#event-form');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = form.querySelector('button[type=submit]');
      const body = Object.fromEntries(new FormData(form));
      body.capacity = body.capacity === '' ? null : Number(body.capacity);
      showFieldErrors(form, {});
      dlg.querySelector('#form-alert').innerHTML = '';
      setBusy(btn, true, 'Saving…');
      try {
        await api(ev ? `/events/${ev.id}` : '/events', { method: ev ? 'PUT' : 'POST', body });
        toast(ev ? 'Event updated' : 'Event created', 'success');
        dlg.close();
        if (tab === 'events') eventsTable(); else { tab = 'events'; shell(); show(); }
      } catch (err) {
        setBusy(btn, false);
        showFieldErrors(form, err.details);
        mount(dlg.querySelector('#form-alert'), html`<div class="alert alert-error">${err.message}</div>`);
      }
    });
  }

  // ---------- participants + check-in ----------
  async function participants(ev) {
    const dlg = openDialog(html`
      <div class="dialog-head"><h2>Participants</h2><button type="button" class="icon-btn" data-close aria-label="Close">×</button></div>
      <div class="dialog-body" id="people-body">${loading()}</div>`);
    const body = dlg.querySelector('#people-body');

    async function load() {
      try {
        const { data } = await api(`/events/${ev.id}/registrations`);
        const active = data.filter((p) => p.status === 'registered');
        mount(body, html`
          <p class="muted">${ev.title}: ${active.length} registered, ${active.filter((p) => p.checked_in_at).length} checked in.</p>
          <form id="checkin-form" class="row-actions" style="align-items:end;margin-bottom:1rem" novalidate>
            <div class="field" style="flex:1;margin:0;min-width:200px"><label for="ci-code">Check in by registration ID</label>
              <input id="ci-code" name="code" placeholder="EVT-XXXX-XXXX" autocomplete="off" autocapitalize="characters"></div>
            <button class="btn btn-primary" type="submit">Check in</button>
          </form>
          ${data.length ? html`<div class="table-wrap"><table style="min-width:520px"><thead><tr><th scope="col">Name</th><th scope="col">Registration ID</th><th scope="col">Status</th></tr></thead><tbody>
            ${data.map((p) => html`<tr><td>${p.name}<br><span class="small muted">${p.email}</span></td>
              <td><span class="code-inline">${p.code}</span></td>
              <td>${p.status === 'cancelled' ? html`<span class="chip chip-bad">Cancelled</span>`
                : p.checked_in_at ? html`<span class="chip chip-ok" title="${fmtDateTimeIso(p.checked_in_at)}">Checked in</span>`
                : html`<button class="btn btn-ghost btn-sm" data-checkin="${p.code}">Check in</button>`}</td></tr>`)}
            </tbody></table></div>` : emptyState('No registrations yet', 'People who register will appear here.')}`);

        const doCheckIn = async (code) => {
          try {
            const res = await api(`/events/${ev.id}/check-in`, { method: 'POST', body: { code } });
            toast(res.message, 'success');
            await load();
          } catch (err) { toast(err.message, 'error'); }
        };
        body.querySelector('#checkin-form').addEventListener('submit', (e) => {
          e.preventDefault();
          doCheckIn(new FormData(e.target).get('code').toString().trim());
        });
        body.querySelectorAll('[data-checkin]').forEach((b) => b.addEventListener('click', () => doCheckIn(b.dataset.checkin)));
      } catch (err) {
        mount(body, errorState(err));
        body.querySelector('#retry').addEventListener('click', load);
      }
    }
    await load();
    dlg.addEventListener('close', () => { if (tab === 'events') eventsTable(); });
  }

  shell();
  await show();
}
