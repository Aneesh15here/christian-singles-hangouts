// Decides whether the app talks to a real Supabase project or runs in
// local demo mode, and exposes a single `window.Api` with the same async
// interface either way — see api.js and mock-api.js.
(function () {
  const cfg = window.APP_CONFIG || {};
  const hasRealConfig = !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY);

  window.DEMO_MODE = !hasRealConfig;

  if (hasRealConfig) {
    window.supabaseClient = window.supabase.createClient(
      cfg.SUPABASE_URL,
      cfg.SUPABASE_ANON_KEY
    );
    window.Api = window.RealApi;
  } else {
    window.Api = window.MockApi;
  }
})();
