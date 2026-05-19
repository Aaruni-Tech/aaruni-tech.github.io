(function () {
  const DEFAULT_SUPABASE_URL = "https://cnsmgxgkxgbeumnvidpk.supabase.co";
  const DEFAULT_SUPABASE_ANON_KEY = "sb_publishable_pUKXR4zuaQSg9UA5t5Oz9Q_sR4mCiI0";

  const LOCAL_URL = localStorage.getItem("AARUNI_SUPABASE_URL");
  const LOCAL_KEY = localStorage.getItem("AARUNI_SUPABASE_ANON_KEY");
  const normalizedLocalUrl = (LOCAL_URL || "").trim().replace(/\/+$/, "");
  const expectedHost = new URL(DEFAULT_SUPABASE_URL).hostname;

  let cachedUrlAllowed = false;
  if (normalizedLocalUrl) {
    try {
      cachedUrlAllowed = new URL(normalizedLocalUrl).hostname === expectedHost;
    } catch (error) {
      cachedUrlAllowed = false;
    }
  }

  if (normalizedLocalUrl && !cachedUrlAllowed) {
    console.warn("[Supabase] Ignoring cached Supabase URL that does not match production", normalizedLocalUrl);
    localStorage.removeItem("AARUNI_SUPABASE_URL");
  }

  window.SUPABASE_URL =
    normalizedLocalUrl && cachedUrlAllowed
      ? normalizedLocalUrl
      : DEFAULT_SUPABASE_URL;

  window.SUPABASE_ANON_KEY =
    LOCAL_KEY ||
    DEFAULT_SUPABASE_ANON_KEY;

  let urlValid = false;
  try {
    const parsedUrl = new URL(window.SUPABASE_URL);
    urlValid = parsedUrl.protocol === "https:" && parsedUrl.hostname.endsWith(".supabase.co");
  } catch (error) {
    urlValid = false;
  }

  console.log("[Supabase] Public config loaded", {
    hasUrl: !!window.SUPABASE_URL,
    hasKey: !!window.SUPABASE_ANON_KEY,
    url: window.SUPABASE_URL,
    urlValid
  });

  console.log("Supabase URL:", window.SUPABASE_URL);

  if (!urlValid) {
    console.error("[Supabase] Invalid Supabase URL", window.SUPABASE_URL);
  }
})();
