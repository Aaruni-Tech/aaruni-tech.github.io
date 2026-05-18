(function () {
  const toast = document.querySelector("#toast");
  const loginForm = document.querySelector("#adminLoginForm");
  const signOutButton = document.querySelector("#adminSignOut");
  const authNote = document.querySelector("#adminAuthNote");
  const authCard = document.querySelector("#adminAuthCard");
  const dashboard = document.querySelector("#adminDashboard");
  const ordersTbody = document.querySelector("#ordersTbody");

  const searchInput = document.querySelector("#orderSearch");
  const paymentFilter = document.querySelector("#paymentFilter");
  const statusFilter = document.querySelector("#statusFilter");
  const dateFrom = document.querySelector("#dateFrom");
  const dateTo = document.querySelector("#dateTo");
  const refreshButton = document.querySelector("#refreshOrders");

  let ordersCache = [];
  let toastTimer;

  function showToast(message) {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add("visible");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove("visible"), 3500);
  }

  function requireFirebase() {
    if (!window.AARUNI_FIREBASE_CONFIG || window.AARUNI_FIREBASE_CONFIG.apiKey === "YOUR_FIREBASE_API_KEY") {
      throw new Error("Firebase is not configured. Update firebase-config.js.");
    }
    if (!window.firebase) {
      throw new Error("Firebase SDK not loaded.");
    }
    if (!window.firebase.apps || !window.firebase.apps.length) {
      window.firebase.initializeApp(window.AARUNI_FIREBASE_CONFIG);
    }
  }

  async function ensureAdminClaim(user) {
    if (!user) return false;
    const result = await user.getIdTokenResult(true);
    return Boolean(result && result.claims && result.claims.admin);
  }

  function formatINR(amount) {
    return `Rs. ${Number(amount || 0).toLocaleString("en-IN")}`;
  }

  function withinDateRange(order) {
    const createdAt = order && order.createdAt ? new Date(order.createdAt) : null;
    if (!createdAt || Number.isNaN(createdAt.getTime())) return true;

    const from = dateFrom && dateFrom.value ? new Date(`${dateFrom.value}T00:00:00`) : null;
    const to = dateTo && dateTo.value ? new Date(`${dateTo.value}T23:59:59`) : null;

    if (from && createdAt < from) return false;
    if (to && createdAt > to) return false;
    return true;
  }

  function matchesSearch(order, query) {
    if (!query) return true;
    const q = query.toLowerCase();
    const haystack = [
      order.id,
      order.paymentId,
      order.payment && order.payment.id,
      order.buyer && order.buyer.email,
      order.buyer && order.buyer.phone,
      order.buyer && order.buyer.name,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  }

  function matchesFilters(order) {
    const pay = paymentFilter && paymentFilter.value ? paymentFilter.value : "all";
    const status = statusFilter && statusFilter.value ? statusFilter.value : "all";
    if (pay !== "all" && (!order.payment || order.payment.status !== pay)) return false;
    if (status !== "all" && order.status !== status) return false;
    if (!withinDateRange(order)) return false;
    return true;
  }

  function renderOrders() {
    const query = searchInput && searchInput.value ? searchInput.value.trim() : "";
    const visible = ordersCache.filter((order) => matchesSearch(order, query) && matchesFilters(order));

    ordersTbody.innerHTML = visible
      .map((order) => {
        const buyer = order.buyer || {};
        const payment = order.payment || {};
        return `
          <tr>
            <td>
              <div class="admin-strong">${order.id || ""}</div>
              <div class="admin-muted">${order.orderDate || ""} ${order.orderTime || ""}</div>
            </td>
            <td>
              <div class="admin-strong">${buyer.name || ""}</div>
              <div class="admin-muted">${buyer.email || ""}</div>
              <div class="admin-muted">${buyer.phone || ""}</div>
            </td>
            <td class="admin-right">${formatINR(order.totalAmount)}</td>
            <td>
              <div class="admin-strong">${payment.status || ""}</div>
              <div class="admin-muted">${payment.id || ""}</div>
            </td>
            <td><span class="admin-pill">${order.status || ""}</span></td>
            <td class="admin-actions-cell">
              <button class="secondary-button" type="button" data-set-status="Packed" data-order-id="${order.id}">Packed</button>
              <button class="secondary-button" type="button" data-set-status="Shipped" data-order-id="${order.id}">Shipped</button>
              <button class="secondary-button" type="button" data-set-status="Delivered" data-order-id="${order.id}">Delivered</button>
            </td>
          </tr>
        `;
      })
      .join("");
  }

  async function fetchOrders() {
    requireFirebase();
    const user = window.firebase.auth().currentUser;
    const isAdmin = await ensureAdminClaim(user);
    if (!isAdmin) {
      throw new Error("This account is not an admin. Set the admin custom claim for this user.");
    }

    const snapshot = await window.firebase.firestore().collection("orders").orderBy("createdAt", "desc").limit(200).get();
    ordersCache = snapshot.docs.map((doc) => doc.data());
    renderOrders();
  }

  async function setOrderStatus(orderId, status) {
    requireFirebase();
    const ref = window.firebase.firestore().collection("orders").doc(orderId);
    const now = new Date().toISOString();
    await ref.set(
      {
        status,
        statusHistory: window.firebase.firestore.FieldValue.arrayUnion({ status, at: now }),
        updatedAt: window.firebase.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    const order = ordersCache.find((entry) => entry.id === orderId);
    if (order) {
      order.status = status;
      order.statusHistory = Array.isArray(order.statusHistory) ? order.statusHistory : [];
      order.statusHistory.push({ status, at: now });
    }
    renderOrders();
  }

  function attachEvents() {
    [searchInput, paymentFilter, statusFilter, dateFrom, dateTo].forEach((el) => {
      if (!el) return;
      el.addEventListener("input", renderOrders);
      el.addEventListener("change", renderOrders);
    });

    if (refreshButton) {
      refreshButton.addEventListener("click", () => fetchOrders().catch((err) => showToast(err.message)));
    }

    ordersTbody.addEventListener("click", (event) => {
      const button = event.target.closest("[data-set-status]");
      if (!button) return;
      const orderId = button.getAttribute("data-order-id");
      const status = button.getAttribute("data-set-status");
      if (!orderId || !status) return;
      setOrderStatus(orderId, status)
        .then(() => showToast(`Updated ${orderId} → ${status}`))
        .catch((err) => showToast(err.message));
    });
  }

  async function updateUiForUser(user) {
    if (!user) {
      authNote.textContent = "Sign in with your admin account.";
      signOutButton.hidden = true;
      dashboard.hidden = true;
      authCard.hidden = false;
      return;
    }

    signOutButton.hidden = false;

    try {
      const isAdmin = await ensureAdminClaim(user);
      if (!isAdmin) {
        authNote.textContent = "Signed in, but this user is not an admin (missing custom claim).";
        dashboard.hidden = true;
        return;
      }

      authNote.textContent = "Signed in as admin.";
      dashboard.hidden = false;
      await fetchOrders();
    } catch (error) {
      authNote.textContent = String(error.message || error);
      dashboard.hidden = true;
    }
  }

  function main() {
    try {
      requireFirebase();
    } catch (error) {
      authNote.textContent = String(error.message || error);
      return;
    }

    const auth = window.firebase.auth();
    auth.onAuthStateChanged((user) => updateUiForUser(user));

    loginForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const formData = new FormData(loginForm);
      const email = String(formData.get("email") || "").trim();
      const password = String(formData.get("password") || "");
      auth
        .signInWithEmailAndPassword(email, password)
        .then(() => showToast("Signed in."))
        .catch((error) => showToast(error.message || "Sign in failed."));
    });

    signOutButton.addEventListener("click", () => {
      auth.signOut().then(() => showToast("Signed out."));
    });

    attachEvents();
  }

  main();
})();

