import { api } from '../api.js';
import { setUser, navigate } from '../state.js';
import { html, mount, showFieldErrors, setBusy, toast } from '../ui.js';

const isSafePath = (next) => typeof next === 'string' && next.startsWith('/') && !next.startsWith('//');

function authForm(main, { title, intro, fields, submitLabel, busyLabel, endpoint, query, footer, extra = '' }) {
  mount(main, html`
    <div class="wrap">
      <div class="auth-card">
        <h1>${title}</h1>
        <p class="muted">${intro}</p>
        <div id="form-alert" role="alert"></div>
        <form id="auth-form" novalidate>
          ${fields.map((f) => html`
            <div class="field"><label for="a-${f.name}">${f.label}</label>
              <input id="a-${f.name}" name="${f.name}" type="${f.type}" autocomplete="${f.autocomplete}" ${f.required === false ? '' : 'required'}>
              ${f.hint ? html`<p class="hint">${f.hint}</p>` : ''}</div>`)}
          <button class="btn btn-primary btn-block" type="submit">${submitLabel}</button>
        </form>
        <p class="small muted" style="margin:1rem 0 0">${footer}</p>
        ${extra}
      </div>
    </div>`);

  const form = main.querySelector('#auth-form');
  const alertBox = main.querySelector('#form-alert');
  form.querySelector('input')?.focus();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type=submit]');
    alertBox.innerHTML = '';
    showFieldErrors(form, {});
    setBusy(btn, true, busyLabel);
    try {
      const body = Object.fromEntries(new FormData(form));
      const { token, user } = await api(endpoint, { method: 'POST', body });
      setUser(token, user);
      toast(`Welcome, ${user.name.split(' ')[0]}!`, 'success');
      navigate(isSafePath(query.next) ? query.next : user.role === 'admin' ? '/admin' : '/dashboard');
    } catch (err) {
      setBusy(btn, false);
      if (Object.keys(err.details).length) showFieldErrors(form, err.details);
      mount(alertBox, html`<div class="alert alert-error">${err.message}</div>`);
    }
  });
}

export async function renderLogin(main, { query }) {
  authForm(main, {
    title: 'Log in',
    intro: 'Welcome back. Log in to register for events and see your registrations.',
    fields: [
      { name: 'email', label: 'Email', type: 'email', autocomplete: 'email' },
      { name: 'password', label: 'Password', type: 'password', autocomplete: 'current-password' },
    ],
    submitLabel: 'Log in', busyLabel: 'Logging in…', endpoint: '/auth/login', query,
    footer: html`No account yet? <a href="#/register${query.next ? `?next=${encodeURIComponent(query.next)}` : ''}">Sign up</a>`,
    extra: html`<div class="demo-box"><strong>Test credentials</strong><br>
      Student: <code>student@srmist.test</code> / <code>Student@123</code><br>
      Organizer: <code>admin@srmist.test</code> / <code>Admin@12345</code></div>`,
  });
}

export async function renderRegister(main, { query }) {
  authForm(main, {
    title: 'Create your account',
    intro: 'It takes a minute. You can then register for any event on campus.',
    fields: [
      { name: 'name', label: 'Full name', type: 'text', autocomplete: 'name' },
      { name: 'email', label: 'Email', type: 'email', autocomplete: 'email' },
      { name: 'password', label: 'Password', type: 'password', autocomplete: 'new-password', hint: 'At least 8 characters, with a letter and a number.' },
    ],
    submitLabel: 'Create account', busyLabel: 'Creating account…', endpoint: '/auth/register', query,
    footer: html`Already registered? <a href="#/login${query.next ? `?next=${encodeURIComponent(query.next)}` : ''}">Log in</a>`,
  });
}
