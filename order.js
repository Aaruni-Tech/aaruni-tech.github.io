const AARUNI_ORDER_STORAGE_KEY = "aaruniTechOrders";
const AARUNI_LAST_ORDER_KEY = "aaruniTechLastOrderId";
const AARUNI_ORDER_STATUSES = ["Confirmed", "Packed", "Shipped", "Delivered"];

function formatOrderPrice(amount) {
  return `Rs. ${Number(amount || 0).toLocaleString("en-IN")}`;
}

function formatOrderDate(value) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function addOrderDays(date, days) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

function generateOrderId(date = new Date()) {
  const datePart = date.toISOString().slice(0, 10).replace(/-/g, "");
  const randomPart = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `AT-${datePart}-${randomPart}`;
}

function getAddressParts(profile) {
  return [
    profile.houseNumber,
    profile.village,
    profile.mandal,
    profile.area,
    profile.district,
    profile.state,
  ].filter(Boolean);
}

function buildOrderItems(cartItems, products) {
  return cartItems
    .map((cartItem) => {
      const product = products.find((entry) => entry.id === cartItem.id);

      if (!product) {
        return null;
      }

      const quantity = Number.isInteger(cartItem.quantity) && cartItem.quantity > 0 ? cartItem.quantity : 1;

      return {
        id: product.id,
        name: product.name,
        category: product.category,
        image: product.image,
        price: product.price,
        quantity,
        lineTotal: product.price * quantity,
      };
    })
    .filter(Boolean);
}

function createOrder({ cartItems, products, buyerProfile, paymentId, supportEmail }) {
  const createdAt = new Date();
  const items = buildOrderItems(cartItems, products);
  const subtotal = items.reduce((total, item) => total + item.lineTotal, 0);
  const shippingCharge = 0;
  const totalAmount = subtotal + shippingCharge;
  const addressParts = getAddressParts(buyerProfile || {});
  const orderId = generateOrderId(createdAt);

  return {
    id: orderId,
    invoiceNumber: `INV-${orderId}`,
    status: "Confirmed",
    createdAt: createdAt.toISOString(),
    orderDate: formatOrderDate(createdAt),
    orderTime: new Intl.DateTimeFormat("en-IN", { hour: "2-digit", minute: "2-digit" }).format(createdAt),
    estimatedDeliveryDate: formatOrderDate(addOrderDays(createdAt, 5)),
    payment: {
      provider: "Razorpay",
      id: paymentId || "not available",
      status: paymentId ? "Paid" : "Pending verification",
    },
    buyer: {
      name: buyerProfile && buyerProfile.name ? buyerProfile.name : "Customer",
      email: buyerProfile && buyerProfile.email ? buyerProfile.email : "",
      phone: buyerProfile && buyerProfile.phone ? buyerProfile.phone : "",
      address: addressParts.join(", "),
      addressParts,
      state: buyerProfile && buyerProfile.state ? buyerProfile.state : "",
      district: buyerProfile && buyerProfile.district ? buyerProfile.district : "",
    },
    items,
    totalQuantity: items.reduce((total, item) => total + item.quantity, 0),
    subtotal,
    shippingCharge,
    totalAmount,
    supportEmail: supportEmail || "tech.aaruni@gmail.com",
    trackingUrl: `${window.location.origin}${window.location.pathname.replace(/index\.html$/, "")}track-order.html?order_id=${encodeURIComponent(orderId)}`,
    statusHistory: [
      {
        status: "Confirmed",
        at: createdAt.toISOString(),
      },
    ],
  };
}

function loadOrders() {
  try {
    const savedOrders = JSON.parse(window.localStorage.getItem(AARUNI_ORDER_STORAGE_KEY));
    return Array.isArray(savedOrders) ? savedOrders : [];
  } catch (error) {
    return [];
  }
}

function saveOrders(orders) {
  window.localStorage.setItem(AARUNI_ORDER_STORAGE_KEY, JSON.stringify(orders));
}

