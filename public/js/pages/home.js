import { api } from '../api.js';
import { html, mount, eventCard, gridSkeleton, errorState, emptyState, banner, dateStub, fmtTime, fmtDate, spotsMeter } from '../ui.js';

const QUICK_CATEGORIES = ['Technical', 'Workshop', 'Cultural', 'Sports', 'Career'];

export async function render(main, { isCurrent }) {
  mount(main, html`
    <section class="hero">
      <div class="wrap">
        <h1>Find what's happening on campus</h1>
        <p>Browse upcoming talks, workshops, matches and club nights at SRMIST, then save your seat in a couple of taps.</p>
        <form class="hero-search" id="hero-search" role="search">
          <label class="sr-only" for="hero-q">Search events</label>
          <input id="hero-q" name="q" type="search" placeholder="Search by name, venue or organizer">
          <button class="btn btn-primary" type="submit">Search events</button>
        </form>
        <div class="chip-row">
          ${QUICK_CATEGORIES.map((c) => html`<a class="chip-link" href="#/events?category=${c}">${c}</a>`)}
        </div>
      </div>
    </section>
    <div class="wrap">
      <section class="section" aria-labelledby="up-h">
        <div class="page-head"><h2 id="up-h">Coming up</h2><a href="#/events">See all events</a></div>
        <div id="home-list">${gridSkeleton(3)}</div>
      </section>
    </div>
    <div class="page"></div>`);

  main.querySelector('#hero-search').addEventListener('submit', (e) => {
    e.preventDefault();
    const q = new FormData(e.target).get('q').toString().trim();
    location.hash = `#/events${q ? `?q=${encodeURIComponent(q)}` : ''}`;
  });

  const box = main.querySelector('#home-list');
  const load = async () => {
    try {
      const { data } = await api('/events', { query: { limit: 7 } });
      if (!isCurrent()) return;
      if (!data.length) {
        mount(box, emptyState('No upcoming events yet', 'Check back soon – organizers add new events every week.'));
        return;
      }
      const [next, ...rest] = data;
      mount(box, html`
        <article class="feature" data-cat="${next.category}">
          ${banner(next, `#/events/${next.id}`)}
          <div class="feature-body">
            ${dateStub(next.date, { large: true })}
            <div>
              <p class="muted small" style="margin-bottom:.25rem">Next up</p>
              <h2><a href="#/events/${next.id}">${next.title}</a></h2>
              <p class="muted">${fmtDate(next.date)}, ${fmtTime(next.time)} at ${next.venue}</p>
              <div style="max-width:320px">${spotsMeter(next)}</div>
              <a class="btn btn-primary" href="#/events/${next.id}" style="margin-top:.75rem">View details</a>
            </div>
          </div>
        </article>
        ${rest.length ? html`<div class="grid" style="margin-top:1.25rem">${rest.map(eventCard)}</div>` : ''}`);
    } catch (err) {
      mount(box, errorState(err));
      box.querySelector('#retry').addEventListener('click', () => { mount(box, gridSkeleton(3)); load(); });
    }
  };
  await load();
}
