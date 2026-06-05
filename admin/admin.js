import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const ADMIN_EMAIL = "tech.aaruni@gmail.com";
const SUPABASE_URL = String(window.SUPABASE_URL || "").replace(/\/+$/, "");
const SUPABASE_ANON_KEY = String(window.SUPABASE_ANON_KEY || "");
const ORDER_STATUSES = ["Processing", "Shipped", "Delivered", "Cancelled"];

const client = SUPABASE_URL && SUPABASE_ANON_KEY
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: "pkce",
    },
  })
  : null;

const authView = document.querySelector("#adminAuthView");
const shell = document.querySelector("#adminShell");
const loginForm = document.querySelector("#adminLoginForm");
const loginMessage = document.querySelector("#adminLoginMessage");
const toast = document.querySelector("#adminToast");
const loading = document.querySelector("#adminLoading");
const pageTitle = document.querySelector("#adminPageTitle");
const modeBadge = document.querySelector("#adminModeBadge");
const orderModal = document.querySelector("#orderModal");
const orderModalContent = document.querySelector("#orderModalContent");

let activeSection = "dashboard";
let toastTimer;
let currentSettings = null;
let ordersState = { mode: "all", paymentStatus: "all", search: "" };

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatMoney(value) {
  return `Rs. ${Number(value || 0).toLocaleString("en-IN")}`;
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function statusBadge(status) {
  const normalized = String(status || "").toLowerCase();
  return `<span class="admin-status" data-status="${escapeHtml(normalized)}">${escapeHtml(status || "pending")}</span>`;
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add("show");
  toastTimer = window.setTimeout(() => toast.classList.remove("show"), 2600);
}

function setLoading(isLoading) {
  loading.hidden = !isLoading;
}

function setLoginMessage(message) {
  loginMessage.hidden = !message;
  loginMessage.textContent = message || "";
}

function setModeBadge(mode) {
  const isProduction = mode === "production";
  modeBadge.textContent = isProduction ? "LIVE MODE" : "TEST MODE";
  modeBadge.dataset.mode = isProduction ? "production" : "test";
}

async function getSession() {
  if (!client) return null;
  const { data } = await client.auth.getSession();
  return data.session || null;
}

async function callAdmin(action, payload = {}) {
  const session = await getSession();
  if (!session) throw new Error("Admin login required.");

  const response = await fetch(`${SUPABASE_URL}/functions/v1/admin-api`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action, ...payload }),
  });
  const data = await response.json().catch(() => null);

  if (!response.ok || !data || data.ok === false) {
    throw new Error((data && data.error) || `Admin API failed (${response.status})`);
  }

  return data;
}

function sectionElement(name) {
  return document.querySelector(`#section-${name}`);
}

function switchSection(name) {
  activeSection = name;
  document.querySelectorAll(".admin-section").forEach((section) => {
    section.hidden = section.id !== `section-${name}`;
  });
  document.querySelectorAll(".admin-nav button").forEach((button) => {
    button.classList.toggle("active", button.dataset.section === name);
  });
  pageTitle.textContent = {
    dashboard: "Dashboard",
    orders: "Orders",
    customers: "Customers",
    products: "Products",
    payments: "Payments",
    emailLogs: "Email Logs",
    settings: "Settings",
  }[name] || "Dashboard";
  loadSection(name);
}

function renderStats(stats) {
  const entries = [
    ["Total orders", stats.totalOrders],
    ["Production orders", stats.productionOrders],
    ["Test orders", stats.testOrders],
    ["Paid orders", stats.paidOrders],
    ["Revenue", formatMoney(stats.totalRevenue)],
    ["Customers", stats.customers],
    ["Products", stats.products],
    ["Email failures", stats.emailFailures],
  ];

  return `<div class="admin-stats">${entries.map(([label, value]) => `
    <article class="admin-stat">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </article>
  `).join("")}</div>`;
}

