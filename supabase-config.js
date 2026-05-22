(function () {
  const config = window.AARUNI_CONFIG || {};
  const supabaseConfig = config.supabase || {};

  function isPlaceholder(value) {
    const raw = String(value || "").trim();
    return !raw || raw.includes("YOUR_") || raw.includes("REPLACE_WITH");
  }

  const configuredUrl = String(supabaseConfig.url || window.SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const configuredAnonKey = String(supabaseConfig.anonKey || window.SUPABASE_ANON_KEY || "").trim();

  window.SUPABASE_URL = isPlaceholder(configuredUrl) ? "" : configuredUrl;
  window.SUPABASE_ANON_KEY = isPlaceholder(configuredAnonKey) ? "" : configuredAnonKey;

  let urlValid = false;
  if (window.SUPABASE_URL) {
    try {
      const parsedUrl = new URL(window.SUPABASE_URL);
      urlValid = parsedUrl.protocol === "https:" && parsedUrl.hostname.endsWith(".supabase.co");
    } catch (error) {
      urlValid = false;
    }
  }

  console.log("[Supabase] Public config loaded", {
    mode: config.mode || "unknown",
    hasUrl: !!window.SUPABASE_URL,
    hasKey: !!window.SUPABASE_ANON_KEY,
    url: window.SUPABASE_URL,
    urlValid
  });

  if (!urlValid) {
    if (window.SUPABASE_URL) {
      console.error("[Supabase] Invalid Supabase URL", window.SUPABASE_URL);
    } else {
      console.warn("[Supabase] No public Supabase URL configured for this environment.");
    }
  }

  if (!window.SUPABASE_ANON_KEY) {
    console.warn("[Supabase] No public Supabase anon key configured for this environment.");
  }
})();
