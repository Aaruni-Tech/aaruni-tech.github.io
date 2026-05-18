(function () {
  const CONFIG = window.AARUNI_FIREBASE_CONFIG;

  function isConfigured() {
    return CONFIG && CONFIG.projectId && CONFIG.apiKey && CONFIG.apiKey !== "YOUR_FIREBASE_API_KEY";
  }

  function ensureFirebaseLoaded() {
    if (!window.firebase || typeof window.firebase.initializeApp !== "function") {
      throw new Error("Firebase SDK not loaded.");
    }
  }

  function initFirebase() {
    if (!isConfigured()) {
      return { ok: false, skipped: true, reason: "Firebase is not configured." };
    }

    ensureFirebaseLoaded();

    if (window.firebase.apps && window.firebase.apps.length) {
      return { ok: true, reused: true };
    }

    window.firebase.initializeApp(CONFIG);
    return { ok: true, initialized: true };
  }

  async function ensureAuth() {
    if (!isConfigured()) {
      return null;
    }

    initFirebase();

    const auth = window.firebase.auth();
    if (auth.currentUser) {
      return auth.currentUser;
    }

    const result = await auth.signInAnonymously();
    return result.user;
  }

  function callable(name) {
    initFirebase();
    const functions = window.firebase.app().functions();
    return functions.httpsCallable(name);
  }

  async function createOrderAfterPayment({ paymentId, orderDraft }) {
    if (!isConfigured()) {
      return { ok: false, skipped: true, reason: "Firebase is not configured." };
    }

    await ensureAuth();

    const fn = callable("createOrderAfterPayment");
    const response = await fn({
      paymentId,
      orderDraft,
    });

    return response && response.data ? response.data : null;
  }

  window.AaruniBackend = {
    isConfigured,
    initFirebase,
    ensureAuth,
    createOrderAfterPayment,
  };
})();
