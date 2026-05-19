// Public Supabase config (safe to ship with anon key).
// Fill these values from Supabase Dashboard → Project Settings → API.
// Keep `service_role` key out of the frontend.
//
// Beginner-friendly options:
// 1) Hardcode `SUPABASE_URL` and `SUPABASE_ANON_KEY` below (recommended for GitHub Pages).
// 2) Or set them at runtime (no rebuild) via DevTools console:
//    localStorage.setItem("AARUNI_SUPABASE_URL", "https://xxxx.supabase.co");
//    localStorage.setItem("AARUNI_SUPABASE_ANON_KEY", "eyJ...");
//    location.reload();
(function loadSupabasePublicConfig() {
  const storedUrl = window.localStorage ? window.localStorage.getItem("AARUNI_SUPABASE_URL") : "";
  const storedAnonKey = window.localStorage ? window.localStorage.getItem("AARUNI_SUPABASE_ANON_KEY") : "";

  window.SUPABASE_URL = typeof window.SUPABASE_URL === "string" && window.SUPABASE_URL.trim()
    ? window.SUPABASE_URL.trim()
    : (storedUrl || "").trim();

  window.SUPABASE_ANON_KEY = typeof window.SUPABASE_ANON_KEY === "string" && window.SUPABASE_ANON_KEY.trim()
    ? window.SUPABASE_ANON_KEY.trim()
    : (storedAnonKey || "").trim();

  const urlPresent = Boolean(window.SUPABASE_URL);
  const anonKeyPresent = Boolean(window.SUPABASE_ANON_KEY);

  console.info("[Supabase] Public config loaded", {
    urlPresent,
    anonKeyPresent,
    url: urlPresent ? window.SUPABASE_URL : "",
  });

  if (!urlPresent || !anonKeyPresent) {
    console.warn(
      "[Supabase] Missing SUPABASE_URL / SUPABASE_ANON_KEY. Orders cannot be saved until configured.",
      {
        fix: "Update supabase-config.js or set localStorage AARUNI_SUPABASE_URL/AARUNI_SUPABASE_ANON_KEY",
      }
    );
  }
})();
