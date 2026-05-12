/* Dra. Carolina Duarte — site interactivity
   Modules:
   - reveal-on-scroll
   - Leaflet map with editorial tiles + flyTo morph between clinics
   - Doctoralia reviews with desynchronized fade rotation
*/

(() => {
  initReveals();
  initMap();
  initReviews();

  // ----------------------------------------------------------
  function initReveals() {
    const reveals = document.querySelectorAll('.reveal');
    if (!reveals.length) return;
    if (!('IntersectionObserver' in window)) {
      reveals.forEach((el) => el.classList.add('is-visible'));
      return;
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add('is-visible');
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -80px' });
    reveals.forEach((el) => io.observe(el));
  }

  // ----------------------------------------------------------
  function initMap() {
    const mapEl = document.getElementById('map');
    if (!mapEl || typeof L === 'undefined') return;

    let clinics;
    try { clinics = JSON.parse(mapEl.dataset.clinics || '[]'); }
    catch { clinics = []; }
    if (!clinics.length) return;

    const initial = clinics[0];

    const map = L.map(mapEl, {
      center: [initial.lat, initial.lng],
      zoom: initial.zoom,
      zoomControl: false,
      scrollWheelZoom: false,
      attributionControl: true,
      fadeAnimation: true,
      zoomAnimation: true,
    });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap · &copy; CARTO',
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(map);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png', {
      attribution: '',
      subdomains: 'abcd',
      maxZoom: 19,
      pane: 'shadowPane',
      opacity: 0.85,
    }).addTo(map);

    const makeIcon = (code, active) =>
      L.divIcon({
        className: '',
        html: `
          <div class="cd-marker ${active ? 'cd-marker--active' : ''}">
            <span class="cd-marker__pulse"></span>
            <span class="cd-marker__pin">${code}</span>
          </div>
        `,
        iconSize: [44, 44],
        iconAnchor: [22, 44],
      });

    const markers = {};
    clinics.forEach((c, i) => {
      markers[c.id] = L.marker([c.lat, c.lng], { icon: makeIcon(c.code, i === 0) }).addTo(map);
    });

    if (clinics.length >= 2) {
      L.polyline(clinics.map((c) => [c.lat, c.lng]), { className: 'cd-flight', interactive: false }).addTo(map);
    }

    const tabsRoot = document.querySelector('.locais__tabs');
    const tabs = document.querySelectorAll('.locais__tab');
    const cards = document.querySelectorAll('[data-clinic-card]');

    function selectClinic(id, { instant = false } = {}) {
      const target = clinics.find((c) => c.id === id);
      if (!target) return;

      tabs.forEach((t) => t.setAttribute('aria-selected', t.dataset.clinic === id ? 'true' : 'false'));
      if (tabsRoot) tabsRoot.dataset.active = id;

      cards.forEach((card) => {
        card.setAttribute('data-active', card.dataset.clinicCard === id ? 'true' : 'false');
      });

      Object.entries(markers).forEach(([key, m]) => {
        const el = m.getElement();
        if (!el) return;
        const wrap = el.querySelector('.cd-marker');
        if (!wrap) return;
        wrap.classList.toggle('cd-marker--active', key === id);
      });

      if (instant) {
        map.setView([target.lat, target.lng], target.zoom);
      } else {
        const other = clinics.find((c) => c.id !== id);
        if (other) {
          const bounds = L.latLngBounds([[target.lat, target.lng], [other.lat, other.lng]]).pad(0.25);
          map.flyToBounds(bounds, { duration: 1.1, easeLinearity: 0.25 });
          setTimeout(() => {
            map.flyTo([target.lat, target.lng], target.zoom, { duration: 1.6, easeLinearity: 0.22 });
          }, 1150);
        } else {
          map.flyTo([target.lat, target.lng], target.zoom, { duration: 2.0, easeLinearity: 0.25 });
        }
      }
    }

    tabs.forEach((t) => t.addEventListener('click', () => selectClinic(t.dataset.clinic)));
    selectClinic(initial.id, { instant: true });

    mapEl.addEventListener('click', () => { map.scrollWheelZoom.enable(); }, { once: true });
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
