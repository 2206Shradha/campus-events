import { api, session } from './api.js';
import { html, mount, esc } from './ui.js';
import { state, navigate } from './state.js';

const routes = [
  [/^\/?$/, () => import('./pages/home.js')],
  [/^\/events\/?$/, () => import('./pages/events.js')],
  [/^\/events\/(\d+)\/?$/, () => import('./pages/event.js')],
  [/^\/login\/?$/, () => import('./pages/auth.js').then((m) => ({ render: m.renderLogin }))],
  [/^\/register\/?$/, () => import('./pages/auth.js').then((m) => ({ render: m.renderRegister }))],
  [/^\/dashboard\/?$/, () => import('./pages/dashboard.js')],
  [/^\/admin\/?$/, () => import('./pages/admin.js')],
];

function parseHash() {
  const raw = location.hash.slice(1) || '/';
  const [path, qs = ''] = raw.split('?');
  return { path, query: Object.fromEntries(new URLSearchParams(qs)) };
}

function renderHeader() {
  const { path } = parseHash();
  const cur = (p) => (p === '/' ? path === '/' : path.startsWith(p)) ? ' aria-current="page"' : '';
  const u = state.user;
  const el = document.getElementById('site-header');
  el.innerHTML = `
    <div class="wrap nav">
      <a class="brand" href="#/"><span class="brand-mark" aria-hidden="true"></span>Campus Events</a>
      <nav class="nav-links" aria-label="Main">
        <a href="#/events"${cur('/events')}>Events</a>
        ${u ? `<a href="#/dashboard"${cur('/dashboard')}>My registrations</a>` : ''}
        ${u?.role === 'admin' ? `<a href="#/admin"${cur('/admin')}>Organizer</a>` : ''}
        ${u ? `<span class="nav-user">${esc(u.name)}</span><button id="logout" type="button">Log out</button>`
            : `<a href="#/login"${cur('/login')}>Log in</a><a class="nav-cta" href="#/register">Sign up</a>`}
      </nav>
    </div>`;
  el.querySelector('#logout')?.addEventListener('click', logout);
}

function logout() {
  session.token = null;
  state.user = null;
  renderHeader();
  navigate('/');
}

async function loadUser() {
  if (!session.token) { state.user = null; return; }
  try {
    state.user = (await api('/auth/me')).user;
  } catch (err) {
    state.user = null;
    if (err.status === 401) session.token = null;
  }
}

let renderId = 0;
async function render() {
  const myId = ++renderId;
  const { path, query } = parseHash();
  const main = document.getElementById('main');
  renderHeader();

  const hit = routes.map(([re, load]) => [re.exec(path), load]).find(([m]) => m);
  if (!hit) {
    mount(main, html`<div class="wrap page"><div class="state"><h2>Page not found</h2><p class="muted">That page doesn't exist.</p><a class="btn btn-primary" href="#/events">Browse events</a></div></div>`);
    return;
  }
  const [match, load] = hit;
  try {
    const page = await load();
    if (myId !== renderId) return; // user navigated away while the module loaded
    document.title = 'Campus Events – SRMIST';
    await page.render(main, { params: match.slice(1), query, user: state.user, isCurrent: () => myId === renderId });
    if (myId === renderId) { window.scrollTo(0, 0); main.focus({ preventScroll: true }); }
  } catch (err) {
    console.error(err);
    mount(main, html`<div class="wrap page"><div class="state"><h2>Something went wrong</h2><p class="muted">${err.message}</p><a class="btn btn-ghost" href="#/">Go home</a></div></div>`);
  }
}

window.addEventListener('hashchange', render);
window.addEventListener('user-changed', renderHeader);
window.addEventListener('auth-changed', async () => { await loadUser(); renderHeader(); });
await loadUser();
render();
