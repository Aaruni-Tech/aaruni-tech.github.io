function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDate(value) {
  const date = value ? new Date(value) : new Date();
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(Number.isNaN(date.getTime()) ? new Date() : date);
}

function formatMoney(value) {
  if (window.AaruniOrders && window.AaruniOrders.formatOrderPrice) {
    return window.AaruniOrders.formatOrderPrice(Number(value || 0));
  }

  return `Rs. ${Number(value || 0).toLocaleString("en-IN")}`;
}

function formatOrderSummary(order) {
  const items = Array.isArray(order.items) ? order.items : [];
  const primaryItems = items.slice(0, 2).map((item) => `${item.name} x ${item.quantity}`);
  const remaining = items.length - primaryItems.length;
  return remaining > 0 ? `${primaryItems.join(", ")} + ${remaining} more` : primaryItems.join(", ");
}

function getOrderQuantity(order) {
  if (order.totalQuantity) {
    return Number(order.totalQuantity);
  }

  return (Array.isArray(order.items) ? order.items : []).reduce((sum, item) => sum + Number(item.quantity || 0), 0);
}

function renderLoginPrompt(container, message) {
  container.innerHTML = `
    <article class="orders-auth-card">
      <div>
        <p class="section-kicker">Customer login</p>
        <h2>Login to view your orders</h2>
        <p>${escapeHtml(message || "Your order history is protected and linked to your Aaruni Tech account.")}</p>
      </div>

      <form class="orders-login-form" id="ordersLoginForm">
        <label>
          <span>Email</span>
          <input type="email" name="email" autocomplete="email" required />
        </label>
        <label>
          <span>Password</span>
          <input type="password" name="password" autocomplete="current-password" minlength="6" required />
        </label>
        <button class="primary-button" type="submit">Login</button>
      </form>

      <div class="orders-auth-actions">
        <a class="secondary-button" href="index.html?open_account=1&mode=signup">Create Account</a>
        <a class="primary-link" href="index.html?open_account=1&mode=forgot">Forgot password?</a>
      </div>
    </article>
  `;

  const form = container.querySelector("#ordersLoginForm");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!window.AaruniSupabaseBackend || !window.AaruniSupabaseBackend.signInCustomer) {
      renderError(container, "Supabase Auth is not available.");
      return;
    }

    const loginData = Object.fromEntries(new FormData(form).entries());
    form.querySelectorAll("button, input").forEach((control) => {
      control.disabled = true;
    });

    const result = await window.AaruniSupabaseBackend.signInCustomer(loginData);

    if (!result.ok) {
      renderLoginPrompt(container, result.error || "Login failed.");
      return;
    }

    renderMyOrders("myOrdersPage");
  });
}

function renderEmpty(container) {
  container.innerHTML = `
    <article class="info-card">
      <h2>No orders yet</h2>
      <p>Complete checkout while logged in and every order will appear here whenever you return.</p>
      <a class="primary-link tracking-action" href="index.html#products">Shop Products</a>
    </article>
  `;
}

function renderError(container, message) {
  container.innerHTML = `
    <article class="info-card">
      <h2>Could not load orders</h2>
      <p>${escapeHtml(message || "Please try again or contact support.")}</p>
      <a class="primary-link tracking-action" href="contact-us.html">Contact Support</a>
    </article>
  `;
}