function ordersTable(orders, compact = false) {
  if (!orders.length) {
    return `<div class="admin-panel"><div class="admin-panel-header"><h2>No orders found</h2></div></div>`;
  }

  return `
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead>
          <tr>
            <th>Order</th>
            <th>Customer</th>
            <th>Mode</th>
            <th>Payment</th>
            <th>Status</th>
            <th>Total</th>
            <th>Created</th>
            ${compact ? "" : "<th>Action</th>"}
          </tr>
        </thead>
        <tbody>
          ${orders.map((order) => `
            <tr>
              <td><strong>${escapeHtml(order.id)}</strong><br><span class="admin-muted">${escapeHtml(order.productSummary || "")}</span></td>
              <td>${escapeHtml(order.customerName)}<br><span class="admin-muted">${escapeHtml(order.customerEmail || order.phone || "")}</span></td>
              <td>${statusBadge(order.mode === "production" ? "live" : "test")}</td>
              <td>${statusBadge(order.paymentStatus)}<br><span class="admin-muted">${escapeHtml(order.paymentId || "")}</span></td>
              <td>${statusBadge(order.orderStatus)}</td>
              <td><strong>${formatMoney(order.totalAmount)}</strong></td>
              <td>${escapeHtml(formatDate(order.createdAt))}</td>
              ${compact ? "" : `<td><button class="order-action" type="button" data-open-order="${escapeHtml(order.id)}" data-source-table="${escapeHtml(order.sourceTable)}" data-mode="${escapeHtml(order.mode)}">Open</button></td>`}
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderDashboard(data) {
  sectionElement("dashboard").innerHTML = `
    ${renderStats(data.stats || {})}
    <article class="admin-panel">
      <div class="admin-panel-header"><h2>Recent orders</h2></div>
      ${ordersTable(data.recentOrders || [], true)}
    </article>
    <article class="admin-panel">
      <div class="admin-panel-header"><h2>Recent email logs</h2></div>
      ${emailLogsTable(data.emailLogs || [])}
    </article>
  `;
  currentSettings = data.settings || currentSettings;
  setModeBadge(currentSettings && currentSettings.environment_mode);
}

function renderOrders(data) {
  sectionElement("orders").innerHTML = `
    <article class="admin-panel">
      <div class="admin-toolbar">
        <input id="orderSearchInput" type="search" placeholder="Search orders, customers, phone, payment ID" value="${escapeHtml(ordersState.search)}" />
        <select id="orderPaymentFilter">
          ${["all", "paid", "pending", "failed"].map((status) => `<option value="${status}" ${ordersState.paymentStatus === status ? "selected" : ""}>${status}</option>`).join("")}
        </select>
        <select id="orderModeFilter">
          ${["all", "test", "production"].map((mode) => `<option value="${mode}" ${ordersState.mode === mode ? "selected" : ""}>${mode}</option>`).join("")}
        </select>
      </div>
      ${ordersTable(data.orders || [])}
    </article>
  `;
}

function customersTable(customers) {
  return `
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Orders</th><th>Total spent</th><th>Last login</th></tr></thead>
        <tbody>
          ${customers.map((customer) => `
            <tr>
              <td><strong>${escapeHtml(customer.name)}</strong></td>
              <td>${escapeHtml(customer.email)}</td>
              <td>${escapeHtml(customer.phone || "")}</td>
              <td>${escapeHtml(customer.orderCount || 0)}</td>
              <td>${formatMoney(customer.totalSpent)}</td>
              <td>${escapeHtml(formatDate(customer.lastLogin) || "Not available")}</td>
            </tr>
          `).join("") || `<tr><td colspan="6">No customers found.</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}

function renderCustomers(data) {
  sectionElement("customers").innerHTML = `<article class="admin-panel"><div class="admin-panel-header"><h2>Customers</h2></div>${customersTable(data.customers || [])}</article>`;
}

function renderProducts(data) {
  const products = data.products || [];
  sectionElement("products").innerHTML = `
    <article class="admin-panel">
      <div class="admin-panel-header"><h2>Products</h2></div>
      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead><tr><th>ID</th><th>Name</th><th>Price</th><th>Stock</th><th>Created</th></tr></thead>
          <tbody>
            ${products.map((product) => `
              <tr>
                <td>${escapeHtml(product.id || product.product_id || product.slug)}</td>
                <td><strong>${escapeHtml(product.product_name || product.name || "")}</strong><br><span class="admin-muted">${escapeHtml(product.description || "")}</span></td>
                <td>${formatMoney(product.price)}</td>
                <td>${escapeHtml(product.stock ?? "n/a")}</td>
                <td>${escapeHtml(formatDate(product.created_at))}</td>
              </tr>
            `).join("") || `<tr><td colspan="5">No products found.</td></tr>`}
          </tbody>
        </table>
      </div>
    </article>
  `;
}

function renderPayments(data) {
  const payments = data.payments || [];
  sectionElement("payments").innerHTML = `
    <article class="admin-panel">
      <div class="admin-panel-header"><h2>Payments</h2></div>
      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead><tr><th>Order</th><th>Mode</th><th>Payment ID</th><th>Status</th><th>Amount</th><th>Customer</th><th>Created</th></tr></thead>
          <tbody>
            ${payments.map((payment) => `
              <tr>
                <td>${escapeHtml(payment.orderId)}</td>
                <td>${statusBadge(payment.mode === "production" ? "live" : "test")}</td>
                <td>${escapeHtml(payment.paymentId || "")}</td>
                <td>${statusBadge(payment.paymentStatus)}</td>
                <td>${formatMoney(payment.amount)}</td>
                <td>${escapeHtml(payment.customerEmail || "")}</td>
                <td>${escapeHtml(formatDate(payment.createdAt))}</td>
              </tr>
            `).join("") || `<tr><td colspan="7">No payments found.</td></tr>`}
          </tbody>
        </table>
      </div>
    </article>
  `;
}

function emailLogsTable(emailLogs) {
  return `
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead><tr><th>Order</th><th>Type</th><th>Recipient</th><th>Status</th><th>Attempts</th><th>Failure</th><th>Mode</th><th>Updated</th></tr></thead>
        <tbody>
          ${emailLogs.map((log) => `
            <tr>
              <td>${escapeHtml(log.order_id || "")}<br><span class="admin-muted">${escapeHtml(log.payment_id || "")}</span></td>
              <td>${escapeHtml(log.email_type || "")}</td>
              <td>${escapeHtml(log.recipient_email || "")}</td>
              <td>${statusBadge(log.status || "pending")}</td>
              <td>${escapeHtml(log.resend_attempts || 0)}</td>
              <td>${escapeHtml(log.failure_reason || "")}</td>
              <td>${statusBadge((log.environment_mode || "production") === "production" ? "live" : "test")}</td>
              <td>${escapeHtml(formatDate(log.updated_at || log.created_at))}</td>
            </tr>
          `).join("") || `<tr><td colspan="8">No email logs found.</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}

function renderEmailLogs(data) {
  sectionElement("emailLogs").innerHTML = `<article class="admin-panel"><div class="admin-panel-header"><h2>Email logs</h2></div>${emailLogsTable(data.emailLogs || [])}</article>`;
}

function renderSettings(data) {
  const settings = data.settings || currentSettings || {};
  currentSettings = settings;
  setModeBadge(settings.environment_mode);

  sectionElement("settings").innerHTML = `
    <article class="admin-panel">
      <div class="admin-panel-header">
        <h2>Environment Toggle</h2>
        <div class="mode-toggle" id="modeToggle">
          <button type="button" data-mode="test" class="${settings.environment_mode === "production" ? "" : "active"}">TEST MODE</button>
          <button type="button" data-mode="production" class="${settings.environment_mode === "production" ? "active" : ""}">PRODUCTION MODE</button>
        </div>
      </div>
    </article>
    <article class="admin-panel">
      <div class="admin-panel-header"><h2>Storefront settings</h2></div>
      <form class="admin-form-grid" id="settingsForm">
        <label>
          <span>Razorpay test key ID</span>
          <input name="razorpay_test_key_id" value="${escapeHtml(settings.razorpay_test_key_id || "")}" />
        </label>
        <label>
          <span>Razorpay test key secret</span>
          <input name="razorpay_test_key_secret" type="password" placeholder="${settings.razorpay_test_secret_configured ? "Configured - enter to replace" : "Not configured"}" />
        </label>
        <label>
          <span>Razorpay live key ID</span>
          <input name="razorpay_live_key_id" value="${escapeHtml(settings.razorpay_live_key_id || "")}" />
        </label>
        <label>
          <span>Razorpay live key secret</span>
          <input name="razorpay_live_key_secret" type="password" placeholder="${settings.razorpay_live_secret_configured ? "Configured - enter to replace" : "Not configured"}" />
        </label>
        <label>
          <span>Resend from email</span>
          <input name="resend_from_email" type="email" value="${escapeHtml(settings.resend_from_email || "")}" />
        </label>
        <label>
          <span>Notification email</span>
          <input name="notification_email" type="email" value="${escapeHtml(settings.notification_email || ADMIN_EMAIL)}" />
        </label>
        <label>
          <span>Shipping fee</span>
          <input name="shipping_fee" type="number" min="0" step="1" value="${escapeHtml(settings.shipping_fee || 0)}" />
        </label>
        <label>
          <span>GST percent</span>
          <input name="gst_percent" type="number" min="0" step="0.01" value="${escapeHtml(settings.gst_percent || 0)}" />
        </label>
        <label class="full">
          <span>GST enabled</span>
          <select name="gst_enabled">
            <option value="false" ${settings.gst_enabled ? "" : "selected"}>Disabled</option>
            <option value="true" ${settings.gst_enabled ? "selected" : ""}>Enabled</option>
          </select>
        </label>
        <div class="full">
          <button class="admin-primary" type="submit">Save Settings</button>
        </div>
      </form>
    </article>
  `;
}

function openOrderModal(order) {
  orderModalContent.innerHTML = `
    <p class="admin-kicker">${escapeHtml(order.mode === "production" ? "Live order" : "Test order")}</p>
    <h2>${escapeHtml(order.id)}</h2>
    <div class="order-detail-grid">
      <div><strong>Customer</strong><p>${escapeHtml(order.customerName)}<br>${escapeHtml(order.customerEmail)}<br>${escapeHtml(order.phone)}</p></div>
      <div><strong>Payment</strong><p>${escapeHtml(order.paymentId)}<br>${statusBadge(order.paymentStatus)}</p></div>
      <div><strong>Shipping</strong><p>${escapeHtml(order.shippingAddress || "Not provided")}</p></div>
      <div><strong>Total</strong><p>${formatMoney(order.totalAmount)}</p></div>
      <div><strong>Products</strong><p>${escapeHtml(order.productSummary || "Cart items")}</p></div>
      <div>
        <strong>Status</strong>
        <p>${statusBadge(order.orderStatus)}</p>
        <select class="order-status-select" id="modalOrderStatus">
          ${ORDER_STATUSES.map((status) => `<option value="${status}" ${order.orderStatus === status ? "selected" : ""}>${status}</option>`).join("")}
        </select>
        <button class="admin-primary" type="button" id="saveOrderStatusButton" data-order-id="${escapeHtml(order.id)}" data-source-table="${escapeHtml(order.sourceTable)}" data-mode="${escapeHtml(order.mode)}">Save Status</button>
      </div>
    </div>
  `;
  orderModal.hidden = false;
}

async function loadSection(name = activeSection) {
  if (!shell || shell.hidden) return;
  setLoading(true);
  try {
    if (name === "dashboard") renderDashboard(await callAdmin("dashboard"));
    if (name === "orders") renderOrders(await callAdmin("orders", ordersState));
    if (name === "customers") renderCustomers(await callAdmin("customers"));
    if (name === "products") renderProducts(await callAdmin("products"));
    if (name === "payments") renderPayments(await callAdmin("payments"));
    if (name === "emailLogs") renderEmailLogs(await callAdmin("emailLogs"));
    if (name === "settings") renderSettings(await callAdmin("settings"));
  } catch (error) {
    showToast(error.message || "Admin load failed.");
  } finally {
    setLoading(false);
  }
}

async function showShellForSession(session) {
  const email = (session && session.user && session.user.email ? session.user.email : "").toLowerCase();
  if (!session || email !== ADMIN_EMAIL) {
    authView.hidden = false;
    shell.hidden = true;
    if (session && email !== ADMIN_EMAIL) setLoginMessage("This account is not allowed to access admin.");
    return;
  }

  authView.hidden = true;
  shell.hidden = false;
  switchSection(activeSection);
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setLoginMessage("");

  if (!client) {
    setLoginMessage("Supabase is not configured.");
    return;
  }

  const formData = Object.fromEntries(new FormData(loginForm).entries());
  const email = String(formData.email || "").trim().toLowerCase();
  if (email !== ADMIN_EMAIL) {
    setLoginMessage("Only tech.aaruni@gmail.com is allowed.");
    return;
  }

  const button = loginForm.querySelector("button");
  button.disabled = true;
  try {
    const { data, error } = await client.auth.signInWithPassword({
      email,
      password: String(formData.password || ""),
    });
    if (error) {
      setLoginMessage(error.message || "Login failed.");
      return;
    }
    await showShellForSession(data.session);
  } finally {
    button.disabled = false;
  }
});