function saveOrder(order) {
  const orders = loadOrders().filter((entry) => entry.id !== order.id);
  const updatedOrders = [order, ...orders].slice(0, 50);
  saveOrders(updatedOrders);
  window.localStorage.setItem(AARUNI_LAST_ORDER_KEY, order.id);
  return updatedOrders;
}

function getOrderById(orderId) {
  return loadOrders().find((order) => order.id === orderId) || null;
}

function getLastOrder() {
  const lastOrderId = window.localStorage.getItem(AARUNI_LAST_ORDER_KEY);
  return lastOrderId ? getOrderById(lastOrderId) : loadOrders()[0] || null;
}

function updateOrderStatus(orderId, status) {
  if (!AARUNI_ORDER_STATUSES.includes(status)) {
    return null;
  }

  const orders = loadOrders();
  const order = orders.find((entry) => entry.id === orderId);

  if (!order) {
    return null;
  }

  order.status = status;
  order.statusHistory = Array.isArray(order.statusHistory) ? order.statusHistory : [];
  order.statusHistory.push({ status, at: new Date().toISOString() });
  saveOrders(orders);
  return order;
}

function getTrackingSteps(order) {
  const currentIndex = Math.max(0, AARUNI_ORDER_STATUSES.indexOf(order.status));
  const history = Array.isArray(order.statusHistory) ? order.statusHistory : [];

  return AARUNI_ORDER_STATUSES.map((status, index) => {
    const historyEntry = history.find((entry) => entry.status === status);

    return {
      status,
      active: index <= currentIndex,
      date: historyEntry ? formatOrderDate(historyEntry.at) : "",
    };
  });
}

function buildInvoiceText(order) {
  const itemLines = order.items
    .map((item) => `${item.name} | Qty ${item.quantity} | ${formatOrderPrice(item.lineTotal)}`)
    .join("\n");

  return [
    "Aaruni Tech Invoice",
    `Invoice: ${order.invoiceNumber}`,
    `Order ID: ${order.id}`,
    `Date: ${order.orderDate}`,
    `Customer: ${order.buyer.name}`,
    `Phone: ${order.buyer.phone || "not provided"}`,
    `Email: ${order.buyer.email || "not provided"}`,
    `Address: ${order.buyer.address || "not provided"}`,
    "",
    "Items",
    itemLines,
    "",
    `Total: ${formatOrderPrice(order.totalAmount)}`,
    `Payment ID: ${order.payment.id}`,
    `Status: ${order.status}`,
    `Support: ${order.supportEmail}`,
  ].join("\n");
}

function downloadInvoice(orderOrId) {
  const order = typeof orderOrId === "string" ? getOrderById(orderOrId) : orderOrId;

  if (!order) {
    return;
  }

  const invoiceBlob = new Blob([buildInvoiceText(order)], { type: "text/plain" });
  const invoiceLink = document.createElement("a");
  invoiceLink.href = URL.createObjectURL(invoiceBlob);
  invoiceLink.download = `${order.invoiceNumber}.txt`;
  document.body.appendChild(invoiceLink);
  invoiceLink.click();
  URL.revokeObjectURL(invoiceLink.href);
  invoiceLink.remove();
}

function createOrderHistoryModal() {
  let modal = document.querySelector("#orderHistoryModal");

  if (modal) {
    return modal;
  }

  modal = document.createElement("section");
  modal.className = "order-history-modal";
  modal.id = "orderHistoryModal";
  modal.hidden = true;
  modal.innerHTML = `
    <div class="order-history-card">
      <div class="order-history-header">
        <div>
          <p class="section-kicker">Orders</p>
          <h2>Order History</h2>
        </div>
        <button type="button" data-order-history-close aria-label="Close order history">&times;</button>
      </div>
      <div class="order-history-list" data-order-history-list></div>
    </div>
  `;
  document.body.appendChild(modal);

  modal.querySelector("[data-order-history-close]").addEventListener("click", () => {
    modal.hidden = true;
  });

  modal.addEventListener("click", (event) => {
    if (event.target === modal) {
      modal.hidden = true;
    }

    const invoiceButton = event.target.closest("[data-order-invoice]");

    if (invoiceButton) {
      downloadInvoice(invoiceButton.dataset.orderInvoice);
    }
  });

  return modal;
}

