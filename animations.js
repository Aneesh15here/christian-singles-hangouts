// Small, dependency-free animation layer: scroll-reveal (IntersectionObserver)
// and a count-up helper for stat numbers. Exposed on window.GatherReveal so
// app.js can re-trigger reveal() after it swaps in new HTML (event cards,
// my-events lists, etc.) without these two files needing to share state.
(function () {
  var prefersReduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Elements matching any of these selectors get scroll-reveal treatment.
  // Applied via JS (not authored in HTML) so dynamically-rendered content
  // (event cards, my-events cards) picks it up automatically too.
  // Deliberately excludes anything that's core functional content on first
  // paint (forms like .auth-card, or standalone headings like the
  // guidelines h3s where revealing just the heading and not its paragraph
  // looks broken) — a stuck/blocked observer must never hide something a
  // user needs to see or use.
  var REVEAL_SELECTOR = [
    '.value-card', '.steps li', '.about-section', '.community-stats',
    '.guidelines-preview', '.final-cta', '.event-card', '.stat-tile',
    '.attendee', '.how-it-works', '.scripture-verse'
  ].join(',');

  var io = null;
  if (!prefersReduced && 'IntersectionObserver' in window) {
    io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('in-view');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -30px 0px' });
  }

  function reveal(root) {
    root = root || document;
    var counters = new Map(); // parent element -> next stagger index
    var els = root.querySelectorAll(REVEAL_SELECTOR);
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (el.classList.contains('reveal')) continue; // already wired up
      el.classList.add('reveal');
      var parent = el.parentElement;
      var idx = counters.get(parent) || 0;
      counters.set(parent, idx + 1);
      el.style.setProperty('--reveal-i', Math.min(idx, 8));
      if (prefersReduced || !io) {
        el.classList.add('in-view');
      } else {
        io.observe(el);
        // Safety net: guarantee content isn't left invisible forever if the
        // observer never fires (e.g. blocked by a browser extension).
        setTimeout(function () { el.classList.add('in-view'); }, 4000);
      }
    }
  }

  // Animates a number counting up from its current value to `target`.
  // Falls back to setting the value instantly under reduced motion.
  function animateCount(el, target) {
    if (!el) return;
    target = Number(target) || 0;
    if (prefersReduced) { el.textContent = target; return; }
    var start = Number(el.dataset.count) || 0;
    if (start === target) { el.textContent = target; return; }
    var duration = 700;
    var startTime = null;
    function step(ts) {
      if (startTime === null) startTime = ts;
      var progress = Math.min((ts - startTime) / duration, 1);
      var eased = 1 - Math.pow(1 - progress, 3); // ease-out-cubic
      var value = Math.round(start + (target - start) * eased);
      el.textContent = value;
      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        el.textContent = target;
        el.dataset.count = target;
      }
    }
    requestAnimationFrame(step);
  }

  window.GatherReveal = { reveal: reveal, animateCount: animateCount, prefersReduced: prefersReduced };

  // Initial pass for whatever is already in the DOM (landing page markup) —
  // this script tag sits right before app.js at the end of body, so all the
  // static HTML above it is already parsed and present.
  reveal();
})();
