const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const RECIPIENT_EMAIL = Deno.env.get("ORDER_NOTIFICATION_TO_EMAIL") || "tech.aaruni@gmail.com";
const RESEND_API_URL = "https://api.resend.com/emails";

type OrderItem = {
  name: string;
  quantity: number;
  price: number;
  lineTotal: number;
};

type NormalizedOrder = {
  orderId: string;
  paymentId: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  shippingAddress: string;
  items: OrderItem[];
  totalQuantity: number;
  totalAmount: number;
  placedOn: string;
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function getRequiredEnv(name: string) {
  const value = Deno.env.get(name);

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function cleanText(value: unknown, fallback = "") {
  return String(value || fallback).trim();
}

function cleanNumber(value: unknown, fallback = 0) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function escapeHtml(value: unknown) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatMoney(amount: unknown) {
  return `Rs. ${cleanNumber(amount).toLocaleString("en-IN")}`;
}

function formatPlacedOn(value: unknown) {
  const date = value ? new Date(String(value)) : new Date();
  const parts = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(Number.isNaN(date.getTime()) ? new Date() : date);
  const lookup = new Map(parts.map((part) => [part.type, part.value]));

  return `${lookup.get("year")}-${lookup.get("month")}-${lookup.get("day")} ${lookup.get("hour")}:${lookup.get("minute")} ${lookup.get("dayPeriod") || ""}`.trim();
}

function normalizeProducts(products: unknown, fallbackItems: unknown): OrderItem[] {
  const source = Array.isArray(products)
    ? products
    : Array.isArray(fallbackItems)
      ? fallbackItems
      : [];

  return source
    .map((item) => {
      const entry = item && typeof item === "object" ? item as Record<string, unknown> : {};
      const quantity = cleanNumber(entry.quantity, 0);
      const price = cleanNumber(entry.price, 0);
      const lineTotal = cleanNumber(entry.line_total ?? entry.lineTotal, price * quantity);

      return {
        name: cleanText(entry.name || entry.product_name || entry.product_id || entry.id, "Product"),
        quantity,
        price,
        lineTotal,
      };
    })
    .filter((item) => item.name && item.quantity > 0);
}

function normalizeOrder(row: Record<string, unknown>, requestOrder: Record<string, unknown>): NormalizedOrder {
  const customer = requestOrder.customer && typeof requestOrder.customer === "object"
    ? requestOrder.customer as Record<string, unknown>
    : {};
  const payment = requestOrder.payment && typeof requestOrder.payment === "object"
    ? requestOrder.payment as Record<string, unknown>
    : {};
  const items = normalizeProducts(row.products, requestOrder.items);
  const totalQuantity = cleanNumber(
    requestOrder.total_quantity,
    cleanNumber(row.quantity, items.reduce((sum, item) => sum + item.quantity, 0)),
  );
  const totalAmount = cleanNumber(
    row.total_amount,
    cleanNumber(row.total_price, cleanNumber(requestOrder.total_amount, items.reduce((sum, item) => sum + item.lineTotal, 0))),
  );

  return {
    orderId: cleanText(row.order_id || requestOrder.id),
    paymentId: cleanText(row.payment_id || payment.id),
    customerName: cleanText(row.customer_name || customer.name, "Customer"),
    customerEmail: cleanText(row.customer_email || customer.email, "not provided"),
    customerPhone: cleanText(row.phone || customer.phone, "not provided"),
    shippingAddress: cleanText(row.shipping_address || customer.shipping_address, "not provided"),
    items,
    totalQuantity,
    totalAmount,
    placedOn: formatPlacedOn(row.created_at || requestOrder.created_at),
  };
}

function buildEmailContent(order: NormalizedOrder) {
  const productLines = order.items.length
    ? order.items.map((item) => `- ${item.name} x ${item.quantity} = ${formatMoney(item.lineTotal)}`)
    : ["- No products found"];
  const escapedProductRows = order.items.length
    ? order.items.map((item) => `
      <tr>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;">${escapeHtml(item.name)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;text-align:center;">${escapeHtml(item.quantity)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;text-align:right;">${escapeHtml(formatMoney(item.lineTotal))}</td>
      </tr>
    `).join("")
    : `<tr><td colspan="3" style="padding:8px 10px;border-bottom:1px solid #e5e7eb;">No products found</td></tr>`;

  const subject = `New Order on Aaruni Tech - ${order.orderId}`;
  const text = [
    `Customer Name: ${order.customerName}`,
    `Customer Email: ${order.customerEmail}`,
    `Customer Phone: ${order.customerPhone}`,
    "",
    "Products:",
    ...productLines,
    "",
    `Quantity: ${order.totalQuantity}`,
    `Total Amount: ${formatMoney(order.totalAmount)}`,
    "",
    "Shipping Address:",
    order.shippingAddress,
    "",
    "Payment ID:",
    order.paymentId,
    "",
    "Order ID:",
    order.orderId,
    "",
    "Placed On:",
    order.placedOn,
  ].join("\n");

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111827;">
      <h2 style="margin:0 0 12px;">New Order on Aaruni Tech</h2>
      <p><strong>Order ID:</strong> ${escapeHtml(order.orderId)}</p>
      <p><strong>Payment ID:</strong> ${escapeHtml(order.paymentId)}</p>
      <p><strong>Placed On:</strong> ${escapeHtml(order.placedOn)}</p>
      <hr style="border:0;border-top:1px solid #e5e7eb;margin:16px 0;" />
      <p><strong>Customer Name:</strong> ${escapeHtml(order.customerName)}</p>
      <p><strong>Customer Email:</strong> ${escapeHtml(order.customerEmail)}</p>
      <p><strong>Customer Phone:</strong> ${escapeHtml(order.customerPhone)}</p>
      <p><strong>Shipping Address:</strong><br>${escapeHtml(order.shippingAddress)}</p>
      <h3 style="margin:18px 0 8px;">Products</h3>
      <table style="border-collapse:collapse;width:100%;max-width:680px;">
        <thead>
          <tr>
            <th style="padding:8px 10px;border-bottom:1px solid #d1d5db;text-align:left;">Product</th>
            <th style="padding:8px 10px;border-bottom:1px solid #d1d5db;text-align:center;">Qty</th>
            <th style="padding:8px 10px;border-bottom:1px solid #d1d5db;text-align:right;">Line total</th>
          </tr>
        </thead>
        <tbody>${escapedProductRows}</tbody>
      </table>
      <p><strong>Total Quantity:</strong> ${escapeHtml(order.totalQuantity)}</p>
      <p><strong>Total Amount:</strong> ${escapeHtml(formatMoney(order.totalAmount))}</p>
    </div>
  `;

  return { subject, text, html };
}

function buildIdempotencyKey(orderId: string, paymentId: string) {
  return `order:${orderId}:payment:${paymentId}`
    .replace(/[\r\n]/g, "")
    .slice(0, 256);
}

function getServiceHeaders(serviceRoleKey: string) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
  };
}

async function fetchSavedOrder(supabaseUrl: string, serviceRoleKey: string, orderId: string, paymentId: string) {
  const url = new URL(`${supabaseUrl}/rest/v1/orders`);
  url.searchParams.set("select", "order_id,payment_id,customer_name,customer_email,phone,products,quantity,total_price,total_amount,shipping_address,created_at");
  url.searchParams.set("order_id", `eq.${orderId}`);
  url.searchParams.set("payment_id", `eq.${paymentId}`);
  url.searchParams.set("limit", "1");

  const response = await fetch(url, {
    headers: getServiceHeaders(serviceRoleKey),
  });
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`Order lookup failed: ${text || response.status}`);
  }

  const rows = text ? JSON.parse(text) : [];
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function createNotificationLock(
  supabaseUrl: string,
  serviceRoleKey: string,
  idempotencyKey: string,
  order: NormalizedOrder,
) {
  const response = await fetch(`${supabaseUrl}/rest/v1/order_email_notifications`, {
    method: "POST",
    headers: {
      ...getServiceHeaders(serviceRoleKey),
      Prefer: "return=representation",
    },
    body: JSON.stringify({
      idempotency_key: idempotencyKey,
      order_id: order.orderId,
      payment_id: order.paymentId,
      recipient_email: RECIPIENT_EMAIL,
      provider: "resend",
      status: "sending",
    }),
  });
  const text = await response.text();

  if (response.ok) {
    return { locked: true };
  }

  if (response.status === 409 || text.includes("duplicate key") || text.includes("23505")) {
    return { locked: false, duplicate: true };
  }

  throw new Error(`Notification lock failed: ${text || response.status}`);
}

async function updateNotificationStatus(
  supabaseUrl: string,
  serviceRoleKey: string,
  idempotencyKey: string,
  payload: Record<string, unknown>,
) {
  const url = new URL(`${supabaseUrl}/rest/v1/order_email_notifications`);
  url.searchParams.set("idempotency_key", `eq.${idempotencyKey}`);

  await fetch(url, {
    method: "PATCH",
    headers: getServiceHeaders(serviceRoleKey),
    body: JSON.stringify({
      ...payload,
      updated_at: new Date().toISOString(),
    }),
  });
}

async function sendWithResend(order: NormalizedOrder, idempotencyKey: string) {
  const resendApiKey = getRequiredEnv("RESEND_API_KEY");
  const fromEmail = getRequiredEnv("RESEND_FROM_EMAIL");
  const { subject, text, html } = buildEmailContent(order);
  const response = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [RECIPIENT_EMAIL],
      subject,
      text,
      html,
      tags: [
        { name: "order_id", value: order.orderId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 256) },
      ],
    }),
  });
  const responseText = await response.text();

  if (!response.ok) {
    throw new Error(`Resend send failed: ${responseText || response.status}`);
  }

  const responseBody = responseText ? JSON.parse(responseText) : {};

  return responseBody;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);
  }

  let supabaseUrl = "";
  let serviceRoleKey = "";
  let idempotencyKey = "";

  try {
    supabaseUrl = getRequiredEnv("SUPABASE_URL").replace(/\/+$/, "");
    serviceRoleKey = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");

    const body = await req.json();
    const requestOrder = body && typeof body.order === "object" ? body.order as Record<string, unknown> : {};
    const requestPayment = requestOrder.payment && typeof requestOrder.payment === "object"
      ? requestOrder.payment as Record<string, unknown>
      : {};
    const orderId = cleanText(requestOrder.id);
    const paymentId = cleanText(requestPayment.id);

    if (!orderId || !paymentId) {
      return jsonResponse({ ok: false, error: "missing_order_or_payment_id" }, 400);
    }

    const savedOrder = await fetchSavedOrder(supabaseUrl, serviceRoleKey, orderId, paymentId);

    if (!savedOrder) {
      return jsonResponse({ ok: false, error: "saved_order_not_found" }, 404);
    }

    const order = normalizeOrder(savedOrder, requestOrder);
    idempotencyKey = buildIdempotencyKey(order.orderId, order.paymentId);
    const lock = await createNotificationLock(supabaseUrl, serviceRoleKey, idempotencyKey, order);

    if (!lock.locked) {
      return jsonResponse({ ok: true, duplicate: true, orderId: order.orderId });
    }

    const resendResponse = await sendWithResend(order, idempotencyKey);
    await updateNotificationStatus(supabaseUrl, serviceRoleKey, idempotencyKey, {
      status: "sent",
      provider_message_id: cleanText((resendResponse as Record<string, unknown>).id),
      error: null,
    });

    return jsonResponse({
      ok: true,
      orderId: order.orderId,
      provider: "resend",
      providerMessageId: cleanText((resendResponse as Record<string, unknown>).id),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (supabaseUrl && serviceRoleKey && idempotencyKey) {
      try {
        await updateNotificationStatus(supabaseUrl, serviceRoleKey, idempotencyKey, {
          status: "failed",
          error: message.slice(0, 1000),
        });
      } catch (statusError) {
        console.error("[OrderEmail] failed to update notification status", statusError);
      }
    }

    console.error("[OrderEmail] send-order-notification failed", message);
    return jsonResponse({ ok: false, error: message }, 500);
  }
});
