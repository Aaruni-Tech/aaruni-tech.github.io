(function () {
  "use strict";

  function normalizeMode(value) {
    const raw = String(value || "").trim().toLowerCase();
    return raw === "production" || raw === "prod" || raw === "live" ? "production" : "test";
  }

  function updateBadges(mode) {
    const normalizedMode = normalizeMode(mode);
    document.querySelectorAll(".environment-badge").forEach((badge) => {
      badge.textContent = normalizedMode === "production" ? "LIVE MODE" : "TEST MODE";
      badge.dataset.mode = normalizedMode;
    });
  }

  async function fetchRuntimeMode() {
    const supabaseUrl = String(window.SUPABASE_URL || "").replace(/\/+$/, "");
    const anonKey = String(window.SUPABASE_ANON_KEY || "");

    if (!supabaseUrl || !anonKey) {
      return normalizeMode(window.AARUNI_ENVIRONMENT || (window.AARUNI_CONFIG && window.AARUNI_CONFIG.mode));
    }

    try {
      const response = await fetch(`${supabaseUrl}/functions/v1/public-config`, {
        method: "POST",
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
          "Content-Type": "application/json",
        },
        body: "{}",
      });
      const data = await response.json().catch(() => null);
      return normalizeMode(data && data.mode);
    } catch (error) {
      return normalizeMode(window.AARUNI_ENVIRONMENT || (window.AARUNI_CONFIG && window.AARUNI_CONFIG.mode));
    }
  }

  updateBadges(window.AARUNI_ENVIRONMENT || (window.AARUNI_CONFIG && window.AARUNI_CONFIG.mode));
  fetchRuntimeMode().then(updateBadges);
})();
