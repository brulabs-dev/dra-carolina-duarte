/* Dra. Carolina Duarte — site interactivity
   Modules:
   - reveal-on-scroll
   - Leaflet map with editorial tiles + flyTo morph between clinics
   - Doctoralia reviews with desynchronized fade rotation
*/

(() => {
  initReveals();
  initReviews();
  initSpecialties();

  // ----------------------------------------------------------
  function initSpecialties() {
    const specialties = document.querySelectorAll('.specialty');
    if (!specialties.length) return;

    specialties.forEach((s) => {
      s.addEventListener('click', () => {
        const isActive = s.classList.contains('specialty--active');
        specialties.forEach((el) => el.classList.remove('specialty--active'));
        if (!isActive) s.classList.add('specialty--active');
      });
    });
  }

  // ----------------------------------------------------------
  function initReveals() {
    const reveals = document.querySelectorAll('.reveal');
    if (!reveals.length) return;
    if (!('IntersectionObserver' in window)) {
      reveals.forEach((el) => el.classList.add('is-visible'));
      return;
    }
    document.documentElement.classList.add('reveal-ready');
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add('is-visible');
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -80px' });
    reveals.forEach((el) => io.observe(el));
    window.setTimeout(() => {
      reveals.forEach((el) => el.classList.add('is-visible'));
      document.documentElement.classList.remove('reveal-ready');
    }, 1600);
  }

  // ----------------------------------------------------------
  function initReviews() {
    const strip = document.querySelector('[data-reviews]');
    if (!strip) return;

    let pool;
    try { pool = JSON.parse(strip.dataset.reviews || '[]'); } catch { pool = []; }
    if (!pool.length) return;

    const slots = strip.querySelectorAll('[data-review-slot]');
    if (!slots.length) return;

    // wrap the inner content in a .review__body and add a progress hairline
    slots.forEach((slot) => {
      const stars = slot.querySelector('.review__stars');
      const text = slot.querySelector('.review__text');
      const author = slot.querySelector('.review__author');
      if (!stars || !text || !author) return;
      const body = document.createElement('div');
      body.className = 'review__body';
      slot.insertBefore(body, stars);
      body.append(stars, text, author);
      const bar = document.createElement('span');
      bar.className = 'review__progress';
      slot.appendChild(bar);
      slot.setAttribute('data-state', 'rest');
    });

    const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
    const formatDate = (iso) => {
      const d = new Date(iso + 'T00:00:00');
      if (Number.isNaN(d.getTime())) return iso;
      return `${MONTHS[d.getMonth()]} / ${d.getFullYear()}`;
    };

    // Shuffle pool (Fisher–Yates) for a fresh order each visit
    const shuffled = pool.slice();
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    let cursor = 0;
    const pickNext = (currentText) => {
      // avoid the text currently in this slot
      let candidate;
      let guard = 0;
      do {
        candidate = shuffled[cursor % shuffled.length];
        cursor += 1;
        guard += 1;
        if (guard > shuffled.length * 2) break;
      } while (candidate.text === currentText);
      return candidate;
    };

    const renderInto = (slot, review) => {
      const text = slot.querySelector('.review__text');
      const author = slot.querySelector('.review__author strong');
      const meta = slot.querySelector('.review__author span');
      text.textContent = '“' + review.text + '”';
      author.textContent = review.author;
      meta.textContent = `Florianópolis · ${formatDate(review.date)}`;
    };

    // Initial fill
    slots.forEach((slot, i) => {
      renderInto(slot, shuffled[i % shuffled.length]);
    });

    // Desync rotation timers (per slot) — different intervals so they never swap together
    const DURATIONS = [7600, 9400, 11200]; // ms
    const FADE_OUT = 700;
    const FADE_HOLD = 60;
    const FADE_IN = 750;

    slots.forEach((slot, i) => {
      const period = DURATIONS[i % DURATIONS.length];
      slot.style.setProperty('--review-duration', `${period / 1000}s`);

      let paused = false;
      let pendingTimer = null;
      let phaseTimers = [];

      const clearPhaseTimers = () => { phaseTimers.forEach(clearTimeout); phaseTimers = []; };

      const tick = () => {
        if (paused || document.hidden) {
          pendingTimer = setTimeout(tick, 500);
          return;
        }
        // out → hold → render → in → rest
        slot.setAttribute('data-state', 'out');
        clearPhaseTimers();
        phaseTimers.push(setTimeout(() => {
          const current = slot.querySelector('.review__text').textContent.replace(/^“|”$/g, '');
          renderInto(slot, pickNext(current));
          slot.setAttribute('data-state', 'in');
          phaseTimers.push(setTimeout(() => {
            slot.setAttribute('data-state', 'rest');
            // restart progress bar by toggling animation
            const bar = slot.querySelector('.review__progress');
            if (bar) { bar.style.animation = 'none'; void bar.offsetWidth; bar.style.animation = ''; }
            pendingTimer = setTimeout(tick, period);
          }, 60));
        }, FADE_OUT + FADE_HOLD));
      };

      slot.addEventListener('pointerenter', () => { paused = true; slot.classList.add('is-paused'); });
      slot.addEventListener('pointerleave', () => { paused = false; slot.classList.remove('is-paused'); });
      slot.addEventListener('focusin', () => { paused = true; slot.classList.add('is-paused'); });
      slot.addEventListener('focusout', () => { paused = false; slot.classList.remove('is-paused'); });

      // Stagger initial start so timers stay desynced
      pendingTimer = setTimeout(tick, period + i * 1800);
    });

    // Respect reduced motion
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      slots.forEach((s) => s.setAttribute('data-state', 'rest'));
    }
  }
})();
