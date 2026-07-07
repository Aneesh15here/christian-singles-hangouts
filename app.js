// App state, routing, and rendering. Talks to the backend only through
// window.Api (see api.js / mock-api.js) so it doesn't care whether it's
// running against Supabase or the local demo store.
(function () {
  const CATEGORIES = [
    { id: 'coffee', label: '☕ Coffee' },
    { id: 'outdoors', label: '🥾 Outdoors' },
    { id: 'games', label: '🎲 Games' },
    { id: 'food', label: '🍲 Food' },
    { id: 'volunteering', label: '🤝 Volunteering' },
    { id: 'bible-study', label: '📖 Bible Study' },
    { id: 'trivia', label: '🧠 Trivia' },
    { id: 'sports', label: '⚽ Sports' },
    { id: 'social', label: '💬 Social' },
    { id: 'other', label: '✨ Other' },
  ];

  const TEMPLATES = [
    { id: 'coffee', label: '☕ Coffee Meetup', title: 'Coffee Meetup', description: 'A relaxed coffee hangout — come chat, no agenda.', category: 'coffee' },
    { id: 'hike', label: '🥾 Hike / Outdoor Walk', title: 'Hike / Outdoor Walk', description: 'A group walk or hike outdoors — all fitness levels welcome.', category: 'outdoors' },
    { id: 'games', label: '🎲 Board Game Night', title: 'Board Game Night', description: 'Board games, snacks, and good company.', category: 'games' },
    { id: 'potluck', label: '🍲 Potluck Dinner', title: 'Potluck Dinner', description: 'Everyone brings a dish to share — bring your favorite!', category: 'food' },
    { id: 'service', label: '🤝 Service / Volunteering', title: 'Service / Volunteering Outing', description: 'Serving together — details on the project inside.', category: 'volunteering' },
    { id: 'bible', label: '📖 Book / Bible Study', title: 'Book / Bible Study', description: 'Digging into scripture (or a good book) together, open to all.', category: 'bible-study' },
    { id: 'trivia', label: '🧠 Trivia Night', title: 'Trivia Night', description: 'Casual trivia in teams — no expertise required, just curiosity.', category: 'trivia' },
    { id: 'sports', label: '⚽ Pickup Sports Game', title: 'Pickup Sports Game', description: 'A casual pickup game — bring energy, not just talent.', category: 'sports' },
    { id: 'custom', label: '✍️ Write Your Own', title: '', description: '', category: 'social' },
  ];

  const state = {
    session: null,
    profile: null,
    messageUnsub: null,
  };

  // ---------------------------------------------------------------- utils
  function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  function initials(name) {
    return (name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() || '').join('');
  }

  function formatDate(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  }

  function formatTime(timeStr) {
    const [h, m] = timeStr.split(':').map(Number);
    const d = new Date();
    d.setHours(h, m);
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }

  function categoryLabel(id) {
    return (CATEGORIES.find((c) => c.id === id) || {}).label || id;
  }

  let toastTimer;
  function showToast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 3000);
  }

  function avatarStackHtml(count, max = 5) {
    const shown = Math.min(count, max);
    let html = '<div class="avatar-stack">';
    for (let i = 0; i < shown; i++) html += `<div class="avatar-dot"></div>`;
    if (count > max) html += `<div class="avatar-dot avatar-more">+${count - max}</div>`;
    if (count === 0) html += `<span class="avatar-empty">Be the first to join</span>`;
    html += '</div>';
    return html;
  }

  // --------------------------------------------------------------- routing
  function currentRoute() {
    const hash = location.hash.replace(/^#\/?/, '');
    const [path, qs] = hash.split('?');
    const params = new URLSearchParams(qs || '');
    return { path: path || 'landing', params };
  }

  function navigate(path) {
    location.hash = '#/' + path;
  }

  async function router() {
    const { path: fullPath, params } = currentRoute();
    const path = fullPath.split('/')[0];
    const loggedIn = !!state.session;

    document.querySelectorAll('.view').forEach((v) => (v.hidden = true));
    document.querySelectorAll('[data-nav]').forEach((a) => a.classList.remove('active'));

    if (!loggedIn && !['landing', 'auth', 'event', 'guidelines'].includes(path)) {
      sessionStorage.setItem('csh_pending_hash', location.hash);
      navigate('auth');
      return;
    }

    const show = (id) => { document.getElementById(id).hidden = false; };

    if (path === 'landing') {
      show('view-landing');
    } else if (path === 'auth') {
      show('view-auth');
      const mode = params.get('mode') === 'login' ? 'login' : 'signup';
      setAuthTab(mode);
    } else if (path === 'discover') {
      show('view-discover');
      await renderDiscover();
    } else if (path === 'event') {
      show('view-event');
      await renderEventDetail(params.get('id') || location.hash.split('/')[2]);
    } else if (path === 'create') {
      show('view-create');
    } else if (path === 'my-events') {
      show('view-my-events');
      await renderMyEvents();
    } else if (path === 'profile') {
      show('view-profile');
      await renderProfile();
    } else if (path === 'guidelines') {
      show('view-guidelines');
    } else {
      show('view-landing');
    }

    const navLink = document.querySelector(`[data-nav="${path}"]`);
    if (navLink) navLink.classList.add('active');
  }

  // event id can be embedded as #/event/<id> — parse that shape specially
  function eventIdFromHash() {
    const m = location.hash.match(/^#\/event\/([^/?]+)/);
    return m ? m[1] : null;
  }

  // ----------------------------------------------------------------- auth
  function setAuthTab(mode) {
    document.querySelectorAll('.auth-tab').forEach((b) => b.classList.toggle('active', b.dataset.authTab === mode));
    document.getElementById('signup-form').hidden = mode !== 'signup';
    document.getElementById('login-form').hidden = mode !== 'login';
  }

  document.querySelectorAll('.auth-tab').forEach((btn) => {
    btn.addEventListener('click', () => setAuthTab(btn.dataset.authTab));
  });

  document.getElementById('signup-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const errEl = form.querySelector('[data-error]');
    errEl.hidden = true;
    const fd = new FormData(form);
    const { error } = await Api.signUp({ name: fd.get('name').trim(), email: fd.get('email').trim(), password: fd.get('password') });
    if (error) {
      errEl.textContent = error.message;
      errEl.hidden = false;
      return;
    }
    showToast(`Welcome to Gather, ${fd.get('name').trim()}!`);
    await afterLogin();
  });

  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const errEl = form.querySelector('[data-error]');
    errEl.hidden = true;
    const fd = new FormData(form);
    const { error } = await Api.signIn({ email: fd.get('email').trim(), password: fd.get('password') });
    if (error) {
      errEl.textContent = error.message;
      errEl.hidden = false;
      return;
    }
    showToast('Welcome back!');
    await afterLogin();
  });

  async function afterLogin() {
    const pending = sessionStorage.getItem('csh_pending_hash');
    sessionStorage.removeItem('csh_pending_hash');
    navigate(pending ? pending.replace(/^#\//, '') : 'discover');
  }

  document.getElementById('logout-btn').addEventListener('click', async () => {
    await Api.signOut();
    navigate('landing');
  });

  // -------------------------------------------------------------- discover
  const categorySelect = document.querySelector('#filters-form select[name="category"]');
  CATEGORIES.forEach((c) => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = c.label;
    categorySelect.appendChild(opt);
  });

  document.getElementById('filters-form').addEventListener('submit', (e) => e.preventDefault());
  document.getElementById('filters-form').addEventListener('input', () => renderDiscover());
  document.getElementById('clear-filters').addEventListener('click', () => {
    document.getElementById('filters-form').reset();
    renderDiscover();
  });

  function eventCardHtml(ev) {
    const hostName = escapeHtml(ev.host?.name || 'Someone');
    return `
      <a href="#/event/${ev.id}" class="event-card">
        <div class="event-card-top">
          <span class="pill">${escapeHtml(categoryLabel(ev.category))}</span>
          <span class="event-date">${formatDate(ev.event_date)} · ${formatTime(ev.event_time)}</span>
        </div>
        <h3>${escapeHtml(ev.title)}</h3>
        <p class="event-loc">📍 ${escapeHtml(ev.location_name)}</p>
        <p class="event-desc">${escapeHtml(ev.description).slice(0, 120)}${ev.description.length > 120 ? '…' : ''}</p>
        <div class="event-card-bottom">
          ${avatarStackHtml(ev.attendee_count)}
          <span class="host-by">hosted by ${hostName}</span>
        </div>
      </a>`;
  }

  async function renderDiscover() {
    const fd = new FormData(document.getElementById('filters-form'));
    const filters = { date: fd.get('date') || undefined, location: fd.get('location')?.trim() || undefined, category: fd.get('category') || undefined };
    const { data, error } = await Api.listEvents(filters);
    const list = document.getElementById('events-list');
    const empty = document.getElementById('events-empty');
    if (error || !data || data.length === 0) {
      list.innerHTML = '';
      empty.hidden = false;
      return;
    }
    empty.hidden = true;
    list.innerHTML = data.map(eventCardHtml).join('');
  }

  // ----------------------------------------------------------- event detail
  async function renderEventDetail(id) {
    id = id || eventIdFromHash();
    const container = document.getElementById('event-detail');
    if (!id) { container.innerHTML = '<p>Event not found.</p>'; return; }

    const { data: ev, error } = await Api.getEvent(id);
    if (error || !ev) { container.innerHTML = '<p>This event couldn\'t be found — it may have been removed.</p>'; return; }

    const { data: attendees } = await Api.listAttendees(id);
    const myRsvp = state.session ? (await Api.getMyRsvp(id, state.session.user.id)).data : null;
    const isHost = state.session && state.session.user.id === ev.host_id;
    const isFull = ev.capacity && (attendees?.length || 0) >= ev.capacity;

    const shareUrl = `${location.origin}${location.pathname}#/event/${id}`;

    container.innerHTML = `
      <div class="event-detail-header">
        <span class="pill">${escapeHtml(categoryLabel(ev.category))}</span>
        <h1>${escapeHtml(ev.title)}</h1>
        <p class="event-meta">📅 ${formatDate(ev.event_date)} at ${formatTime(ev.event_time)} · 📍 ${escapeHtml(ev.location_name)}</p>
        <p class="event-meta">Hosted by <strong>${escapeHtml(ev.host?.name || 'Someone')}</strong>${ev.host?.bio ? ' — ' + escapeHtml(ev.host.bio) : ''}</p>
        ${ev.capacity ? `<p class="event-meta">${attendees?.length || 0} / ${ev.capacity} spots filled</p>` : `<p class="event-meta">${attendees?.length || 0} going</p>`}
      </div>

      <p class="event-description">${escapeHtml(ev.description)}</p>

      <div class="event-actions">
        ${!state.session
          ? `<a href="#/auth?mode=signup" id="login-to-rsvp-btn" class="btn btn-primary">Log in to RSVP</a>`
          : isHost
            ? `<span class="pill pill-muted">You're hosting this one</span>`
            : myRsvp
              ? `<button id="cancel-rsvp-btn" class="btn btn-ghost">Cancel my RSVP</button>`
              : `<button id="rsvp-btn" class="btn btn-primary" ${isFull ? 'disabled' : ''}>${isFull ? 'Event full' : "I'm in — RSVP"}</button>`
        }
        <button id="share-btn" class="btn btn-ghost">🔗 Share</button>
        ${state.session ? `<button id="report-open-btn" class="btn btn-ghost">🚩 Report</button>` : ''}
      </div>

      <h3>Who's going</h3>
      <div id="attendees-list" class="attendees-list">
        ${(attendees || []).map((a) => `
          <div class="attendee">
            <div class="avatar-dot" title="${escapeHtml(a.profiles?.name || 'Guest')}">${escapeHtml(initials(a.profiles?.name))}</div>
            <div>
              <div class="attendee-name">${escapeHtml(a.profiles?.name || 'Guest')}</div>
              ${a.intro_line ? `<div class="attendee-intro">${escapeHtml(a.intro_line)}</div>` : ''}
            </div>
          </div>`).join('') || '<p class="empty-state">No one has RSVP\'d yet — be the first!</p>'}
      </div>

      <h3>Event chat</h3>
      <p class="page-sub">Visible to the host and everyone attending — use it for logistics like "running late!"</p>
      <div id="chat-box" class="chat-box"></div>
      ${(isHost || myRsvp) ? `
        <form id="chat-form" class="chat-form">
          <input type="text" name="body" maxlength="500" placeholder="Say something to the group…" required />
          <button type="submit" class="btn btn-primary">Send</button>
        </form>` : `<p class="empty-state">RSVP to join the conversation.</p>`}
    `;

    document.getElementById('share-btn').addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(shareUrl);
        showToast('Link copied — share it with a friend!');
      } catch {
        prompt('Copy this link:', shareUrl);
      }
    });

    document.getElementById('report-open-btn')?.addEventListener('click', () => openReportModal({ eventId: id, reportedUserId: ev.host_id }));
    document.getElementById('login-to-rsvp-btn')?.addEventListener('click', () => {
      sessionStorage.setItem('csh_pending_hash', `#/event/${id}`);
    });

    const rsvpBtn = document.getElementById('rsvp-btn');
    if (rsvpBtn) {
      rsvpBtn.addEventListener('click', async () => {
        const introLine = prompt('Optional: add a one-line intro for other attendees (or leave blank)') || '';
        const { error } = await Api.rsvp(id, state.session.user.id, introLine);
        if (error) { showToast(error.message || 'Could not RSVP'); return; }
        showToast("You're in! See you there.");
        renderEventDetail(id);
      });
    }
    const cancelBtn = document.getElementById('cancel-rsvp-btn');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', async () => {
        await Api.cancelRsvp(id, state.session.user.id);
        showToast('RSVP canceled.');
        renderEventDetail(id);
      });
    }

    await loadChat(id);
  }

  async function loadChat(eventId) {
    if (state.messageUnsub) { state.messageUnsub(); state.messageUnsub = null; }
    const box = document.getElementById('chat-box');
    const { data: messages } = await Api.listMessages(eventId);
    renderChatMessages(box, messages || []);

    state.messageUnsub = Api.subscribeMessages(eventId, (msg) => {
      appendChatMessage(box, msg);
    });

    const form = document.getElementById('chat-form');
    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const input = form.querySelector('input[name="body"]');
        const body = input.value.trim();
        if (!body) return;
        input.value = '';
        const { error } = await Api.sendMessage(eventId, state.session.user.id, body);
        if (error) showToast(error.message || 'Message failed to send');
      });
    }
  }

  function renderChatMessages(box, messages) {
    box.innerHTML = messages.map(chatMessageHtml).join('') || '<p class="empty-state">No messages yet.</p>';
    box.scrollTop = box.scrollHeight;
  }
  function chatMessageHtml(m) {
    return `<div class="chat-msg"><strong>${escapeHtml(m.profiles?.name || 'Someone')}:</strong> ${escapeHtml(m.body)}</div>`;
  }
  function appendChatMessage(box, m) {
    const empty = box.querySelector('.empty-state');
    if (empty) empty.remove();
    box.insertAdjacentHTML('beforeend', chatMessageHtml(m));
    box.scrollTop = box.scrollHeight;
  }

  // ------------------------------------------------------------------ report
  let reportContext = {};
  function openReportModal(ctx) {
    reportContext = ctx || {};
    document.getElementById('report-modal').hidden = false;
    const form = document.getElementById('report-form');
    form.reset();
    form.querySelector('[data-success]').hidden = true;
  }
  document.getElementById('report-close').addEventListener('click', () => { document.getElementById('report-modal').hidden = true; });
  document.getElementById('report-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const { error } = await Api.submitReport({
      reporterId: state.session.user.id,
      eventId: reportContext.eventId,
      reportedUserId: reportContext.reportedUserId,
      reason: fd.get('reason'),
      details: fd.get('details')?.trim(),
    });
    if (error) { showToast('Could not submit report'); return; }
    e.target.querySelector('[data-success]').hidden = false;
    setTimeout(() => { document.getElementById('report-modal').hidden = true; }, 1500);
  });

  // ------------------------------------------------------------------ create
  const templateChips = document.getElementById('template-chips');
  const createCategorySelect = document.querySelector('#create-form select[name="category"]');
  CATEGORIES.forEach((c) => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = c.label;
    createCategorySelect.appendChild(opt);
  });
  TEMPLATES.forEach((t) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip';
    chip.textContent = t.label;
    chip.addEventListener('click', () => {
      const form = document.getElementById('create-form');
      form.title.value = t.title;
      form.description.value = t.description;
      form.category.value = t.category;
      document.querySelectorAll('.chip').forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      if (t.id === 'custom') form.title.focus();
    });
    templateChips.appendChild(chip);
  });

  document.getElementById('create-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const errEl = form.querySelector('[data-error]');
    errEl.hidden = true;
    const fd = new FormData(form);
    const payload = {
      host_id: state.session.user.id,
      title: fd.get('title').trim(),
      description: fd.get('description').trim(),
      category: fd.get('category'),
      event_date: fd.get('event_date'),
      event_time: fd.get('event_time'),
      location_name: fd.get('location_name').trim(),
      capacity: fd.get('capacity') ? Number(fd.get('capacity')) : null,
    };
    const { data, error } = await Api.createEvent(payload);
    if (error) {
      errEl.textContent = error.message || 'Could not create event';
      errEl.hidden = false;
      return;
    }
    showToast('Event created — invite your friends!');
    form.reset();
    document.querySelectorAll('.chip').forEach((c) => c.classList.remove('active'));
    navigate(`event/${data.id}`);
  });

  // ---------------------------------------------------------------- my events
  let myTab = 'attending';
  document.querySelectorAll('[data-my-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      myTab = btn.dataset.myTab;
      document.querySelectorAll('[data-my-tab]').forEach((b) => b.classList.toggle('active', b === btn));
      renderMyEvents();
    });
  });

  function upcomingReminderHtml(data) {
    const now = new Date();
    const soon = data.filter((ev) => {
      const when = new Date(`${ev.event_date}T${ev.event_time}`);
      const hoursAway = (when - now) / 36e5;
      return hoursAway > 0 && hoursAway <= 48;
    });
    if (soon.length === 0) return '';
    return `<div class="reminder-banner">🔔 Coming up: ${soon.map((ev) => `<strong>${escapeHtml(ev.title)}</strong> (${formatDate(ev.event_date)} at ${formatTime(ev.event_time)})`).join(', ')}</div>`;
  }

  async function renderMyEvents() {
    const list = document.getElementById('my-events-list');
    const empty = document.getElementById('my-events-empty');
    const uid = state.session.user.id;
    const { data } = myTab === 'hosting' ? await Api.myHostedEvents(uid) : await Api.myAttendingEvents(uid);

    const existingBanner = document.querySelector('.reminder-banner');
    if (existingBanner) existingBanner.remove();
    if (myTab === 'attending' && data && data.length) {
      const bannerHtml = upcomingReminderHtml(data);
      if (bannerHtml) list.insertAdjacentHTML('beforebegin', bannerHtml);
    }

    if (!data || data.length === 0) {
      list.innerHTML = '';
      empty.textContent = myTab === 'hosting'
        ? "You haven't hosted anything yet — start one from the Host tab!"
        : "You haven't RSVP'd to anything yet — go find something on Discover!";
      empty.hidden = false;
      return;
    }
    empty.hidden = true;
    list.innerHTML = data.map(eventCardHtml).join('');
  }

  // ------------------------------------------------------------------ profile
  async function renderProfile() {
    const { data } = await Api.getProfile(state.session.user.id);
    state.profile = data;
    const form = document.getElementById('profile-form');
    form.name.value = data?.name || '';
    form.bio.value = data?.bio || '';
    form.querySelector('[data-success]').hidden = true;
  }
  document.getElementById('profile-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const { error } = await Api.updateProfile(state.session.user.id, { name: fd.get('name').trim(), bio: fd.get('bio').trim() });
    if (error) { showToast('Could not save profile'); return; }
    state.profile = { ...state.profile, name: fd.get('name').trim(), bio: fd.get('bio').trim() };
    e.target.querySelector('[data-success]').hidden = false;
    showToast('Profile saved.');
  });

  // -------------------------------------------------------------------- boot
  async function setLoggedInChrome(loggedIn) {
    document.getElementById('app-nav').hidden = !loggedIn;
  }

  async function init() {
    if (window.DEMO_MODE) {
      const banner = document.createElement('div');
      banner.className = 'demo-banner';
      banner.textContent = '🧪 Demo mode — sample data stored only in this browser. Connect a Supabase project (see README) to make this a real shared app.';
      document.body.prepend(banner);
    }

    await Api.onAuthStateChange(async (session) => {
      state.session = session;
      await setLoggedInChrome(!!session);
      if (session) {
        const { data } = await Api.getProfile(session.user.id);
        state.profile = data;
      }
      router();
    });

    window.addEventListener('hashchange', router);
    if (!location.hash) location.hash = '#/landing';
    router();

    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch(() => {});
      });
    }
  }

  init();
})();
