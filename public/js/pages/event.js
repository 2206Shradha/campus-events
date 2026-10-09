import { api, ApiError } from '../api.js';
import { state, navigate } from '../state.js';
import {
  html, mount, loading, errorState, banner, dateStub, fmtDate, fmtTime, spotsMeter, statusChip, toast, confirmAction, setBusy,
} from '../ui.js';

export async function render(main, { params, isCurrent }) {
  const id = params[0];
  mount(main, html`<div class="wrap page">${loading('Loading event…')}</div>`);

  let ev;
  try {
    ev = (await api(`/events/${id}`)).data;
  } catch (err) {
    if (!isCurrent()) return;
    if (err.status === 404) {
      mount(main, html`<div class="wrap page"><div class="state"><h2>Event not found</h2><p class="muted">It may have been removed.</p><a class="btn btn-primary" href="#/events">Browse events</a></div></div>`);
    } else {
      mount(main, html`<div class="wrap page">${errorState(err)}</div>`);
      main.querySelector('#retry').addEventListener('click', () => render(main, { params, isCurrent }));
    }
    return;
  }
  if (!isCurrent()) return;
  document.title = `${ev.title} – Campus Events`;

  const draw = () => {
    mount(main, html`
      <div class="wrap page">
        <a class="back-link" href="#/events">Back to all events</a>
        <div class="detail">
          <div>
            <div class="detail-hero" data-cat="${ev.category}">${banner(ev)}</div>
            <h1>${ev.title}</h1>
            <p>${statusChip(ev)}</p>
            <h2>About this event</h2>
            <p class="description">${ev.description || 'No description has been added yet.'}</p>
            <h2>Details</h2>
            <dl class="facts">
              <dt>Date</dt><dd>${fmtDate(ev.date)}</dd>
              <dt>Time</dt><dd>${fmtTime(ev.time)}</dd>
              <dt>Venue</dt><dd>${ev.venue}</dd>
              <dt>Organizer</dt><dd>${ev.organizer}</dd>
              <dt>Category</dt><dd>${ev.category}</dd>
              <dt>Capacity</dt><dd>${ev.capacity} seats</dd>
            </dl>
          </div>
          <aside class="panel panel-sticky" aria-label="Registration">
            <div style="display:flex;gap:1rem;align-items:center;margin-bottom:1rem">${dateStub(ev.date, { large: true, dim: ev.status !== 'upcoming' || ev.is_past })}
              <div><strong>${fmtDate(ev.date)}</strong><br><span class="muted">${fmtTime(ev.time)}</span></div></div>
            ${ev.status === 'upcoming' && !ev.is_past ? spotsMeter(ev) : ''}
            <div id="reg-area" style="margin-top:1rem">${registrationArea()}</div>
          </aside>
        </div>
      </div>`);
    wire();
  };

  function registrationArea() {
    const mine = ev.my_registration;
    if (ev.status === 'cancelled') return html`<div class="alert alert-error">This event was cancelled by the organizers.</div>`;
    if (ev.status === 'completed') return html`<div class="alert alert-info">This event has finished.</div>`;
    if (mine?.status === 'registered') {
      return html`
        <div class="alert alert-ok">You're registered for this event.</div>
        <p class="small muted" style="margin-bottom:0">Your registration ID – show it at check-in</p>
        <div class="reg-code">${mine.code}</div>
        ${ev.is_past ? '' : html`<button class="btn btn-danger-ghost btn-block" id="cancel-btn">Cancel registration</button>`}`;
    }
    if (ev.is_past) return html`<div class="alert alert-info">This event has already started, so registration is closed.</div>`;
    if (ev.is_full) return html`<div class="alert alert-error">This event is full.</div><button class="btn btn-primary btn-block" disabled>Event full</button>`;
    if (!state.user) {
      return html`<a class="btn btn-primary btn-block" href="#/login?next=${encodeURIComponent(`/events/${ev.id}`)}">Log in to register</a>
        <p class="small muted" style="margin:.75rem 0 0">New here? <a href="#/register?next=${encodeURIComponent(`/events/${ev.id}`)}">Create an account</a></p>`;
    }
    return html`<button class="btn btn-primary btn-block" id="register-btn">Register for this event</button>`;
  }

  function wire() {
    const regBtn = main.querySelector('#register-btn');
    regBtn?.addEventListener('click', async () => {
      setBusy(regBtn, true, 'Registering…');
      try {
        const res = await api(`/events/${ev.id}/register`, { method: 'POST' });
        ev = res.data;
        toast(`You're in! Your registration ID is ${res.code}`, 'success');
      } catch (err) {
        toast(err.message, 'error');
        // The page may be stale (someone else took the last seat / event changed) – refresh the numbers.
        if (['EVENT_FULL', 'ALREADY_REGISTERED', 'EVENT_CLOSED', 'EVENT_STARTED'].includes(err.code)) {
          try { ev = (await api(`/events/${ev.id}`)).data; } catch { /* keep old data */ }
        } else if (err instanceof ApiError && err.status === 401) {
          return navigate(`/login?next=${encodeURIComponent(`/events/${ev.id}`)}`);
        }
      }
      draw();
    });

    const cancelBtn = main.querySelector('#cancel-btn');
    cancelBtn?.addEventListener('click', async () => {
      const ok = await confirmAction({
        title: 'Cancel your registration?',
        message: `You'll give up your seat at "${ev.title}". You can register again later if spots are still available.`,
        confirmLabel: 'Cancel registration', danger: true,
      });
      if (!ok) return;
      setBusy(cancelBtn, true, 'Cancelling…');
      try {
        ev = (await api(`/events/${ev.id}/register`, { method: 'DELETE' })).data;
        toast('Registration cancelled', 'success');
      } catch (err) {
        toast(err.message, 'error');
      }
      draw();
    });
  }

  draw();
}
