/* Cute floating mascot: wanders around on its own, drag it anywhere, click to make it hop. */
(() => {
  if (document.getElementById('mascot')) return;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // Presentation attributes only (no inline style="") so it works under a strict CSP.
  const svg = `
    <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="30" cy="22" rx="9" ry="13" fill="#f9a8d4" transform="rotate(-18 30 22)"/>
      <ellipse cx="70" cy="22" rx="9" ry="13" fill="#f9a8d4" transform="rotate(18 70 22)"/>
      <ellipse cx="30" cy="24" rx="4.5" ry="8" fill="#fde2ef" transform="rotate(-18 30 24)"/>
      <ellipse cx="70" cy="24" rx="4.5" ry="8" fill="#fde2ef" transform="rotate(18 70 24)"/>
      <ellipse cx="50" cy="58" rx="36" ry="33" fill="#c4b5fd"/>
      <ellipse cx="50" cy="68" rx="22" ry="19" fill="#ede9fe"/>
      <g class="mascot-eyes">
        <circle cx="37" cy="52" r="6" fill="#3b2a5a"/>
        <circle cx="63" cy="52" r="6" fill="#3b2a5a"/>
        <circle cx="39" cy="50" r="2" fill="#fff"/>
        <circle cx="65" cy="50" r="2" fill="#fff"/>
      </g>
      <g class="mascot-happy-eyes" fill="none" stroke="#3b2a5a" stroke-width="3.5" stroke-linecap="round">
        <path d="M31 54 Q37 46 43 54"/>
        <path d="M57 54 Q63 46 69 54"/>
      </g>
      <ellipse cx="26" cy="64" rx="6" ry="4" fill="#fda4af" opacity="0.7"/>
      <ellipse cx="74" cy="64" rx="6" ry="4" fill="#fda4af" opacity="0.7"/>
      <path d="M44 64 Q50 71 56 64" fill="none" stroke="#3b2a5a" stroke-width="3" stroke-linecap="round"/>
    </svg>`;

  const el = document.createElement('div');
  el.id = 'mascot';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = `<div class="mascot-bob">${svg}</div>`;
  document.body.appendChild(el);

  const size = () => el.offsetWidth || 72;
  let x = window.innerWidth - size() - 40;
  let y = window.innerHeight - size() - 40;
  let tx = x, ty = y;
  let nextPick = performance.now() + 1500;
  let dragging = false, moved = false;
  let offX = 0, offY = 0, startX = 0, startY = 0;

  function pickTarget(now) {
    const s = size();
    tx = rand(10, Math.max(20, window.innerWidth - s - 10));
    ty = rand(70, Math.max(100, window.innerHeight - s - 10));
    nextPick = now + rand(3500, 8000);
  }

  function render(tilt) {
    el.style.transform = `translate(${x}px, ${y}px) rotate(${tilt}deg)`;
  }

  function frame(now) {
    let tilt = 0;
    if (!dragging && !reduceMotion) {
      if (now > nextPick) pickTarget(now);
      const vx = (tx - x) * 0.006;
      x += vx;
      y += (ty - y) * 0.006;
      tilt = clamp(vx * 5, -10, 10);
    }
    render(tilt);
    requestAnimationFrame(frame);
  }

  el.addEventListener('pointerdown', (e) => {
    dragging = true;
    moved = false;
    startX = e.clientX; startY = e.clientY;
    offX = e.clientX - x;
    offY = e.clientY - y;
    el.setPointerCapture(e.pointerId);
    el.classList.add('dragging');
    e.preventDefault();
  });

  el.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    if (Math.abs(e.clientX - startX) + Math.abs(e.clientY - startY) > 4) moved = true;
    const s = size();
    x = clamp(e.clientX - offX, 0, window.innerWidth - s);
    y = clamp(e.clientY - offY, 0, window.innerHeight - s);
  });

  function endDrag() {
    if (!dragging) return;
    dragging = false;
    el.classList.remove('dragging');
    tx = x; ty = y;                          // stay where it was dropped...
    nextPick = performance.now() + 2500;     // ...then wander off again
    if (!moved) hop();
  }
  el.addEventListener('pointerup', endDrag);
  el.addEventListener('pointercancel', endDrag);

  function hop() {
    el.classList.add('hop');
    const heart = document.createElement('span');
    heart.className = 'mascot-heart';
    heart.textContent = '\u2764\uFE0F';
    el.appendChild(heart);
    setTimeout(() => { el.classList.remove('hop'); heart.remove(); }, 900);
  }

  window.addEventListener('resize', () => {
    const s = size();
    x = clamp(x, 0, window.innerWidth - s);
    y = clamp(y, 0, window.innerHeight - s);
    tx = clamp(tx, 0, window.innerWidth - s);
    ty = clamp(ty, 0, window.innerHeight - s);
  });

  requestAnimationFrame(frame);
})();