function renderOrderCard(order) {
  const steps = window.AaruniOrders && window.AaruniOrders.getTrackingSteps ? window.AaruniOrders.getTrackingSteps(order) : [];
  const orderId = escapeHtml(order.id || "");
  const paymentStatus = (order.payment && order.payment.status) || order.payment_status || "Paid";
  const deliveryStatus = order.status || "Order Confirmed";
  const quantity = getOrderQuantity(order);

  return `
    <article class="order-card" data-order-card="${orderId}">
      <div class="order-card-top">
        <div class="order-card-meta">
          <strong>${orderId}</strong>
          <span>${escapeHtml(order.orderDate || formatDate(order.createdAt))}</span>
        </div>
        <span class="order-status-badge">${escapeHtml(deliveryStatus)}</span>
      </div>

      <div class="order-facts" aria-label="Order summary">
        <div><span>Products</span><strong>${escapeHtml(formatOrderSummary(order) || "Items unavailable")}</strong></div>
        <div><span>Quantity</span><strong>${escapeHtml(quantity)}</strong></div>
        <div><span>Amount</span><strong>${formatMoney(order.totalAmount)}</strong></div>
        <div><span>Payment</span><strong>${escapeHtml(paymentStatus)}</strong></div>
      </div>

      <div class="order-card-bottom">
        <div class="order-card-total">
          <span>Delivery Status</span>
          <strong>${escapeHtml(deliveryStatus)}</strong>
        </div>

        <div class="order-card-actions">
          <a class="secondary-button" href="track-order.html?order_id=${encodeURIComponent(order.id)}">Track</a>
          <button class="primary-button" type="button" data-order-toggle="${orderId}" aria-expanded="false">Details</button>
        </div>
      </div>

      <div class="order-details" data-order-details="${orderId}" hidden>
        <div class="order-details-grid">
          <div class="order-details-block">
            <p class="order-details-label">Delivery Address</p>
            <p class="order-details-value">${escapeHtml(order.buyer && order.buyer.address ? order.buyer.address : "Not available")}</p>
            <p class="order-details-sub">Phone: ${escapeHtml(order.buyer && order.buyer.phone ? order.buyer.phone : "not provided")}</p>
          </div>
          <div class="order-details-block">
            <p class="order-details-label">Payment ID</p>
            <p class="order-details-value">${escapeHtml(order.payment && order.payment.id ? order.payment.id : "not available")}</p>
            <p class="order-details-sub">Status: ${escapeHtml(paymentStatus)}</p>
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
                <span>${escapeHtml(item.name)} x ${escapeHtml(item.quantity)}</span>
                <strong>${formatMoney(item.lineTotal)}</strong>
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

function attachInteractions(container, ordersById) {
  container.addEventListener("click", (event) => {
    const toggleButton = event.target.closest("[data-order-toggle]");
    const invoiceButton = event.target.closest("[data-order-invoice]");
    const logoutButton = event.target.closest("[data-orders-logout]");

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

    if (logoutButton && window.AaruniSupabaseBackend && window.AaruniSupabaseBackend.signOutCustomer) {
      window.AaruniSupabaseBackend.signOutCustomer().then(() => renderMyOrders("myOrdersPage"));
    }
  });
}

async function waitForBackend() {
  if (window.AaruniSupabaseBackend) {
    return;
  }

  await new Promise((resolve) => {
    window.addEventListener("aaruni:supabase-ready", resolve, { once: true });
  });
}

async function renderMyOrders(containerId) {
  const container = document.querySelector(`#${containerId}`);

  if (!container) {
    return;
  }

  container.innerHTML = `<article class="info-card"><h2>Loading your orders</h2><p>Please wait.</p></article>`;

  try {
    await waitForBackend();

    if (!window.AaruniSupabaseBackend || !window.AaruniSupabaseBackend.getCurrentAccount) {
      renderError(container, "Supabase is not configured.");
      return;
    }

    const account = await window.AaruniSupabaseBackend.getCurrentAccount();

    if (!account.user) {
      renderLoginPrompt(container);
      return;
    }

    const result = await window.AaruniSupabaseBackend.listOrdersForCurrentUser({ limit: 50 });

    if (!result.ok) {
      if (result.code === "auth_required") {
        renderLoginPrompt(container);
        return;
      }

      renderError(container, result.error || "Order history is unavailable.");
      return;
    }

    const orders = result.orders || [];

    if (!orders.length) {
      renderEmpty(container);
      return;
    }

    const profile = account.profile || {};
    const ordersById = new Map(orders.map((order) => [order.id, order]));
    container.innerHTML = `
      <div class="orders-header-row">
        <div>
          <p class="orders-customer">Signed in as <strong>${escapeHtml(profile.full_name || profile.name || account.user.email)}</strong></p>
          <p>Showing ${orders.length} order${orders.length === 1 ? "" : "s"} linked to ${escapeHtml(account.user.email)}.</p>
        </div>
        <div class="orders-header-actions">
          <a class="secondary-button" href="index.html#products">Continue Shopping</a>
          <button class="secondary-button" type="button" data-orders-logout>Logout</button>
        </div>
      </div>
      <div class="orders-grid">
        ${orders.map((order) => renderOrderCard(order)).join("")}
      </div>
    `;

    attachInteractions(container, ordersById);
  } catch (error) {
    console.warn("My Orders render failed.", error);
    renderError(container, error && error.message ? error.message : "Unexpected error.");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  renderMyOrders("myOrdersPage");
});
