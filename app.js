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
    pendingEmail: null,
    editingEventId: null,
    editingSnapshot: null,
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
    // Longer messages (e.g. the Instagram share explainer) need more time to read.
    const duration = Math.min(Math.max(msg.length * 60, 3000), 7000);
    toastTimer = setTimeout(() => { el.hidden = true; }, duration);
  }

  // A short confetti burst for the happy moments (RSVP, hosting an event).
  // Skipped entirely under prefers-reduced-motion.
  function celebrate() {
    if (window.GatherReveal?.prefersReduced) return;
    const colors = ['#e05e3d', '#d24b74', '#f0b64a', '#6fa476', '#2b2320'];
    for (let i = 0; i < 36; i++) {
      const piece = document.createElement('span');
      piece.className = 'confetti-piece';
      piece.style.left = Math.random() * 100 + 'vw';
      piece.style.background = colors[i % colors.length];
      piece.style.animationDuration = 1.4 + Math.random() * 1.3 + 's';
      piece.style.animationDelay = Math.random() * 0.35 + 's';
      document.body.appendChild(piece);
      setTimeout(() => piece.remove(), 3400);
    }
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

    if (!loggedIn && !['landing', 'auth', 'confirm', 'event', 'guidelines', 'map', 'share'].includes(path)) {
      sessionStorage.setItem('csh_pending_hash', location.hash);
      navigate('auth');
      return;
    }

    const show = (id) => { document.getElementById(id).hidden = false; };

    if (path === 'landing') {
      show('view-landing');
      renderCommunityStats(); // async, fills in as data arrives
    } else if (path === 'auth') {
      show('view-auth');
      const mode = params.get('mode') === 'login' ? 'login' : 'signup';
      setAuthTab(mode);
    } else if (path === 'confirm') {
      show('view-confirm');
      const emailEl = document.getElementById('confirm-email');
      emailEl.textContent = state.pendingEmail || 'your email';
      document.querySelector('#view-confirm [data-resend-success]').hidden = true;
      document.querySelector('#view-confirm [data-resend-error]').hidden = true;
    } else if (path === 'discover') {
      show('view-discover');
      await renderDiscover();
    } else if (path === 'event') {
      show('view-event');
      await renderEventDetail(params.get('id') || location.hash.split('/')[2]);
    } else if (path === 'create') {
      show('view-create');
      setCreateMode();
    } else if (path === 'edit') {
      show('view-create');
      await enterEditMode(fullPath.split('/')[1]);
    } else if (path === 'my-events') {
      show('view-my-events');
      await renderMyEvents();
    } else if (path === 'profile') {
      show('view-profile');
      await renderProfile();
    } else if (path === 'guidelines') {
      show('view-guidelines');
    } else if (path === 'map') {
      show('view-map');
      renderActivityMapPage();
    } else if (path === 'share') {
      show('view-share');
    } else if (path === 'admin') {
      if (!state.profile?.is_admin) {
        showToast("You don't have access to that page.");
        navigate('discover');
        return;
      }
      show('view-admin');
      await renderAdmin();
    } else {
      show('view-landing');
    }

    const navLink = document.querySelector(`[data-nav="${path}"]`);
    if (navLink) navLink.classList.add('active');

    if (loggedIn) {
      document.getElementById('notif-panel').hidden = true;
      refreshNotifBadge(); // fire-and-forget; badge fills in as data arrives
    }

    window.GatherReveal?.reveal(); // wire up scroll-reveal for any newly-rendered content
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
    const email = fd.get('email').trim();
    const { error, needsConfirmation } = await Api.signUp({ name: fd.get('name').trim(), email, password: fd.get('password') });
    if (error) {
      errEl.textContent = /rate limit/i.test(error.message || '')
        ? "We're sending a lot of confirmation emails right now — please wait a little while and try signing up again."
        : error.message;
      errEl.hidden = false;
      return;
    }
    if (needsConfirmation) {
      state.pendingEmail = email;
      navigate('confirm');
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
    const email = fd.get('email').trim();
    const { error } = await Api.signIn({ email, password: fd.get('password') });
    if (error) {
      // A not-yet-confirmed account is a normal state, not an error to scold
      // about — send them to the friendly "check your email" screen instead.
      if (error.code === 'email_not_confirmed' || /not confirmed|confirm your email/i.test(error.message || '')) {
        state.pendingEmail = email;
        navigate('confirm');
        return;
      }
      errEl.textContent = error.message;
      errEl.hidden = false;
      return;
    }
    showToast('Welcome back!');
    await afterLogin();
  });

  document.getElementById('resend-confirm-btn').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const card = document.getElementById('view-confirm');
    const okEl = card.querySelector('[data-resend-success]');
    const errEl = card.querySelector('[data-resend-error]');
    okEl.hidden = true;
    errEl.hidden = true;
    if (!state.pendingEmail) {
      errEl.textContent = 'Please sign up or log in first so we know where to send it.';
      errEl.hidden = false;
      return;
    }
    btn.disabled = true;
    const { error } = await Api.resendConfirmation(state.pendingEmail);
    btn.disabled = false;
    if (error) {
      errEl.textContent = /rate limit/i.test(error.message || '')
        ? "We've sent a few emails recently — please wait a little while before trying again, and check your spam folder in the meantime."
        : (error.message || 'Could not resend right now — please try again shortly.');
      errEl.hidden = false;
      return;
    }
    okEl.hidden = false;
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

  // "Today" / "Tomorrow" / "In N days" chip for upcoming events — a little
  // urgency makes browsing feel alive and nudges RSVPs.
  function whenPillHtml(ev) {
    const day = new Date(ev.event_date + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const days = Math.round((day - today) / 864e5);
    if (days < 0 || days > 7) return '';
    if (days === 0) return '<span class="pill-when pill-today">🔥 Today</span>';
    if (days === 1) return '<span class="pill-when pill-soon">Tomorrow</span>';
    return `<span class="pill-when">In ${days} days</span>`;
  }

  function eventCardHtml(ev) {
    const hostName = escapeHtml(ev.host?.name || 'Someone');
    return `
      <a href="#/event/${ev.id}" class="event-card">
        <div class="event-card-top">
          <span>
            <span class="pill">${escapeHtml(categoryLabel(ev.category))}</span>
            ${whenPillHtml(ev)}
          </span>
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
    window.GatherReveal?.reveal(list);
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
            ? `<a href="#/edit/${id}" class="btn btn-ghost">✏️ Edit event</a>`
            : myRsvp
              ? `<button id="cancel-rsvp-btn" class="btn btn-ghost">Cancel my RSVP</button>`
              : `<button id="rsvp-btn" class="btn btn-primary" ${isFull ? 'disabled' : ''}>${isFull ? 'Event full' : "I'm in — RSVP"}</button>`
        }
        ${isHost ? `<button id="invite-open-btn" class="btn btn-ghost" type="button">✉️ Invite</button>` : ''}
        <div class="share-wrap">
          <button id="share-toggle-btn" type="button" class="btn btn-ghost">🔗 Share</button>
          <div id="share-menu" class="share-menu" hidden>
            ${navigator.share ? '<button type="button" class="share-item" data-share="native">📲 Share…</button>' : ''}
            <button type="button" class="share-item" data-share="facebook">📘 Share to Facebook</button>
            <button type="button" class="share-item" data-share="instagram">📸 Share to Instagram</button>
            <button type="button" class="share-item" data-share="email">✉️ Share by email</button>
            <button type="button" class="share-item" data-share="copy">🔗 Copy link</button>
          </div>
        </div>
        <button id="ics-btn" class="btn btn-ghost" type="button">📅 Add to calendar</button>
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

    const shareToggleBtn = document.getElementById('share-toggle-btn');
    const shareMenu = document.getElementById('share-menu');
    shareToggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      shareMenu.hidden = !shareMenu.hidden;
    });

    async function copyShareLink(text) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {
        prompt('Copy this:', text);
        return false;
      }
    }

    const eventWhen = `${formatDate(ev.event_date)} at ${formatTime(ev.event_time)}`;

    shareMenu.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-share]');
      if (!btn) return;
      const kind = btn.dataset.share;

      if (kind === 'native') {
        navigator.share({
          title: ev.title,
          text: `${ev.title} — ${eventWhen} at ${ev.location_name}`,
          url: shareUrl,
        }).catch(() => {}); // user closing the sheet is not an error
      } else if (kind === 'facebook') {
        const fbUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`;
        window.open(fbUrl, '_blank', 'noopener,noreferrer,width=600,height=600');
      } else if (kind === 'instagram') {
        const caption = `${ev.title} — ${eventWhen} at ${ev.location_name}\n${shareUrl}`;
        const ok = await copyShareLink(caption);
        if (ok) showToast("Copied! Instagram doesn't support posting links directly from other sites — open Instagram and paste this into your Story or a DM.");
      } else if (kind === 'email') {
        const subject = encodeURIComponent(`You're invited: ${ev.title}`);
        const bodyLines = [ev.title, eventWhen, `📍 ${ev.location_name}`, '', ev.description, '', shareUrl].filter((l) => l !== undefined);
        window.location.href = `mailto:?subject=${subject}&body=${encodeURIComponent(bodyLines.join('\n'))}`;
      } else if (kind === 'copy') {
        const ok = await copyShareLink(shareUrl);
        if (ok) showToast('Link copied — share it with a friend!');
      }

      shareMenu.hidden = true;
    });

    document.getElementById('report-open-btn')?.addEventListener('click', () => openReportModal({ eventId: id, reportedUserId: ev.host_id }));
    document.getElementById('invite-open-btn')?.addEventListener('click', () => openInviteModal({ event: ev, shareUrl }));

    // Downloads a standard .ics file so the event lands in Apple/Google/
    // Outlook calendars — no calendar API integration needed.
    document.getElementById('ics-btn').addEventListener('click', () => {
      const icsEscape = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
      const fmtLocal = (d) =>
        d.getFullYear() +
        String(d.getMonth() + 1).padStart(2, '0') +
        String(d.getDate()).padStart(2, '0') + 'T' +
        String(d.getHours()).padStart(2, '0') +
        String(d.getMinutes()).padStart(2, '0') + '00';
      const start = new Date(`${ev.event_date}T${ev.event_time}`);
      const end = new Date(start.getTime() + 2 * 36e5); // default 2h block
      const ics = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Gather//realchristiansgather.com//EN',
        'BEGIN:VEVENT',
        `UID:${ev.id}@realchristiansgather.com`,
        `DTSTART:${fmtLocal(start)}`,
        `DTEND:${fmtLocal(end)}`,
        `SUMMARY:${icsEscape(ev.title)}`,
        `DESCRIPTION:${icsEscape(ev.description + '\n\n' + shareUrl)}`,
        `LOCATION:${icsEscape(ev.location_name)}`,
        `URL:${shareUrl}`,
        'END:VEVENT',
        'END:VCALENDAR',
      ].join('\r\n');
      const blob = new Blob([ics], { type: 'text/calendar' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'gather-event.ics';
      a.click();
      URL.revokeObjectURL(a.href);
      showToast('Added! Open the download to put it in your calendar.');
    });
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
        celebrate();
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

    // Realtime inserts arrive as the raw row (no joined profile name), so keep
    // a small user_id -> name cache to label live messages, seeded from the
    // messages we just loaded and topped up on demand for unseen senders.
    const nameCache = {};
    (messages || []).forEach((m) => { if (m.profiles?.name) nameCache[m.user_id] = m.profiles.name; });
    if (state.session && state.profile?.name) nameCache[state.session.user.id] = state.profile.name;

    state.messageUnsub = Api.subscribeMessages(eventId, async (msg) => {
      if (!msg.profiles?.name) {
        let name = nameCache[msg.user_id];
        if (!name) {
          const { data } = await Api.getProfile(msg.user_id);
          name = data?.name;
          if (name) nameCache[msg.user_id] = name;
        }
        msg = { ...msg, profiles: { name: name || 'Someone' } };
      }
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

  // ------------------------------------------------------------ notifications
  async function refreshNotifBadge() {
    if (!state.session) return;
    const { count } = await Api.unreadNotificationCount(state.session.user.id);
    const badge = document.getElementById('notif-badge');
    badge.textContent = count > 9 ? '9+' : String(count);
    badge.hidden = !count;
  }

  function closeNotifPanel() {
    document.getElementById('notif-panel').hidden = true;
  }

  // Closes the event-detail share menu when clicking anywhere outside it.
  document.addEventListener('click', (e) => {
    const menu = document.getElementById('share-menu');
    if (menu && !menu.hidden && !e.target.closest('.share-wrap')) {
      menu.hidden = true;
    }
  });

  function relativeTime(iso) {
    const mins = Math.round((Date.now() - new Date(iso)) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    if (mins < 1440) return `${Math.round(mins / 60)}h ago`;
    return `${Math.round(mins / 1440)}d ago`;
  }

  document.getElementById('notif-btn').addEventListener('click', async () => {
    const panel = document.getElementById('notif-panel');
    if (!panel.hidden) { panel.hidden = true; return; }
    panel.hidden = false;
    const list = document.getElementById('notif-list');
    list.innerHTML = '<p class="notif-empty">Loading…</p>';
    const { data: notifications } = await Api.listNotifications(state.session.user.id);
    if (!notifications || notifications.length === 0) {
      list.innerHTML = '<p class="notif-empty">Nothing yet — updates about events you\'ve joined will show up here.</p>';
    } else {
      list.innerHTML = notifications.map((n) => `
        <button class="notif-item ${n.read ? '' : 'notif-unread'}" data-event-id="${n.event_id}" type="button">
          <span class="notif-msg">${escapeHtml(n.message)}</span>
          <span class="notif-time">${relativeTime(n.created_at)}</span>
        </button>`).join('');
      list.querySelectorAll('.notif-item').forEach((item) => {
        item.addEventListener('click', () => {
          closeNotifPanel();
          navigate(`event/${item.dataset.eventId}`);
        });
      });
    }
    // Opening the panel counts as seeing them.
    await Api.markNotificationsRead(state.session.user.id);
    refreshNotifBadge();
  });

  // ---------------------------------------------------------------- feedback
  document.getElementById('feedback-open-btn').addEventListener('click', () => {
    const modal = document.getElementById('feedback-modal');
    const form = document.getElementById('feedback-form');
    form.reset();
    // Prefill the reply-to email for logged-in folks; still editable/removable.
    if (state.session?.user?.email) form.email.value = state.session.user.email;
    form.querySelector('[data-success]').hidden = true;
    form.querySelector('[data-error]').hidden = true;
    modal.hidden = false;
  });
  document.getElementById('feedback-close').addEventListener('click', () => {
    document.getElementById('feedback-modal').hidden = true;
  });
  document.getElementById('feedback-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const okEl = form.querySelector('[data-success]');
    const errEl = form.querySelector('[data-error]');
    okEl.hidden = true;
    errEl.hidden = true;
    const fd = new FormData(form);
    const { error } = await Api.submitFeedback({
      userId: state.session?.user?.id || null,
      email: fd.get('email')?.trim() || null,
      message: fd.get('message').trim(),
    });
    if (error) {
      errEl.textContent = "That didn't go through just now — mind using the email link below instead?";
      errEl.hidden = false;
      return;
    }
    form.reset();
    okEl.hidden = false;
    setTimeout(() => { document.getElementById('feedback-modal').hidden = true; }, 2000);
  });

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

  // ------------------------------------------------------------------ invite
  // No email/SMS-sending backend — like the event share menu, this opens
  // the host's own mail or messaging app with everything prefilled
  // (including host name/bio), rather than sending anything server-side.
  let inviteContext = {};
  function openInviteModal(ctx) {
    inviteContext = ctx || {};
    document.getElementById('invite-modal').hidden = false;
    document.getElementById('invite-email').value = '';
    document.getElementById('invite-phone').value = '';
    document.getElementById('invite-note').value = '';
    document.getElementById('invite-error').hidden = true;
  }
  document.getElementById('invite-close').addEventListener('click', () => { document.getElementById('invite-modal').hidden = true; });

  function inviteMessage({ short } = {}) {
    const { event: ev, shareUrl } = inviteContext;
    const hostName = ev.host?.name || 'A Gather host';
    const when = `${formatDate(ev.event_date)} at ${formatTime(ev.event_time)}`;
    const note = document.getElementById('invite-note').value.trim();
    if (short) {
      return `${hostName} invited you to "${ev.title}" — ${when} at ${ev.location_name}.${note ? ' ' + note : ''} RSVP: ${shareUrl}`;
    }
    const noteLine = note ? `${note}\n\n` : '';
    const bioLine = ev.host?.bio ? `\n\nAbout ${hostName}: ${ev.host.bio}` : '';
    return `${hostName} is inviting you to "${ev.title}"!\n\n📅 ${when}\n📍 ${ev.location_name}\n\n${noteLine}${ev.description}${bioLine}\n\nRSVP here: ${shareUrl}\n\n— Sent via Gather`;
  }

  document.getElementById('invite-email-btn').addEventListener('click', () => {
    const email = document.getElementById('invite-email').value.trim();
    const errEl = document.getElementById('invite-error');
    if (!email) { errEl.textContent = 'Enter an email address to send an email invite.'; errEl.hidden = false; return; }
    errEl.hidden = true;
    const emailList = email.replace(/\s+/g, '');
    const subject = encodeURIComponent(`You're invited: ${inviteContext.event.title}`);
    const body = encodeURIComponent(inviteMessage());
    window.location.href = `mailto:${emailList}?subject=${subject}&body=${body}`;
    document.getElementById('invite-modal').hidden = true;
  });

  document.getElementById('invite-sms-btn').addEventListener('click', () => {
    const phone = document.getElementById('invite-phone').value.trim();
    const errEl = document.getElementById('invite-error');
    if (!phone) { errEl.textContent = 'Enter a phone number to send a text invite.'; errEl.hidden = false; return; }
    errEl.hidden = true;
    const digits = phone.replace(/[^\d+]/g, '');
    const body = encodeURIComponent(inviteMessage({ short: true }));
    // iOS wants "&body=" after the number, most other platforms want "?body=".
    const sep = /iPhone|iPad|iPod/i.test(navigator.userAgent) ? '&' : '?';
    window.location.href = `sms:${digits}${sep}body=${body}`;
    document.getElementById('invite-modal').hidden = true;
  });

  // --------------------------------------------------------- spread the word
  const SITE_URL = 'https://realchristiansgather.com/';

  async function copyToClipboard(text, toastMsg) {
    try {
      await navigator.clipboard.writeText(text);
      showToast(toastMsg);
    } catch {
      prompt('Copy this:', text);
    }
  }

  document.getElementById('share-copy-link').addEventListener('click', () =>
    copyToClipboard(SITE_URL, 'Link copied — send it to a friend!'));

  document.querySelectorAll('.btn-copy-blurb').forEach((btn) => {
    btn.addEventListener('click', () =>
      copyToClipboard(btn.parentElement.querySelector('[data-blurb]').textContent.trim(), 'Copied — paste it anywhere!'));
  });

  const nativeShareBtn = document.getElementById('share-native');
  if (navigator.share) {
    nativeShareBtn.hidden = false;
    nativeShareBtn.addEventListener('click', () => {
      navigator.share({
        title: 'Gather — Real hangouts. Real people.',
        text: 'Hikes, coffee, game nights, Bible study — hosted by people like you. Free to join.',
        url: SITE_URL,
      }).catch(() => {});
    });
  }

  // "Buy me a coffee" — every donate element stays hidden unless a donation
  // link is configured in config.js, so the app never shows a dead button.
  const donateUrl = (window.APP_CONFIG || {}).DONATE_URL;
  if (donateUrl) {
    const footLink = document.getElementById('donate-footer-link');
    footLink.href = donateUrl;
    footLink.hidden = false;
    document.getElementById('donate-card-btn').href = donateUrl;
    document.getElementById('donate-card').hidden = false;
  }

  document.getElementById('share-print-flyer').addEventListener('click', () => {
    document.body.classList.add('printing-flyer');
    const cleanup = () => {
      document.body.classList.remove('printing-flyer');
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    window.print();
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

  // -------------------------------------------------------- community stats
  let activityMap = null;
  let activityMarkers = [];
  let activityMapFull = null;
  let activityMarkersFull = [];

  // Groups events by rounded coordinates so several events at the same spot
  // become one bigger circle instead of a stack of identical pins.
  function groupEventLocations(locations) {
    const groups = {};
    locations.forEach((loc) => {
      const key = `${loc.latitude.toFixed(3)},${loc.longitude.toFixed(3)}`;
      if (!groups[key]) groups[key] = { lat: loc.latitude, lng: loc.longitude, count: 0, names: new Set() };
      groups[key].count += 1;
      groups[key].names.add(loc.location_name);
    });
    return Object.values(groups);
  }

  // Draws grouped location circles into a Leaflet map instance, creating it
  // on first use. Shared by the landing-page mini map and the full map page.
  function drawActivityMap(map, markers, points) {
    markers.forEach((m) => m.remove());
    markers.length = 0;
    points.forEach((g) => {
      const marker = L.circleMarker([g.lat, g.lng], {
        radius: 9 + 5 * Math.sqrt(g.count - 1),
        color: '#ffffff',
        weight: 2,
        fillColor: '#e05e3d',
        fillOpacity: 0.75,
      }).addTo(map);
      marker.bindTooltip(
        `${escapeHtml([...g.names].join(', '))} — ${g.count} event${g.count === 1 ? '' : 's'}`
      );
      markers.push(marker);
    });
    const bounds = L.latLngBounds(points.map((g) => [g.lat, g.lng]));
    map.fitBounds(bounds.pad(0.35), { maxZoom: 13 });
    // The map initializes inside a container that was hidden a moment ago;
    // Leaflet needs a size recalculation once it's actually visible.
    setTimeout(() => map.invalidateSize(), 50);
  }

  async function renderCommunityStats() {
    const { data: stats } = await Api.getCommunityStats();
    if (stats) {
      window.GatherReveal?.animateCount(document.getElementById('stat-members'), stats.members);
      window.GatherReveal?.animateCount(document.getElementById('stat-upcoming'), stats.upcoming);
      window.GatherReveal?.animateCount(document.getElementById('stat-active'), stats.activeThisWeek);
    }

    const mapEl = document.getElementById('activity-map');
    const emptyNote = document.getElementById('map-empty');
    const { data: locations } = await Api.listEventLocations();

    if (!window.L || !locations || locations.length === 0) {
      mapEl.style.display = 'none';
      emptyNote.hidden = false;
      return;
    }
    mapEl.style.display = '';
    emptyNote.hidden = true;

    if (!activityMap) {
      activityMap = L.map('activity-map', { scrollWheelZoom: false });
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(activityMap);
    }
    drawActivityMap(activityMap, activityMarkers, groupEventLocations(locations));
  }

  // Dedicated, larger map page (#/map) showing where community activity is
  // happening geographically — built from the same event lat/lng used by the
  // landing-page mini map, not any per-member location data.
  async function renderActivityMapPage() {
    const mapEl = document.getElementById('activity-map-full');
    const emptyNote = document.getElementById('map-full-empty');
    const { data: locations } = await Api.listEventLocations();

    const total = locations ? locations.length : 0;
    window.GatherReveal?.animateCount(document.getElementById('map-stat-events'), total);

    if (!window.L || !locations || locations.length === 0) {
      mapEl.style.display = 'none';
      emptyNote.hidden = false;
      window.GatherReveal?.animateCount(document.getElementById('map-stat-spots'), 0);
      document.getElementById('map-stat-top').textContent = '–';
      return;
    }
    mapEl.style.display = '';
    emptyNote.hidden = true;

    const points = groupEventLocations(locations);
    window.GatherReveal?.animateCount(document.getElementById('map-stat-spots'), points.length);
    const top = points.reduce((a, b) => (b.count > a.count ? b : a), points[0]);
    document.getElementById('map-stat-top').textContent = [...top.names][0] || '–';

    if (!activityMapFull) {
      activityMapFull = L.map('activity-map-full', { scrollWheelZoom: true });
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(activityMapFull);
    }
    drawActivityMap(activityMapFull, activityMarkersFull, points);
  }

  // Turns a typed venue/place name into rough coordinates using OpenStreetMap's
  // Nominatim geocoder. Returns null on any failure — the map is a bonus, not a
  // requirement, so event creation must never hinge on it.
  async function geocodeLocation(query) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 4000);
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`,
        { signal: ctrl.signal, headers: { Accept: 'application/json' } }
      );
      clearTimeout(timer);
      const results = await res.json();
      if (Array.isArray(results) && results[0]) {
        return { latitude: Number(results[0].lat), longitude: Number(results[0].lon) };
      }
    } catch {}
    return null;
  }

  // The Host form does double duty: creating a new event, or (via
  // #/edit/<id>) updating one the current user already hosts.
  function setCreateMode() {
    state.editingEventId = null;
    state.editingSnapshot = null;
    document.getElementById('create-heading').textContent = 'Host an event';
    document.getElementById('create-sub').textContent = 'Pick a suggested plan to start fast, or write your own. Overlapping events at the same place are totally fine — the more the merrier.';
    document.getElementById('create-submit-btn').textContent = 'Create event';
    document.getElementById('template-chips').style.display = '';
    document.getElementById('create-form').reset();
    document.querySelectorAll('.chip').forEach((c) => c.classList.remove('active'));
  }

  async function enterEditMode(eventId) {
    const { data: ev, error } = await Api.getEvent(eventId);
    if (error || !ev) {
      showToast("That event couldn't be found.");
      navigate('my-events');
      return;
    }
    if (!state.session || state.session.user.id !== ev.host_id) {
      showToast('Only the host can edit this event.');
      navigate(`event/${eventId}`);
      return;
    }
    state.editingEventId = eventId;
    // Normalize time to HH:MM — Postgres returns HH:MM:SS, the input wants HH:MM.
    state.editingSnapshot = {
      event_date: ev.event_date,
      event_time: (ev.event_time || '').slice(0, 5),
      location_name: ev.location_name,
      title: ev.title,
    };
    document.getElementById('create-heading').textContent = 'Edit your event';
    document.getElementById('create-sub').textContent = "Update the details below — if the date, time, or location changes, everyone who's RSVP'd gets a heads-up in the app.";
    document.getElementById('create-submit-btn').textContent = 'Save changes';
    document.getElementById('template-chips').style.display = 'none';
    const form = document.getElementById('create-form');
    form.title.value = ev.title;
    form.description.value = ev.description;
    form.category.value = ev.category;
    form.event_date.value = ev.event_date;
    form.event_time.value = state.editingSnapshot.event_time;
    form.location_name.value = ev.location_name;
    form.capacity.value = ev.capacity ?? '';
  }

  // Only changes attendees actually plan around trigger a notification.
  function meaningfulChanges(snapshot, payload) {
    const changes = [];
    if (payload.event_date !== snapshot.event_date) changes.push(`the date is now ${formatDate(payload.event_date)}`);
    if (payload.event_time !== snapshot.event_time) changes.push(`the time is now ${formatTime(payload.event_time)}`);
    if (payload.location_name !== snapshot.location_name) changes.push(`the location is now ${payload.location_name}`);
    return changes;
  }

  document.getElementById('create-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const errEl = form.querySelector('[data-error]');
    errEl.hidden = true;
    const fd = new FormData(form);
    const payload = {
      title: fd.get('title').trim(),
      description: fd.get('description').trim(),
      category: fd.get('category'),
      event_date: fd.get('event_date'),
      event_time: fd.get('event_time'),
      location_name: fd.get('location_name').trim(),
      capacity: fd.get('capacity') ? Number(fd.get('capacity')) : null,
    };

    if (state.editingEventId) {
      const eventId = state.editingEventId;
      const snapshot = state.editingSnapshot;
      // Re-geocode only if the venue actually changed, so an unrelated edit
      // can't silently wipe or alter existing map coordinates.
      if (payload.location_name !== snapshot.location_name) {
        const coords = await geocodeLocation(payload.location_name);
        if (coords) Object.assign(payload, coords);
      }
      const { error } = await Api.updateEvent(eventId, payload);
      if (error) {
        errEl.textContent = error.message || 'Could not save changes';
        errEl.hidden = false;
        return;
      }
      const changes = meaningfulChanges(snapshot, payload);
      let notified = false;
      if (changes.length) {
        const { data: attendees } = await Api.listAttendees(eventId);
        const recipients = (attendees || [])
          .map((a) => a.user_id)
          .filter((uid) => uid !== state.session.user.id);
        const message = `"${payload.title}" was updated by the host — ${changes.join(', ')}.`;
        const { error: notifError, skipped } = await Api.notifyAttendees(eventId, recipients, message);
        if (notifError) console.warn('Could not notify attendees:', notifError.message);
        notified = recipients.length > 0 && !notifError && !skipped;
      }
      showToast(notified ? 'Changes saved — attendees have been notified.' : 'Changes saved.');
      setCreateMode();
      navigate(`event/${eventId}`);
      return;
    }

    payload.host_id = state.session.user.id;
    // Best-effort geocode of the venue for the community activity map —
    // never blocks event creation if it fails or times out.
    const coords = await geocodeLocation(payload.location_name);
    if (coords) Object.assign(payload, coords);
    const { data, error } = await Api.createEvent(payload);
    if (error) {
      errEl.textContent = error.message || 'Could not create event';
      errEl.hidden = false;
      return;
    }
    showToast('Event created — invite your friends!');
    celebrate();
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
    window.GatherReveal?.reveal(list);
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

  // ------------------------------------------------------------------ admin
  // Client-side gating (router redirect + hidden nav link) is UX only —
  // the real enforcement is server-side RLS via the is_admin flag, so a
  // non-admin who forces #/admin just gets empty tables, never other
  // members' data.
  let adminTab = 'members';
  document.querySelectorAll('[data-admin-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      adminTab = btn.dataset.adminTab;
      document.querySelectorAll('[data-admin-tab]').forEach((b) => b.classList.toggle('active', b === btn));
      renderAdmin();
    });
  });

  function reportStatusOptions(current) {
    return ['open', 'reviewing', 'resolved', 'dismissed']
      .map((s) => `<option value="${s}" ${s === current ? 'selected' : ''}>${s[0].toUpperCase()}${s.slice(1)}</option>`)
      .join('');
  }

  async function renderAdmin() {
    const panel = document.getElementById('admin-panel');
    panel.innerHTML = '<p class="admin-empty">Loading…</p>';

    if (adminTab === 'members') {
      const { data, error } = await Api.adminListMembers();
      if (error || !data) { panel.innerHTML = '<p class="admin-empty">Couldn\'t load members.</p>'; return; }
      if (data.length === 0) { panel.innerHTML = '<p class="admin-empty">No members yet.</p>'; return; }
      panel.innerHTML = `
        <table class="admin-table">
          <thead><tr><th>Name</th><th>Email</th><th>Bio</th><th>Admin</th><th>Joined</th></tr></thead>
          <tbody>
            ${data.map((m) => `
              <tr>
                <td>${escapeHtml(m.name || '—')}</td>
                <td>${escapeHtml(m.email || '—')}</td>
                <td class="wrap">${escapeHtml(m.bio || '—')}</td>
                <td>${m.is_admin ? '✅' : ''}</td>
                <td>${m.joined_at ? formatDate(m.joined_at.slice(0, 10)) : '—'}</td>
              </tr>`).join('')}
          </tbody>
        </table>`;
    } else if (adminTab === 'events') {
      const { data, error } = await Api.adminListEvents();
      if (error || !data) { panel.innerHTML = '<p class="admin-empty">Couldn\'t load events.</p>'; return; }
      if (data.length === 0) { panel.innerHTML = '<p class="admin-empty">No events yet.</p>'; return; }
      panel.innerHTML = `
        <table class="admin-table">
          <thead><tr><th>Title</th><th>Category</th><th>When</th><th>Location</th><th>Host</th><th>Attendees</th></tr></thead>
          <tbody>
            ${data.map((e) => `
              <tr>
                <td class="wrap"><a href="#/event/${e.id}" class="link">${escapeHtml(e.title)}</a></td>
                <td>${escapeHtml(categoryLabel(e.category))}</td>
                <td>${formatDate(e.event_date)} · ${formatTime(e.event_time)}</td>
                <td class="wrap">${escapeHtml(e.location_name)}</td>
                <td>${escapeHtml(e.host?.name || 'Unknown')}</td>
                <td>${e.attendee_count}${e.capacity ? ' / ' + e.capacity : ''}</td>
              </tr>`).join('')}
          </tbody>
        </table>`;
    } else if (adminTab === 'reports') {
      const { data, error } = await Api.adminListReports();
      if (error || !data) { panel.innerHTML = '<p class="admin-empty">Couldn\'t load reports.</p>'; return; }
      if (data.length === 0) { panel.innerHTML = '<p class="admin-empty">No reports — nothing flagged.</p>'; return; }
      panel.innerHTML = `
        <table class="admin-table">
          <thead><tr><th>Reason</th><th>Details</th><th>Reported</th><th>Reporter</th><th>Status</th><th>When</th></tr></thead>
          <tbody>
            ${data.map((r) => {
              const reported = [
                r.event_title ? `event: ${escapeHtml(r.event_title)}` : '',
                r.reported_user_name ? `user: ${escapeHtml(r.reported_user_name)}` : '',
              ].filter(Boolean).join(', ') || '—';
              return `
              <tr data-report-id="${r.id}">
                <td>${escapeHtml(r.reason)}</td>
                <td class="wrap">${escapeHtml(r.details || '—')}</td>
                <td class="wrap">${reported}</td>
                <td>${escapeHtml(r.reporter_name)}</td>
                <td><select class="status-select" data-report-status>${reportStatusOptions(r.status)}</select></td>
                <td>${relativeTime(r.created_at)}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>`;
      panel.querySelectorAll('[data-report-status]').forEach((sel) => {
        sel.addEventListener('change', async () => {
          const reportId = sel.closest('tr').dataset.reportId;
          const { error } = await Api.adminUpdateReportStatus(reportId, sel.value);
          if (error) { showToast('Could not update status'); return; }
          showToast('Report updated.');
        });
      });
    } else if (adminTab === 'feedback') {
      const { data, error } = await Api.adminListFeedback();
      if (error || !data) { panel.innerHTML = '<p class="admin-empty">Couldn\'t load feedback.</p>'; return; }
      if (data.length === 0) { panel.innerHTML = '<p class="admin-empty">No feedback yet.</p>'; return; }
      panel.innerHTML = `
        <table class="admin-table">
          <thead><tr><th>Message</th><th>From</th><th>Reply-to</th><th>When</th></tr></thead>
          <tbody>
            ${data.map((f) => `
              <tr>
                <td class="wrap">${escapeHtml(f.message)}</td>
                <td>${escapeHtml(f.profile?.name || 'Guest')}</td>
                <td>${escapeHtml(f.email || '—')}</td>
                <td>${relativeTime(f.created_at)}</td>
              </tr>`).join('')}
          </tbody>
        </table>`;
    }
  }

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
        let { data } = await Api.getProfile(session.user.id);
        // Self-heal: if the profile row is missing (e.g. deleted during a
        // data cleanup), recreate it — everything (hosting, RSVPs, chat)
        // hangs off this row, so a logged-in user must always have one.
        if (!data && Api.ensureProfile) {
          ({ data } = await Api.ensureProfile(session));
        }
        state.profile = data;
        document.getElementById('admin-nav-link').hidden = !state.profile?.is_admin;

        // A direct link to a protected page (e.g. #/edit/<id>) bounces to
        // auth before the stored session finishes restoring — once it has,
        // send the person where they were actually headed.
        const pending = sessionStorage.getItem('csh_pending_hash');
        if (pending && currentRoute().path === 'auth') {
          sessionStorage.removeItem('csh_pending_hash');
          location.hash = pending; // hashchange re-runs the router
          return;
        }
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