function renderOrderHistoryList(modal) {
  const orders = loadOrders();
  const list = modal.querySelector("[data-order-history-list]");

  if (orders.length === 0) {
    list.innerHTML = `<div class="cart-empty">No orders are saved in this browser yet.</div>`;
    return;
  }

  list.innerHTML = orders
    .map((order) => `
      <article class="order-history-item">
        <div>
          <strong>${order.id}</strong>
          <span>${order.orderDate} - ${order.status}</span>
        </div>
        <p>${order.items.map((item) => `${item.name} x ${item.quantity}`).join(", ")}</p>
        <div class="order-history-actions">
          <span>${formatOrderPrice(order.totalAmount)}</span>
          <a class="secondary-button" href="track-order.html?order_id=${encodeURIComponent(order.id)}">Track</a>
          <button class="primary-button" type="button" data-order-invoice="${order.id}">Invoice</button>
        </div>
      </article>
    `)
    .join("");
}

function openOrderHistoryModal() {
  const modal = createOrderHistoryModal();
  renderOrderHistoryList(modal);
  modal.hidden = false;
}

function attachOrderHistoryControls() {
  const signupForm = document.querySelector("#accountSignupForm");

  if (!signupForm || document.querySelector("#orderHistoryButton")) {
    return;
  }

  const orderPanel = document.createElement("div");
  orderPanel.className = "order-history-entry";
  orderPanel.innerHTML = `
    <div>
      <strong>Orders saved on this device</strong>
      <p>Track recent orders and download a simple invoice.</p>
    </div>
    <button class="secondary-button" id="orderHistoryButton" type="button">View Orders</button>
  `;
  signupForm.insertAdjacentElement("afterend", orderPanel);

  orderPanel.querySelector("#orderHistoryButton").addEventListener("click", openOrderHistoryModal);
}

function renderTrackingPage(containerId) {
  const container = document.querySelector(`#${containerId}`);

  if (!container) {
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const order = getOrderById(params.get("order_id")) || getLastOrder();

  if (!order) {
    container.innerHTML = `
      <article class="info-card">
        <h2>Order not found</h2>
        <p>This browser does not have a saved order for that tracking link.</p>
        <a class="primary-link tracking-action" href="index.html#products">Shop Products</a>
      </article>
    `;
    return;
  }

  container.innerHTML = `
    <article class="tracking-card">
      <p class="section-kicker">Tracking</p>
      <h1>${order.id}</h1>
      <p>Estimated delivery: ${order.estimatedDeliveryDate}</p>
      <div class="tracking-summary">
        <div><span>Status</span><strong>${order.status}</strong></div>
        <div><span>Total</span><strong>${formatOrderPrice(order.totalAmount)}</strong></div>
        <div><span>Payment</span><strong>${order.payment.id}</strong></div>
      </div>
      <div class="tracking-timeline">
        ${getTrackingSteps(order).map((step) => `
          <div class="tracking-step ${step.active ? "active" : ""}">
            <span></span>
            <div>
              <strong>${step.status}</strong>
              <small>${step.date || "Pending"}</small>
            </div>
          </div>
        `).join("")}
      </div>
      <div class="tracking-items">
        <h2>Items</h2>
        ${order.items.map((item) => `
          <div>
            <span>${item.name} x ${item.quantity}</span>
            <strong>${formatOrderPrice(item.lineTotal)}</strong>
          </div>
        `).join("")}
      </div>
      <button class="primary-button tracking-action" type="button" data-tracking-invoice>Download Invoice</button>
    </article>
  `;

  container.querySelector("[data-tracking-invoice]").addEventListener("click", () => {
    downloadInvoice(order);
  });
}

document.addEventListener("DOMContentLoaded", attachOrderHistoryControls);

window.AaruniOrders = {
  createOrder,
  saveOrder,
  loadOrders,
  getOrderById,
  getLastOrder,
  updateOrderStatus,
  getTrackingSteps,
  downloadInvoice,
  openOrderHistoryModal,
  renderTrackingPage,
  formatOrderPrice,
  formatOrderDate,
};
