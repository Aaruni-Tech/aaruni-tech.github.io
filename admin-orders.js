import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = window.SUPABASE_URL;
const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY;

function isConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatMoney(value) {
  return `₹${Number(value || 0).toLocaleString("en-IN")}`;
}

function formatProducts(order) {
  if (order.product_name) {
    return `${order.product_name} × ${order.quantity || 1}`;
  }

  if (Array.isArray(order.products)) {
    return order.products
      .map((item) => `${item.name || item.product_name || item.product_id || "Product"} × ${item.quantity || 1}`)
      .join(", ");
  }

  return "Products unavailable";
}

async function render() {
  const container = document.querySelector("#adminOrders");
  if (!container) {
    return;
  }

  if (!isConfigured()) {
    container.innerHTML = `<article class="info-card"><h2>Supabase not configured</h2><p>Set values in <code>supabase-config.js</code>.</p></article>`;
    return;
  }

  container.innerHTML = `<article class="info-card"><h2>Loading orders…</h2><p>Please wait.</p></article>`;

  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  try {
    // NOTE: With the starter SQL, anon cannot read orders by default.
    let { data, error } = await client
      .from("orders")
      .select("id, created_at, customer_name, customer_email, product_name, quantity, total_price, total_amount, products, order_status")
      .order("created_at", { ascending: false })
      .limit(50);

    if (error && (error.code === "42703" || error.code === "PGRST204")) {
      const compactResult = await client
        .from("orders")
        .select("id, created_at, customer_name, customer_email, total_amount, products, order_status")
        .order("created_at", { ascending: false })
        .limit(50);
      data = compactResult.data;
      error = compactResult.error;
    }

    if (error) {
      container.innerHTML = `
        <article class="info-card">
          <h2>Orders are protected</h2>
          <p>${escapeHtml(error.message || "Reading orders is blocked by RLS policies.")}</p>
          <p>For a real admin dashboard, fetch orders from a server/Edge Function using the service role key, or use Supabase Auth with admin-only policies.</p>
        </article>
      `;
      return;
    }

    const orders = Array.isArray(data) ? data : [];

    if (!orders.length) {
      container.innerHTML = `<article class="info-card"><h2>No orders yet</h2><p>Orders will appear here after checkout.</p></article>`;
      return;
    }

    container.innerHTML = `
      <div class="orders-grid">
        ${orders
          .map(
            (order) => `
          <article class="order-card">
            <div class="order-card-top">
              <div class="order-card-meta">
                <strong>${escapeHtml(order.id)}</strong>
                <span>${escapeHtml(new Date(order.created_at).toLocaleString("en-IN"))}</span>
              </div>
              <span class="order-status-badge">${escapeHtml(order.order_status)}</span>
            </div>
            <p class="order-card-items">${escapeHtml(formatProducts(order))}</p>
            <div class="order-card-bottom">
              <div class="order-card-total">
                <span>Total</span>
                <strong>${formatMoney(order.total_price ?? order.total_amount)}</strong>
              </div>
              <div style="text-align:right;color:#667085;font-size:0.9rem;font-weight:700;">
                <div>${escapeHtml(order.customer_name)}</div>
                <div>${escapeHtml(order.customer_email || "")}</div>
              </div>
            </div>
          </article>
        `
          )
          .join("")}
      </div>
    `;
  } catch (error) {
    container.innerHTML = `<article class="info-card"><h2>Failed to load</h2><p>${escapeHtml(error.message || "Unexpected error")}</p></article>`;
  }
}

document.addEventListener("DOMContentLoaded", render);
