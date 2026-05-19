const SIGNUP_STORAGE_KEY = "aaruniTechSignupProfile";

function loadSignupProfile() {
  try {
    const parsedProfile = JSON.parse(window.localStorage.getItem(SIGNUP_STORAGE_KEY));

    if (!parsedProfile || typeof parsedProfile !== "object") {
      return {};
    }

    return parsedProfile;
  } catch (error) {
    return {};
  }
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderEmpty(container, message) {
  container.innerHTML = `
    <article class="info-card">
      <h2>${escapeHtml(message || "No orders yet")}</h2>
      <p>Shop products and complete checkout to see your orders here.</p>
      <a class="primary-link tracking-action" href="index.html#products">Shop Products</a>
    </article>
  `;
}

function formatOrderSummary(order) {
  const items = Array.isArray(order.items) ? order.items : [];
  const primaryItems = items.slice(0, 2).map((item) => `${item.name} × ${item.quantity}`);
  const remaining = items.length - primaryItems.length;
  return remaining > 0 ? `${primaryItems.join(", ")} + ${remaining} more` : primaryItems.join(", ");
}

function renderOrderCard(order) {
  const steps = window.AaruniOrders && window.AaruniOrders.getTrackingSteps ? window.AaruniOrders.getTrackingSteps(order) : [];
  const statusBadge = escapeHtml(order.status || "Order Confirmed");
  const orderId = escapeHtml(order.id || "");

  return `
    <article class="order-card" data-order-card="${orderId}">
      <div class="order-card-top">
        <div class="order-card-meta">
          <strong>${orderId}</strong>
          <span>${escapeHtml(order.orderDate || "")}</span>
        </div>
        <span class="order-status-badge">${statusBadge}</span>
      </div>

      <p class="order-card-items">${escapeHtml(formatOrderSummary(order) || "Items are loading")}</p>

      <div class="order-card-bottom">
        <div class="order-card-total">
          <span>Total</span>
          <strong>${window.AaruniOrders.formatOrderPrice(order.totalAmount)}</strong>
        </div>

        <div class="order-card-actions">
          <a class="secondary-button" href="track-order.html?order_id=${encodeURIComponent(order.id)}">Track</a>
          <button class="primary-button" type="button" data-order-toggle="${orderId}" aria-expanded="false">Details</button>
        </div>
      </div>

      <div class="order-details" data-order-details="${orderId}" hidden>
        <div class="order-details-grid">
          <div class="order-details-block">
            <p class="order-details-label">Delivery</p>
            <p class="order-details-value">${escapeHtml(order.buyer && order.buyer.address ? order.buyer.address : "Not available")}</p>
            <p class="order-details-sub">Phone: ${escapeHtml(order.buyer && order.buyer.phone ? order.buyer.phone : "not provided")}</p>
          </div>
          <div class="order-details-block">
            <p class="order-details-label">Payment</p>
            <p class="order-details-value">${escapeHtml(order.payment && order.payment.id ? order.payment.id : "not available")}</p>
            <p class="order-details-sub">Subtotal: ${window.AaruniOrders.formatOrderPrice(order.subtotal)}</p>
          </div>
        </div>

        <div class="order-timeline">
          ${steps
            .map(
              (step) => `
              <div class="tracking-step ${step.active ? "active" : ""}">
                <span></span>
                <div>
                  <strong>${escapeHtml(step.status)}</strong>
                  <small>${escapeHtml(step.date || "Pending")}</small>
                </div>
              </div>
            `
            )
            .join("")}
        </div>

        <div class="order-items-compact">
          <h3>Items</h3>
          ${(Array.isArray(order.items) ? order.items : [])
            .map(
              (item) => `
              <div class="order-item-row">
                <span>${escapeHtml(item.name)} × ${escapeHtml(item.quantity)}</span>
                <strong>${window.AaruniOrders.formatOrderPrice(item.lineTotal)}</strong>
              </div>
            `
            )
            .join("")}
        </div>

        <div class="order-details-actions">
          <button class="secondary-button" type="button" data-order-invoice="${orderId}">Invoice</button>
          <a class="primary-link" href="contact-us.html">Need help?</a>
        </div>
      </div>
    </article>
  `;
}

async function loadOrders() {
  const signupProfile = loadSignupProfile();
  const email = signupProfile.email ? String(signupProfile.email).trim() : "";
  const phone = signupProfile.phone ? String(signupProfile.phone).trim() : "";

  const hasLookupInfo = Boolean(email || phone);

  if (
    hasLookupInfo &&
    window.AaruniSupabaseBackend &&
    window.AaruniSupabaseBackend.isConfigured &&
    window.AaruniSupabaseBackend.isConfigured() &&
    window.AaruniSupabaseBackend.listOrdersForCustomer
  ) {
    const result = await window.AaruniSupabaseBackend.listOrdersForCustomer({ email, phone, limit: 20 });

    if (result && result.ok) {
      return result.orders || [];
    }
  }

  return window.AaruniOrders && window.AaruniOrders.loadOrders ? window.AaruniOrders.loadOrders() : [];
}

function attachInteractions(container, ordersById) {
  container.addEventListener("click", (event) => {
    const toggleButton = event.target.closest("[data-order-toggle]");
    const invoiceButton = event.target.closest("[data-order-invoice]");

    if (toggleButton) {
      const orderId = toggleButton.dataset.orderToggle;
      const details = container.querySelector(`[data-order-details="${CSS.escape(orderId)}"]`);
      const expanded = toggleButton.getAttribute("aria-expanded") === "true";
      toggleButton.setAttribute("aria-expanded", expanded ? "false" : "true");
      toggleButton.textContent = expanded ? "Details" : "Hide";
      if (details) {
        details.hidden = expanded;
      }
    }

    if (invoiceButton) {
      const orderId = invoiceButton.dataset.orderInvoice;
      const order = ordersById.get(orderId);
      if (order && window.AaruniOrders && window.AaruniOrders.downloadInvoice) {
        window.AaruniOrders.downloadInvoice(order);
      }
    }
  });
}

async function renderMyOrders(containerId) {
  const container = document.querySelector(`#${containerId}`);

  if (!container) {
    return;
  }

  container.innerHTML = `<article class="info-card"><h2>Loading your orders…</h2><p>Please wait.</p></article>`;

  try {
    const orders = await loadOrders();

    if (!orders.length) {
      const profile = loadSignupProfile();
      if (!profile.email && !profile.phone) {
        container.innerHTML = `
          <article class="info-card">
            <h2>Add your details to view orders</h2>
            <p>Open the Account panel on the homepage and save your email and phone number.</p>
            <a class="primary-link tracking-action" href="index.html">Go to Home</a>
          </article>
        `;
        return;
      }

      renderEmpty(container, "No orders found");
      return;
    }

    const ordersById = new Map(orders.map((order) => [order.id, order]));
    container.innerHTML = `
      <div class="orders-header-row">
        <p>Showing ${orders.length} recent order${orders.length === 1 ? "" : "s"}.</p>
        <a class="secondary-button" href="index.html#products">Continue Shopping</a>
      </div>
      <div class="orders-grid">
        ${orders.map((order) => renderOrderCard(order)).join("")}
      </div>
    `;

    attachInteractions(container, ordersById);
  } catch (error) {
    console.warn("My Orders render failed.", error);
    container.innerHTML = `
      <article class="info-card">
        <h2>Couldn’t load orders</h2>
        <p>Please try again or contact support at <a href="mailto:tech.aaruni@gmail.com">tech.aaruni@gmail.com</a>.</p>
      </article>
    `;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  renderMyOrders("myOrdersPage");
});