document.querySelector(".admin-nav").addEventListener("click", (event) => {
  const button = event.target.closest("[data-section]");
  if (!button) return;
  switchSection(button.dataset.section);
});

document.querySelector("#refreshAdminButton").addEventListener("click", () => loadSection(activeSection));

document.querySelector("#adminLogoutButton").addEventListener("click", async () => {
  if (client) await client.auth.signOut();
  authView.hidden = false;
  shell.hidden = true;
});

document.addEventListener("input", (event) => {
  if (event.target.id === "orderSearchInput") {
    ordersState.search = event.target.value;
    window.clearTimeout(event.target._timer);
    event.target._timer = window.setTimeout(() => loadSection("orders"), 250);
  }
});

document.addEventListener("change", (event) => {
  if (event.target.id === "orderPaymentFilter") {
    ordersState.paymentStatus = event.target.value;
    loadSection("orders");
  }
  if (event.target.id === "orderModeFilter") {
    ordersState.mode = event.target.value;
    loadSection("orders");
  }
});

document.addEventListener("click", async (event) => {
  const openButton = event.target.closest("[data-open-order]");
  const modeButton = event.target.closest("#modeToggle [data-mode]");
  const saveStatusButton = event.target.closest("#saveOrderStatusButton");

  if (openButton) {
    try {
      const data = await callAdmin("orderDetails", {
        orderId: openButton.dataset.openOrder,
        mode: openButton.dataset.mode,
      });
      if (data.order) openOrderModal(data.order);
    } catch (error) {
      showToast(error.message || "Could not open order.");
    }
  }

  if (modeButton) {
    try {
      const data = await callAdmin("updateSettings", {
        settings: { environment_mode: modeButton.dataset.mode },
      });
      currentSettings = data.settings;
      renderSettings(data);
      showToast(`Mode set to ${modeButton.dataset.mode === "production" ? "LIVE" : "TEST"}.`);
    } catch (error) {
      showToast(error.message || "Mode update failed.");
    }
  }

  if (saveStatusButton) {
    const select = document.querySelector("#modalOrderStatus");
    try {
      await callAdmin("updateOrderStatus", {
        orderId: saveStatusButton.dataset.orderId,
        sourceTable: saveStatusButton.dataset.sourceTable,
        mode: saveStatusButton.dataset.mode,
        status: select.value,
      });
      orderModal.hidden = true;
      showToast("Order status updated.");
      loadSection("orders");
    } catch (error) {
      showToast(error.message || "Status update failed.");
    }
  }
});

document.addEventListener("submit", async (event) => {
  if (event.target.id !== "settingsForm") return;
  event.preventDefault();
  const formData = Object.fromEntries(new FormData(event.target).entries());
  formData.gst_enabled = formData.gst_enabled === "true";

  try {
    const data = await callAdmin("updateSettings", { settings: formData });
    currentSettings = data.settings;
    renderSettings(data);
    showToast("Settings saved.");
  } catch (error) {
    showToast(error.message || "Settings save failed.");
  }
});

document.querySelector("#closeOrderModal").addEventListener("click", () => {
  orderModal.hidden = true;
});

orderModal.addEventListener("click", (event) => {
  if (event.target === orderModal) orderModal.hidden = true;
});

(async function init() {
  if (!client) {
    setLoginMessage("Supabase is not configured.");
    return;
  }

  const session = await getSession();
  await showShellForSession(session);
})();
