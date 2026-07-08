// Real backend: talks to Supabase (Postgres + Auth) via the supabase-js
// client created in supabase-client.js. Every method returns
// { data, error } so app.js can handle both shapes uniformly.
window.RealApi = (function () {
  const sb = () => window.supabaseClient;

  async function onAuthStateChange(cb) {
    const { data } = sb().auth.onAuthStateChange((_event, session) => cb(session));
    return data.subscription;
  }

  async function getSession() {
    const { data } = await sb().auth.getSession();
    return data.session;
  }

  async function signUp({ name, email, password }) {
    const { data, error } = await sb().auth.signUp({
      email,
      password,
      options: { data: { name } },
    });
    if (error) return { error };
    // If the project requires email confirmation, signUp returns a user but
    // no session — the caller should show a "check your email" screen rather
    // than trying to log the person straight in.
    const needsConfirmation = !data.session;
    return { error: null, needsConfirmation };
  }

  async function signIn({ email, password }) {
    const { error } = await sb().auth.signInWithPassword({ email, password });
    return { error };
  }

  async function resendConfirmation(email) {
    const { error } = await sb().auth.resend({ type: 'signup', email });
    return { error };
  }

  async function signOut() {
    await sb().auth.signOut();
  }

  async function getProfile(userId) {
    const { data, error } = await sb()
      .from('profiles')
      .select('id, name, bio')
      .eq('id', userId)
      .single();
    return { data, error };
  }

  // Recreates a missing profiles row for a logged-in user (the signup
  // trigger normally makes it, but a manual data cleanup can remove it).
  async function ensureProfile(session) {
    const name =
      session.user.user_metadata?.name || (session.user.email || 'member').split('@')[0];
    const { data, error } = await sb()
      .from('profiles')
      .upsert({ id: session.user.id, name }, { onConflict: 'id' })
      .select()
      .single();
    return { data, error };
  }

  async function updateProfile(userId, { name, bio }) {
    const { error } = await sb()
      .from('profiles')
      .update({ name, bio })
      .eq('id', userId);
    return { error };
  }

  async function listEvents({ date, location, category } = {}) {
    let query = sb()
      .from('events')
      .select('*, host:profiles(name)')
      .order('event_date', { ascending: true })
      .order('event_time', { ascending: true });

    if (date) {
      query = query.eq('event_date', date);
    } else {
      const today = new Date().toISOString().slice(0, 10);
      query = query.gte('event_date', today);
    }
    if (location) query = query.ilike('location_name', `%${location}%`);
    if (category) query = query.eq('category', category);

    const { data: events, error } = await query;
    if (error || !events) return { data: events, error };

    const ids = events.map((e) => e.id);
    let counts = {};
    if (ids.length) {
      const { data: rsvpRows } = await sb()
        .from('rsvps')
        .select('event_id')
        .in('event_id', ids);
      (rsvpRows || []).forEach((r) => {
        counts[r.event_id] = (counts[r.event_id] || 0) + 1;
      });
    }
    const withCounts = events.map((e) => ({ ...e, attendee_count: counts[e.id] || 0 }));
    return { data: withCounts, error: null };
  }

  async function getEvent(id) {
    const { data, error } = await sb()
      .from('events')
      .select('*, host:profiles(name, bio)')
      .eq('id', id)
      .single();
    return { data, error };
  }

  async function createEvent(payload) {
    let { data, error } = await sb().from('events').insert(payload).select().single();
    // If the database predates the activity map (no latitude/longitude
    // columns yet), retry without coordinates rather than failing the event.
    if (error && /latitude|longitude/i.test(error.message || '')) {
      const { latitude, longitude, ...rest } = payload;
      ({ data, error } = await sb().from('events').insert(rest).select().single());
    }
    return { data, error };
  }

  async function updateEvent(id, payload) {
    let { data, error } = await sb().from('events').update(payload).eq('id', id).select().single();
    // Same missing-columns fallback as createEvent for pre-map databases.
    if (error && /latitude|longitude/i.test(error.message || '')) {
      const { latitude, longitude, ...rest } = payload;
      ({ data, error } = await sb().from('events').update(rest).eq('id', id).select().single());
    }
    return { data, error };
  }

  // Missing-table matcher for databases that haven't run the notifications
  // migration yet — those degrade to "no notifications" rather than errors.
  function isMissingNotificationsTable(error) {
    return !!error && /notifications/i.test(error.message || '') && /schema cache|does not exist/i.test(error.message || '');
  }

  async function notifyAttendees(eventId, recipientIds, message) {
    if (!recipientIds.length) return { error: null };
    const rows = recipientIds.map((rid) => ({ event_id: eventId, recipient_id: rid, message }));
    const { error } = await sb().from('notifications').insert(rows);
    if (isMissingNotificationsTable(error)) return { error: null, skipped: true };
    return { error };
  }

  async function listNotifications(userId) {
    const { data, error } = await sb()
      .from('notifications')
      .select('id, event_id, message, read, created_at')
      .eq('recipient_id', userId)
      .order('created_at', { ascending: false })
      .limit(30);
    if (isMissingNotificationsTable(error)) return { data: [], error: null };
    return { data, error };
  }

  async function unreadNotificationCount(userId) {
    const { count, error } = await sb()
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('recipient_id', userId)
      .eq('read', false);
    if (isMissingNotificationsTable(error)) return { count: 0, error: null };
    return { count: count || 0, error };
  }

  async function markNotificationsRead(userId) {
    const { error } = await sb()
      .from('notifications')
      .update({ read: true })
      .eq('recipient_id', userId)
      .eq('read', false);
    if (isMissingNotificationsTable(error)) return { error: null };
    return { error };
  }

  async function getCommunityStats() {
    const today = new Date().toISOString().slice(0, 10);
    const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString();
    const [membersRes, upcomingRes, rsvpRes, hostRes] = await Promise.all([
      sb().from('profiles').select('*', { count: 'exact', head: true }),
      sb().from('events').select('*', { count: 'exact', head: true }).gte('event_date', today),
      sb().from('rsvps').select('user_id').gte('created_at', weekAgo),
      sb().from('events').select('host_id').gte('created_at', weekAgo),
    ]);
    const active = new Set([
      ...((rsvpRes.data || []).map((r) => r.user_id)),
      ...((hostRes.data || []).map((e) => e.host_id)),
    ]).size;
    return {
      data: {
        members: membersRes.count || 0,
        upcoming: upcomingRes.count || 0,
        activeThisWeek: active,
      },
      error: null,
    };
  }

  async function listEventLocations() {
    const { data, error } = await sb()
      .from('events')
      .select('location_name, latitude, longitude');
    // Databases that haven't run the coordinate migration yet just show an
    // empty map, not an error.
    if (error && /latitude|longitude/i.test(error.message || '')) return { data: [], error: null };
    if (error) return { data: null, error };
    return { data: (data || []).filter((e) => e.latitude != null && e.longitude != null), error: null };
  }

  async function listAttendees(eventId) {
    const { data, error } = await sb()
      .from('rsvps')
      .select('user_id, intro_line, created_at, profiles(name)')
      .eq('event_id', eventId)
      .order('created_at', { ascending: true });
    return { data, error };
  }

  async function getMyRsvp(eventId, userId) {
    const { data, error } = await sb()
      .from('rsvps')
      .select('*')
      .eq('event_id', eventId)
      .eq('user_id', userId)
      .maybeSingle();
    return { data, error };
  }

  async function rsvp(eventId, userId, introLine) {
    const { error } = await sb()
      .from('rsvps')
      .insert({ event_id: eventId, user_id: userId, intro_line: introLine || null });
    return { error };
  }

  async function cancelRsvp(eventId, userId) {
    const { error } = await sb()
      .from('rsvps')
      .delete()
      .eq('event_id', eventId)
      .eq('user_id', userId);
    return { error };
  }

  async function listMessages(eventId) {
    const { data, error } = await sb()
      .from('event_messages')
      .select('id, body, created_at, user_id, profiles(name)')
      .eq('event_id', eventId)
      .order('created_at', { ascending: true });
    return { data, error };
  }

  async function sendMessage(eventId, userId, body) {
    const { error } = await sb()
      .from('event_messages')
      .insert({ event_id: eventId, user_id: userId, body });
    return { error };
  }

  function subscribeMessages(eventId, onInsert) {
    const channel = sb()
      .channel(`event_messages:${eventId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'event_messages', filter: `event_id=eq.${eventId}` },
        (payload) => onInsert(payload.new)
      )
      .subscribe();
    return () => sb().removeChannel(channel);
  }

  // No .select() after the insert — feedback (like reports) has no read
  // policy for regular users, so asking for the row back would error.
  async function submitFeedback({ userId, email, message }) {
    const { error } = await sb().from('feedback').insert({
      user_id: userId || null,
      email: email || null,
      message,
    });
    return { error };
  }

  async function submitReport({ reporterId, eventId, reportedUserId, reason, details }) {
    const { error } = await sb().from('reports').insert({
      reporter_id: reporterId,
      event_id: eventId || null,
      reported_user_id: reportedUserId || null,
      reason,
      details: details || null,
    });
    return { error };
  }

  async function withAttendeeCounts(events) {
    const ids = events.map((e) => e.id);
    let counts = {};
    if (ids.length) {
      const { data: rsvpRows } = await sb().from('rsvps').select('event_id').in('event_id', ids);
      (rsvpRows || []).forEach((r) => { counts[r.event_id] = (counts[r.event_id] || 0) + 1; });
    }
    return events.map((e) => ({ ...e, attendee_count: counts[e.id] || 0 }));
  }

  async function myHostedEvents(userId) {
    const { data, error } = await sb()
      .from('events')
      .select('*, host:profiles(name)')
      .eq('host_id', userId)
      .order('event_date', { ascending: true });
    if (error || !data) return { data, error };
    return { data: await withAttendeeCounts(data), error: null };
  }

  async function myAttendingEvents(userId) {
    const { data, error } = await sb()
      .from('rsvps')
      .select('event_id, events(*, host:profiles(name))')
      .eq('user_id', userId);
    if (error) return { data: null, error };
    const events = (data || []).map((r) => r.events).filter(Boolean);
    return { data: await withAttendeeCounts(events), error: null };
  }

  return {
    onAuthStateChange,
    getSession,
    signUp,
    signIn,
    resendConfirmation,
    signOut,
    getProfile,
    ensureProfile,
    updateProfile,
    listEvents,
    getEvent,
    createEvent,
    updateEvent,
    notifyAttendees,
    listNotifications,
    unreadNotificationCount,
    markNotificationsRead,
    getCommunityStats,
    listEventLocations,
    listAttendees,
    getMyRsvp,
    rsvp,
    cancelRsvp,
    listMessages,
    sendMessage,
    subscribeMessages,
    submitFeedback,
    submitReport,
    myHostedEvents,
    myAttendingEvents,
  };
})();
