// Decides whether the app talks to a real Supabase project or runs in
// local demo mode, and exposes a single `window.Api` with the same async
// interface either way — see api.js and mock-api.js.
//
// Adding ?demo=1 to the URL forces demo mode even when config.js has real
// credentials — handy for trying the app (or testing changes) without
// touching shared data.
(function () {
  const cfg = window.APP_CONFIG || {};
  const forceDemo = new URLSearchParams(location.search).has('demo');
  const hasRealConfig = !forceDemo && !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY);

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
