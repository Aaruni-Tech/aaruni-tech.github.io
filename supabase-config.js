(function () {
  const LOCAL_URL = localStorage.getItem("AARUNI_SUPABASE_URL");
  const LOCAL_KEY = localStorage.getItem("AARUNI_SUPABASE_ANON_KEY");

  window.SUPABASE_URL =
    LOCAL_URL ||
    "https://cnsmgxkgxbeumnvidpk.supabase.co";

  window.SUPABASE_ANON_KEY =
    LOCAL_KEY ||
    "sb_publishable_pUKXR4zuaQSg9UA5t5Oz9Q_sR4mCiI0";

  console.log("[Supabase] Public config loaded", {
    hasUrl: !!window.SUPABASE_URL,
    hasKey: !!window.SUPABASE_ANON_KEY,
    url: window.SUPABASE_URL
  });
})();
