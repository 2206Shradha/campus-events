import { api } from '../api.js';
import { state, navigate } from '../state.js';
import {
  html, mount, loading, errorState, emptyState, dateStub, fmtDate, fmtTime, toast, confirmAction, statusChip,
} from '../ui.js';

const TABS = [['upcoming', 'Upcoming'], ['past', 'Past'], ['cancelled', 'Cancelled']];

function bucket(r) {
  if (r.status === 'cancelled') return 'cancelled';
  if (r.event.status === 'cancelled') return 'cancelled';
  return r.event.status === 'completed' || r.event.is_past ? 'past' : 'upcoming';
}

export async function render(main, { isCurrent }) {
  if (!state.user) return navigate('/login?next=%2Fdashboard');
  mount(main, html`<div class="wrap page">${loading('Loading your registrations…')}</div>`);

  let regs;
  const load = async () => {
    try {
      regs = (await api('/registrations/me')).data;
    } catch (err) {
      if (!isCurrent()) return false;
      mount(main, html`<div class="wrap page">${errorState(err)}</div>`);
      main.querySelector('#retry').addEventListener('click', () => render(main, { isCurrent }));
      return false;
    }
    return isCurrent();
  };
  if (!(await load())) return;

  let tab = 'upcoming';

  const draw = () => {
    const groups = { upcoming: [], past: [], cancelled: [] };
    regs.forEach((r) => groups[bucket(r)].push(r));
    groups.upcoming.sort((a, b) => `${a.event.date}${a.event.time}`.localeCompare(`${b.event.date}${b.event.time}`));
    const attended = groups.past.filter((r) => r.checked_in_at).length;
    const list = groups[tab];

    mount(main, html`
      <div class="wrap page">
        <div class="page-head"><div><h1>My registrations</h1><p class="muted">Hi ${state.user.name.split(' ')[0]} – here are your events.</p></div>
          <a class="btn btn-primary" href="#/events">Find more events</a></div>
        <div class="tiles">
          <div class="tile"><strong>${groups.upcoming.length}</strong><span>Upcoming</span></div>
          <div class="tile"><strong>${groups.past.length}</strong><span>Past events</span></div>
          <div class="tile"><strong>${attended}</strong><span>Attended</span></div>
        </div>
        <div class="tabs" role="tablist">
          ${TABS.map(([k, label]) => html`<button class="tab" role="tab" data-tab="${k}" aria-selected="${tab === k}">${label} (${groups[k].length})</button>`)}
        </div>
        <div class="reg-list" role="tabpanel">
          ${list.length ? list.map(item) : emptyFor(tab)}
        </div>
      </div>`);

    main.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.tab; draw(); }));
    main.querySelectorAll('[data-cancel]').forEach((b) => b.addEventListener('click', () => cancel(Number(b.dataset.cancel))));
    main.querySelectorAll('[data-copy]').forEach((b) => b.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(b.dataset.copy); toast('Registration ID copied', 'success'); }
      catch { toast(`Your ID: ${b.dataset.copy}`); }
    }));
  };

  const emptyFor = (t) => ({
    upcoming: emptyState('Nothing coming up', "You haven't registered for any upcoming events yet.", html`<a class="btn btn-primary" href="#/events">Browse events</a>`),
    past: emptyState('No past events', 'Events you attend will show up here.'),
    cancelled: emptyState('No cancelled registrations', 'Registrations you cancel will be listed here.'),
  })[t];

  const item = (r) => {
    const ev = r.event;
    const canCancel = bucket(r) === 'upcoming';
    return html`
      <article class="reg-item">
        ${dateStub(ev.date, { dim: bucket(r) !== 'upcoming' })}
        <div class="grow">
          <h3><a href="#/events/${ev.id}">${ev.title}</a></h3>
          <p class="muted" style="margin:0">${fmtDate(ev.date)}, ${fmtTime(ev.time)} at ${ev.venue}</p>
          <p class="small muted" style="margin:.35rem 0 0">
            ${r.status === 'registered' ? html`Registration ID <span class="code-inline">${r.code}</span>` : 'Registration cancelled'}
            ${r.checked_in_at ? html` <span class="chip chip-ok">Checked in</span>` : ''} ${statusChip(ev)}
          </p>
        </div>
        <div class="row-actions">
          ${r.status === 'registered' ? html`<button class="btn btn-ghost btn-sm" data-copy="${r.code}">Copy ID</button>` : ''}
          ${canCancel ? html`<button class="btn btn-danger-ghost btn-sm" data-cancel="${ev.id}">Cancel</button>` : ''}
          ${bucket(r) === 'cancelled' && ev.status === 'upcoming' && !ev.is_past ? html`<a class="btn btn-ghost btn-sm" href="#/events/${ev.id}">Register again</a>` : ''}
        </div>
      </article>`;
  };

  async function cancel(eventId) {
    const r = regs.find((x) => x.event.id === eventId);
    const ok = await confirmAction({
      title: 'Cancel your registration?',
      message: `You'll give up your seat at "${r.event.title}".`,
      confirmLabel: 'Cancel registration', danger: true,
    });
    if (!ok) return;
    try {
      await api(`/events/${eventId}/register`, { method: 'DELETE' });
      toast('Registration cancelled', 'success');
      if (await load()) draw();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  draw();
}
