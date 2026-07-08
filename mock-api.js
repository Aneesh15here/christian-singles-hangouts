// Demo-mode backend: mirrors the exact same async interface as api.js
// (window.RealApi) but stores everything in this browser's localStorage
// instead of Supabase. Used automatically when config.js has no Supabase
// project configured yet — see supabase-client.js.
//
// This lets the whole app be tried out with sample data before anyone sets
// up a backend, and lets the UI/UX be exercised without live credentials.
// It is intentionally NOT multi-user: data here never leaves this browser.
window.MockApi = (function () {
  const NS = 'csh_demo_';
  const messageListeners = {}; // eventId -> Set of callbacks

  function read(key, fallback) {
    try {
      const raw = localStorage.getItem(NS + key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }
  function write(key, value) {
    localStorage.setItem(NS + key, JSON.stringify(value));
  }
  function uid() {
    return (crypto.randomUUID && crypto.randomUUID()) || `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function seedIfNeeded() {
    // v2: seed events carry map coordinates; re-seed older demo data.
    if (read('seeded_v2', false)) return;

    const hostA = { id: uid(), email: 'maria@example.com', password: 'demo', name: 'Maria', bio: 'Loves board games and hiking.' };
    const hostB = { id: uid(), email: 'james@example.com', password: 'demo', name: 'James', bio: 'Makes too much coffee, shares it gladly.' };
    write('users', [hostA, hostB]);
    write('profiles', {
      [hostA.id]: { id: hostA.id, name: hostA.name, bio: hostA.bio },
      [hostB.id]: { id: hostB.id, name: hostB.name, bio: hostB.bio },
    });

    const today = new Date();
    const inDays = (n) => {
      const d = new Date(today);
      d.setDate(d.getDate() + n);
      return d.toISOString().slice(0, 10);
    };

    const events = [
      {
        id: uid(), host_id: hostA.id, title: 'Saturday Morning Hike',
        description: 'Easy 5km loop trail, coffee after at the trailhead cafe. All fitness levels welcome!',
        category: 'outdoors', event_date: inDays(2), event_time: '08:00',
        location_name: 'Riverside Trailhead', latitude: -27.4816, longitude: 153.0389, capacity: 12, created_at: new Date().toISOString(),
      },
      {
        id: uid(), host_id: hostB.id, title: 'Coffee & Conversation',
        description: 'Low-key coffee meetup, come as you are. Great for first-timers.',
        category: 'coffee', event_date: inDays(1), event_time: '17:30',
        location_name: 'Grounded Coffee House', latitude: -27.4679, longitude: 153.0281, capacity: null, created_at: new Date().toISOString(),
      },
      {
        id: uid(), host_id: hostA.id, title: 'Board Game Night',
        description: 'Bringing Catan, Ticket to Ride, and a few party games. Bring a friend!',
        category: 'games', event_date: inDays(1), event_time: '18:30',
        location_name: 'Grounded Coffee House', latitude: -27.4679, longitude: 153.0281, capacity: 10, created_at: new Date().toISOString(),
      },
      {
        id: uid(), host_id: hostB.id, title: 'Bible Study: Book of James',
        description: 'Working through James chapter by chapter. New folks always welcome, no prep needed.',
        category: 'bible-study', event_date: inDays(4), event_time: '19:00',
        location_name: 'Community Room, Main St Church', latitude: -27.5013, longitude: 153.0104, capacity: 20, created_at: new Date().toISOString(),
      },
    ];
    write('events', events);
    write('rsvps', [
      { id: uid(), event_id: events[0].id, user_id: hostB.id, intro_line: 'Bringing snacks!', created_at: new Date().toISOString() },
    ]);
    write('messages', [
      { id: uid(), event_id: events[0].id, user_id: hostA.id, body: 'Looking forward to it! Meet at the main sign.', created_at: new Date().toISOString() },
    ]);
    write('seeded_v2', true);
  }
  seedIfNeeded();

  function currentSession() {
    const userId = read('session', null);
    if (!userId) return null;
    const users = read('users', []);
    const user = users.find((u) => u.id === userId);
    return user ? { user: { id: user.id, email: user.email } } : null;
  }

  const authListeners = new Set();
  function notifyAuth() {
    const session = currentSession();
    authListeners.forEach((cb) => cb(session));
  }

  async function onAuthStateChange(cb) {
    authListeners.add(cb);
    cb(currentSession());
    return { unsubscribe: () => authListeners.delete(cb) };
  }

  async function getSession() {
    return currentSession();
  }

  async function signUp({ name, email, password }) {
    const users = read('users', []);
    if (users.some((u) => u.email.toLowerCase() === email.toLowerCase())) {
      return { error: { message: 'An account with that email already exists (demo mode).' } };
    }
    const id = uid();
    users.push({ id, email, password, name });
    write('users', users);
    const profiles = read('profiles', {});
    profiles[id] = { id, name, bio: '' };
    write('profiles', profiles);
    write('session', id);
    notifyAuth();
    // Demo mode has no email to confirm, so it logs straight in.
    return { error: null, needsConfirmation: false };
  }

  async function signIn({ email, password }) {
    const users = read('users', []);
    const user = users.find((u) => u.email.toLowerCase() === email.toLowerCase() && u.password === password);
    if (!user) return { error: { message: 'Invalid email or password (demo mode).' } };
    write('session', user.id);
    notifyAuth();
    return { error: null };
  }

  async function resendConfirmation() {
    // No-op in demo mode (no real emails are sent).
    return { error: null };
  }

  async function signOut() {
    write('session', null);
    notifyAuth();
  }

  async function getProfile(userId) {
    const profiles = read('profiles', {});
    return { data: profiles[userId] || null, error: null };
  }

  async function updateProfile(userId, { name, bio }) {
    const profiles = read('profiles', {});
    profiles[userId] = { ...(profiles[userId] || {}), id: userId, name, bio };
    write('profiles', profiles);
    const users = read('users', []).map((u) => (u.id === userId ? { ...u, name } : u));
    write('users', users);
    return { error: null };
  }

  function hostName(hostId) {
    const profiles = read('profiles', {});
    return profiles[hostId] ? { name: profiles[hostId].name } : null;
  }

  function attachHostAndCounts(events) {
    const rsvps = read('rsvps', []);
    return events.map((e) => ({
      ...e,
      host: hostName(e.host_id),
      attendee_count: rsvps.filter((r) => r.event_id === e.id).length,
    }));
  }

  async function listEvents({ date, location, category } = {}) {
    let events = read('events', []);
    const today = new Date().toISOString().slice(0, 10);
    events = events.filter((e) => (date ? e.event_date === date : e.event_date >= today));
    if (location) events = events.filter((e) => e.location_name.toLowerCase().includes(location.toLowerCase()));
    if (category) events = events.filter((e) => e.category === category);
    events.sort((a, b) => (a.event_date + a.event_time).localeCompare(b.event_date + b.event_time));
    return { data: attachHostAndCounts(events), error: null };
  }

  async function getEvent(id) {
    const events = read('events', []);
    const event = events.find((e) => e.id === id);
    if (!event) return { data: null, error: { message: 'Event not found' } };
    const profiles = read('profiles', {});
    const hostProfile = profiles[event.host_id];
    return { data: { ...event, host: hostProfile ? { name: hostProfile.name, bio: hostProfile.bio } : null }, error: null };
  }

  async function createEvent(payload) {
    const events = read('events', []);
    const event = { id: uid(), created_at: new Date().toISOString(), ...payload };
    events.push(event);
    write('events', events);
    return { data: event, error: null };
  }

  async function getCommunityStats() {
    const users = read('users', []);
    const events = read('events', []);
    const rsvps = read('rsvps', []);
    const today = new Date().toISOString().slice(0, 10);
    const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString();
    const active = new Set([
      ...rsvps.filter((r) => r.created_at >= weekAgo).map((r) => r.user_id),
      ...events.filter((e) => e.created_at >= weekAgo).map((e) => e.host_id),
    ]).size;
    return {
      data: {
        members: users.length,
        upcoming: events.filter((e) => e.event_date >= today).length,
        activeThisWeek: active,
      },
      error: null,
    };
  }

  async function listEventLocations() {
    const events = read('events', []).filter((e) => e.latitude != null && e.longitude != null);
    return { data: events.map((e) => ({ location_name: e.location_name, latitude: e.latitude, longitude: e.longitude })), error: null };
  }

  async function listAttendees(eventId) {
    const rsvps = read('rsvps', []).filter((r) => r.event_id === eventId);
    const profiles = read('profiles', {});
    const data = rsvps.map((r) => ({
      user_id: r.user_id,
      intro_line: r.intro_line,
      created_at: r.created_at,
      profiles: profiles[r.user_id] ? { name: profiles[r.user_id].name } : null,
    }));
    return { data, error: null };
  }

  async function getMyRsvp(eventId, userId) {
    const rsvps = read('rsvps', []);
    return { data: rsvps.find((r) => r.event_id === eventId && r.user_id === userId) || null, error: null };
  }

  async function rsvp(eventId, userId, introLine) {
    const rsvps = read('rsvps', []);
    if (rsvps.some((r) => r.event_id === eventId && r.user_id === userId)) {
      return { error: { message: 'Already RSVP\'d' } };
    }
    rsvps.push({ id: uid(), event_id: eventId, user_id: userId, intro_line: introLine || null, created_at: new Date().toISOString() });
    write('rsvps', rsvps);
    return { error: null };
  }

  async function cancelRsvp(eventId, userId) {
    const rsvps = read('rsvps', []).filter((r) => !(r.event_id === eventId && r.user_id === userId));
    write('rsvps', rsvps);
    return { error: null };
  }

  async function listMessages(eventId) {
    const profiles = read('profiles', {});
    const messages = read('messages', [])
      .filter((m) => m.event_id === eventId)
      .map((m) => ({ ...m, profiles: profiles[m.user_id] ? { name: profiles[m.user_id].name } : null }));
    return { data: messages, error: null };
  }

  async function sendMessage(eventId, userId, body) {
    const messages = read('messages', []);
    const message = { id: uid(), event_id: eventId, user_id: userId, body, created_at: new Date().toISOString() };
    messages.push(message);
    write('messages', messages);
    const profiles = read('profiles', {});
    const full = { ...message, profiles: profiles[userId] ? { name: profiles[userId].name } : null };
    (messageListeners[eventId] || new Set()).forEach((cb) => cb(full));
    return { error: null };
  }

  function subscribeMessages(eventId, onInsert) {
    if (!messageListeners[eventId]) messageListeners[eventId] = new Set();
    messageListeners[eventId].add(onInsert);
    return () => messageListeners[eventId].delete(onInsert);
  }

  async function submitReport(report) {
    const reports = read('reports', []);
    reports.push({ id: uid(), created_at: new Date().toISOString(), status: 'open', ...report });
    write('reports', reports);
    return { error: null };
  }

  async function myHostedEvents(userId) {
    const events = read('events', []).filter((e) => e.host_id === userId);
    events.sort((a, b) => (a.event_date + a.event_time).localeCompare(b.event_date + b.event_time));
    return { data: attachHostAndCounts(events), error: null };
  }

  async function myAttendingEvents(userId) {
    const rsvps = read('rsvps', []).filter((r) => r.user_id === userId);
    const events = read('events', []);
    const data = rsvps
      .map((r) => events.find((e) => e.id === r.event_id))
      .filter(Boolean);
    return { data: attachHostAndCounts(data), error: null };
  }

  return {
    onAuthStateChange,
    getSession,
    signUp,
    signIn,
    resendConfirmation,
    signOut,
    getProfile,
    updateProfile,
    listEvents,
    getEvent,
    createEvent,
    getCommunityStats,
    listEventLocations,
    listAttendees,
    getMyRsvp,
    rsvp,
    cancelRsvp,
    listMessages,
    sendMessage,
    subscribeMessages,
    submitReport,
    myHostedEvents,
    myAttendingEvents,
  };
})();
