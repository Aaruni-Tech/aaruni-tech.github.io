const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ADMIN_RECIPIENT_EMAIL = Deno.env.get("ORDER_NOTIFICATION_TO_EMAIL") || "tech.aaruni@gmail.com";
const SUPPORT_EMAIL = "tech.aaruni@gmail.com";
const RESEND_API_URL = "https://api.resend.com/emails";
const SENDING_STALE_AFTER_MS = 10 * 60 * 1000;

type EmailType = "admin" | "customer";

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

type EmailContent = {
  subject: string;
  text: string;
  html: string;
};

type EmailResult = {
  type: EmailType;
  status: "sent" | "duplicate" | "skipped" | "failed";
  recipient: string;
  providerMessageId?: string;
  error?: string;
  reason?: string;
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
  return `₹${cleanNumber(amount).toLocaleString("en-IN")}`;
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

function isUsableEmail(value: string) {
  return Boolean(value && value !== "not provided" && value.includes("@"));
}

function normalizeProducts(products: unknown, fallbackItems: unknown, fallbackProductName: unknown, fallbackQuantity: unknown, fallbackTotal: unknown): OrderItem[] {
  const source = Array.isArray(products)
    ? products
    : Array.isArray(fallbackItems)
      ? fallbackItems
      : [];

  const items = source
    .map((item) => {
      const entry = item && typeof item === "object" ? item as Record<string, unknown> : {};
      const quantity = cleanNumber(entry.quantity, 0);
      const lineTotal = cleanNumber(entry.line_total ?? entry.lineTotal, 0);
      const price = cleanNumber(entry.price, quantity > 0 ? lineTotal / quantity : 0);

      return {
        name: cleanText(entry.name || entry.product_name || entry.product_id || entry.id, "Product"),
        quantity,
        price,
        lineTotal: lineTotal || price * quantity,
      };
    })
    .filter((item) => item.name && item.quantity > 0);

  if (items.length) {
    return items;
  }

  const productName = cleanText(fallbackProductName);
  if (!productName) {
    return [];
  }

  const quantity = cleanNumber(fallbackQuantity, 1);
  const total = cleanNumber(fallbackTotal, 0);

  return [{
    name: productName,
    quantity,
    price: quantity > 0 ? total / quantity : total,
    lineTotal: total,
  }];
}

function normalizeOrder(row: Record<string, unknown>, requestOrder: Record<string, unknown>): NormalizedOrder {
  const customer = requestOrder.customer && typeof requestOrder.customer === "object"
    ? requestOrder.customer as Record<string, unknown>
    : {};
  const payment = requestOrder.payment && typeof requestOrder.payment === "object"
    ? requestOrder.payment as Record<string, unknown>
    : {};
  const totalAmount = cleanNumber(
    row.total_amount,
    cleanNumber(row.total_price, cleanNumber(requestOrder.total_amount, 0)),
  );
  const items = normalizeProducts(row.products, requestOrder.items, row.product_name, row.quantity, totalAmount);
  const totalQuantity = cleanNumber(
    requestOrder.total_quantity,
    cleanNumber(row.quantity, items.reduce((sum, item) => sum + item.quantity, 0)),
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
    totalAmount: totalAmount || items.reduce((sum, item) => sum + item.lineTotal, 0),
    placedOn: formatPlacedOn(row.created_at || requestOrder.created_at),
  };
}

function buildProductTextLines(order: NormalizedOrder) {
  return order.items.length
    ? order.items.map((item) => `- ${item.name} x ${item.quantity} @ ${formatMoney(item.price)} = ${formatMoney(item.lineTotal)}`)
    : ["- No products found"];
}

function buildProductRows(order: NormalizedOrder) {
  return order.items.length
    ? order.items.map((item) => `
      <tr>
        <td style="padding:12px 10px;border-bottom:1px solid #e5e7eb;">${escapeHtml(item.name)}</td>
        <td style="padding:12px 10px;border-bottom:1px solid #e5e7eb;text-align:center;">${escapeHtml(item.quantity)}</td>
        <td style="padding:12px 10px;border-bottom:1px solid #e5e7eb;text-align:right;">${escapeHtml(formatMoney(item.price))}</td>
        <td style="padding:12px 10px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:700;">${escapeHtml(formatMoney(item.lineTotal))}</td>
      </tr>
    `).join("")
    : `<tr><td colspan="4" style="padding:12px 10px;border-bottom:1px solid #e5e7eb;">No products found</td></tr>`;
}

function buildAdminEmailContent(order: NormalizedOrder): EmailContent {
  const productLines = buildProductTextLines(order);
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
    "Payment Status: Paid",
    "",
    "Shipping Address:",
    order.shippingAddress,
    "",
    `Payment ID: ${order.paymentId}`,
    `Order ID: ${order.orderId}`,
    `Placed On: ${order.placedOn}`,
  ].join("\n");

  const html = `
    <div style="margin:0;background:#f6f7f9;padding:24px;font-family:Arial,sans-serif;color:#111827;">
      <div style="max-width:720px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;">
        <div style="background:#0b2a3d;color:#ffffff;padding:22px 24px;">
          <h1 style="margin:0;font-size:22px;">Aaruni Tech</h1>
          <p style="margin:8px 0 0;color:#f3f4f6;">New paid order received</p>
        </div>
        <div style="padding:24px;">
          <p><strong>Order ID:</strong> ${escapeHtml(order.orderId)}</p>
          <p><strong>Payment ID:</strong> ${escapeHtml(order.paymentId)}</p>
          <p><strong>Payment Status:</strong> Paid</p>
          <p><strong>Placed On:</strong> ${escapeHtml(order.placedOn)}</p>
          <hr style="border:0;border-top:1px solid #e5e7eb;margin:18px 0;" />
          <p><strong>Customer Name:</strong> ${escapeHtml(order.customerName)}</p>
          <p><strong>Customer Email:</strong> ${escapeHtml(order.customerEmail)}</p>
          <p><strong>Customer Phone:</strong> ${escapeHtml(order.customerPhone)}</p>
          <p><strong>Shipping Address:</strong><br>${escapeHtml(order.shippingAddress)}</p>
          <h2 style="margin:22px 0 10px;font-size:18px;">Products</h2>
          <table style="border-collapse:collapse;width:100%;">
            <thead>
              <tr>
                <th style="padding:10px;border-bottom:1px solid #d1d5db;text-align:left;">Product</th>
                <th style="padding:10px;border-bottom:1px solid #d1d5db;text-align:center;">Qty</th>
                <th style="padding:10px;border-bottom:1px solid #d1d5db;text-align:right;">Price</th>
                <th style="padding:10px;border-bottom:1px solid #d1d5db;text-align:right;">Line total</th>
              </tr>
            </thead>
            <tbody>${buildProductRows(order)}</tbody>
          </table>
          <p style="font-size:18px;"><strong>Total Amount:</strong> ${escapeHtml(formatMoney(order.totalAmount))}</p>
        </div>
      </div>
    </div>
  `;

  return { subject, text, html };
}

function buildCustomerEmailContent(order: NormalizedOrder): EmailContent {
  const productLines = buildProductTextLines(order);
  const subject = "Your Aaruni Tech Order is Confirmed";
  const text = [
    `Hello ${order.customerName},`,
    "",
    "Thank you for shopping with Aaruni Tech.",
    "Your order has been confirmed successfully.",
    "",
    "Order Details:",
    `Order ID: ${order.orderId}`,
    "Products:",
    ...productLines,
    `Quantity: ${order.totalQuantity}`,
    `Total Amount: ${formatMoney(order.totalAmount)}`,
    "Payment Status: Paid",
    "",
    "We will process your order shortly.",
    "",
    `Support: ${SUPPORT_EMAIL}`,
    "",
    "Thank you,",
    "Aaruni Tech",
  ].join("\n");

  const html = `
    <div style="margin:0;background:#f6f7f9;padding:24px;font-family:Arial,sans-serif;color:#111827;">
      <div style="max-width:680px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;">
        <div style="background:#0b2a3d;color:#ffffff;padding:24px;">
          <h1 style="margin:0;font-size:24px;">Aaruni Tech</h1>
          <p style="margin:8px 0 0;color:#f3f4f6;">Smart shopping, better living</p>
        </div>
        <div style="padding:26px 24px;">
          <h2 style="margin:0 0 12px;font-size:22px;color:#111827;">Your order is confirmed</h2>
          <p style="margin:0 0 14px;">Hello ${escapeHtml(order.customerName)},</p>
          <p style="margin:0 0 16px;">Thank you for shopping with Aaruni Tech. Your order has been confirmed successfully.</p>
          <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:16px;margin:18px 0;">
            <p style="margin:0 0 8px;"><strong>Order ID:</strong> ${escapeHtml(order.orderId)}</p>
            <p style="margin:0;"><strong>Payment Status:</strong> Paid</p>
          </div>
          <h3 style="margin:22px 0 10px;font-size:16px;">Order Details</h3>
          <table style="border-collapse:collapse;width:100%;">
            <thead>
              <tr>
                <th style="padding:10px;border-bottom:1px solid #d1d5db;text-align:left;">Product</th>
                <th style="padding:10px;border-bottom:1px solid #d1d5db;text-align:center;">Qty</th>
                <th style="padding:10px;border-bottom:1px solid #d1d5db;text-align:right;">Price</th>
                <th style="padding:10px;border-bottom:1px solid #d1d5db;text-align:right;">Line total</th>
              </tr>
            </thead>
            <tbody>${buildProductRows(order)}</tbody>
          </table>
          <p style="font-size:18px;margin:18px 0;"><strong>Total Amount:</strong> ${escapeHtml(formatMoney(order.totalAmount))}</p>
          <p style="margin:16px 0;">We will process your order shortly.</p>
          <p style="margin:16px 0;">Need help? Contact <a href="mailto:${SUPPORT_EMAIL}" style="color:#c51d63;text-decoration:none;font-weight:700;">${SUPPORT_EMAIL}</a>.</p>
          <p style="margin:24px 0 0;">Thank you,<br><strong>Aaruni Tech</strong></p>
        </div>
      </div>
    </div>
  `;

  return { subject, text, html };
}

function buildIdempotencyKey(orderId: string, paymentId: string, emailType: EmailType) {
  return `order:${orderId}:payment:${paymentId}:email:${emailType}`
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

function isMissingColumnResponse(text: string, columnName: string) {
  const normalized = text.toLowerCase();
  return normalized.includes(columnName.toLowerCase()) &&
    (normalized.includes("column") || normalized.includes("schema cache") || normalized.includes("pgrst204"));
}

async function fetchSavedOrder(supabaseUrl: string, serviceRoleKey: string, orderId: string, paymentId: string) {
  const url = new URL(`${supabaseUrl}/rest/v1/orders`);
  url.searchParams.set("select", "order_id,payment_id,customer_name,customer_email,phone,product_name,quantity,total_price,total_amount,products,shipping_address,created_at");
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

async function fetchNotificationStatus(supabaseUrl: string, serviceRoleKey: string, idempotencyKey: string) {
  const url = new URL(`${supabaseUrl}/rest/v1/order_email_notifications`);
  url.searchParams.set("select", "status,updated_at,provider_message_id,error");
  url.searchParams.set("idempotency_key", `eq.${idempotencyKey}`);
  url.searchParams.set("limit", "1");

  const response = await fetch(url, {
    headers: getServiceHeaders(serviceRoleKey),
  });
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`Notification lookup failed: ${text || response.status}`);
  }

  const rows = text ? JSON.parse(text) : [];
  return Array.isArray(rows) ? rows[0] as Record<string, unknown> | undefined : undefined;
}

async function updateNotificationStatus(
  supabaseUrl: string,
  serviceRoleKey: string,
  idempotencyKey: string,
  payload: Record<string, unknown>,
) {
  const url = new URL(`${supabaseUrl}/rest/v1/order_email_notifications`);
  url.searchParams.set("idempotency_key", `eq.${idempotencyKey}`);
  const body = {
    ...payload,
    updated_at: new Date().toISOString(),
  };

  const sendPatch = async (patchBody: Record<string, unknown>) => {
    const response = await fetch(url, {
      method: "PATCH",
      headers: getServiceHeaders(serviceRoleKey),
      body: JSON.stringify(patchBody),
    });
    return { response, text: await response.text() };
  };

  let result = await sendPatch(body);

  if (!result.response.ok && "sent_at" in body && isMissingColumnResponse(result.text, "sent_at")) {
    const { sent_at: _sentAt, ...fallbackBody } = body;
    result = await sendPatch(fallbackBody);
  }

  if (!result.response.ok) {
    throw new Error(`Notification status update failed: ${result.text || result.response.status}`);
  }
}

async function createNotificationLock(
  supabaseUrl: string,
  serviceRoleKey: string,
  idempotencyKey: string,
  emailType: EmailType,
  recipientEmail: string,
  order: NormalizedOrder,
) {
  const insertPayload = {
    idempotency_key: idempotencyKey,
    email_type: emailType,
    order_id: order.orderId,
    payment_id: order.paymentId,
    recipient_email: recipientEmail,
    provider: "resend",
    status: "sending",
    error: null,
  };

  const sendInsert = async (payload: Record<string, unknown>) => {
    const response = await fetch(`${supabaseUrl}/rest/v1/order_email_notifications`, {
      method: "POST",
      headers: {
        ...getServiceHeaders(serviceRoleKey),
        Prefer: "return=representation",
      },
      body: JSON.stringify(payload),
    });
    return { response, text: await response.text() };
  };

  let result = await sendInsert(insertPayload);

  if (!result.response.ok && isMissingColumnResponse(result.text, "email_type")) {
    const { email_type: _emailType, ...fallbackPayload } = insertPayload;
    result = await sendInsert(fallbackPayload);
  }

  if (result.response.ok) {
    return { locked: true };
  }

  if (!(result.response.status === 409 || result.text.includes("duplicate key") || result.text.includes("23505"))) {
    throw new Error(`Notification lock failed: ${result.text || result.response.status}`);
  }

  const existing = await fetchNotificationStatus(supabaseUrl, serviceRoleKey, idempotencyKey);
  const status = cleanText(existing && existing.status);
  const updatedAt = existing && existing.updated_at ? new Date(String(existing.updated_at)).getTime() : 0;
  const isStaleSending = status === "sending" && (!updatedAt || Date.now() - updatedAt > SENDING_STALE_AFTER_MS);

  if (status === "sent") {
    return {
      locked: false,
      duplicate: true,
      providerMessageId: cleanText(existing && existing.provider_message_id),
    };
  }

  if (status === "failed" || isStaleSending) {
    await updateNotificationStatus(supabaseUrl, serviceRoleKey, idempotencyKey, {
      status: "sending",
      error: null,
      sent_at: null,
    });
    return { locked: true, retry: true };
  }

  return {
    locked: false,
    duplicate: true,
    reason: status === "sending" ? "send_already_in_progress" : "notification_already_exists",
  };
}

async function markCustomerEmailSent(supabaseUrl: string, serviceRoleKey: string, order: NormalizedOrder, sentAt: string) {
  const url = new URL(`${supabaseUrl}/rest/v1/orders`);
  url.searchParams.set("order_id", `eq.${order.orderId}`);
  url.searchParams.set("payment_id", `eq.${order.paymentId}`);

  const response = await fetch(url, {
    method: "PATCH",
    headers: getServiceHeaders(serviceRoleKey),
    body: JSON.stringify({
      customer_email_sent: true,
      customer_email_sent_at: sentAt,
    }),
  });
  const text = await response.text();

  if (!response.ok && !isMissingColumnResponse(text, "customer_email_sent")) {
    console.error("[Email] Customer email sent flag update failed", text || response.status);
  }
}

async function sendWithResend(content: EmailContent, recipientEmail: string, idempotencyKey: string, order: NormalizedOrder, emailType: EmailType) {
  const resendApiKey = getRequiredEnv("RESEND_API_KEY");
  const fromEmail = getRequiredEnv("RESEND_FROM_EMAIL");
  const response = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [recipientEmail],
      subject: content.subject,
      text: content.text,
      html: content.html,
      tags: [
        { name: "order_id", value: order.orderId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 256) },
        { name: "email_type", value: emailType },
      ],
    }),
  });
  const responseText = await response.text();

  if (!response.ok) {
    throw new Error(`Resend send failed: ${responseText || response.status}`);
  }

  return responseText ? JSON.parse(responseText) as Record<string, unknown> : {};
}

async function sendEmailJob(supabaseUrl: string, serviceRoleKey: string, order: NormalizedOrder, emailType: EmailType): Promise<EmailResult> {
  const recipientEmail = emailType === "admin" ? ADMIN_RECIPIENT_EMAIL : order.customerEmail;

  if (emailType === "customer" && !isUsableEmail(recipientEmail)) {
    return {
      type: emailType,
      status: "skipped",
      recipient: recipientEmail,
      reason: "missing_customer_email",
    };
  }

  const idempotencyKey = buildIdempotencyKey(order.orderId, order.paymentId, emailType);

  try {
    const lock = await createNotificationLock(supabaseUrl, serviceRoleKey, idempotencyKey, emailType, recipientEmail, order);

    if (!lock.locked) {
      return {
        type: emailType,
        status: "duplicate",
        recipient: recipientEmail,
        providerMessageId: cleanText((lock as Record<string, unknown>).providerMessageId),
        reason: cleanText((lock as Record<string, unknown>).reason),
      };
    }

    const content = emailType === "admin"
      ? buildAdminEmailContent(order)
      : buildCustomerEmailContent(order);
    const resendResponse = await sendWithResend(content, recipientEmail, idempotencyKey, order, emailType);
    const sentAt = new Date().toISOString();
    const providerMessageId = cleanText(resendResponse.id);

    await updateNotificationStatus(supabaseUrl, serviceRoleKey, idempotencyKey, {
      status: "sent",
      provider_message_id: providerMessageId,
      error: null,
      sent_at: sentAt,
    });

    if (emailType === "customer") {
      await markCustomerEmailSent(supabaseUrl, serviceRoleKey, order, sentAt);
      console.log("[Email] Customer confirmation sent", { orderId: order.orderId, to: recipientEmail });
    } else {
      console.log("[Email] Admin email sent", { orderId: order.orderId, to: recipientEmail });
    }

    return {
      type: emailType,
      status: "sent",
      recipient: recipientEmail,
      providerMessageId,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    try {
      await updateNotificationStatus(supabaseUrl, serviceRoleKey, idempotencyKey, {
        status: "failed",
        error: message.slice(0, 1000),
      });
    } catch (statusError) {
      console.error("[Email] Failed to update failed email status", statusError);
    }

    console.error(`[Email] ${emailType} email failed`, message);
    return {
      type: emailType,
      status: "failed",
      recipient: recipientEmail,
      error: message,
    };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);
  }

  try {
    const supabaseUrl = getRequiredEnv("SUPABASE_URL").replace(/\/+$/, "");
    const serviceRoleKey = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");
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
    const emailResults = [
      await sendEmailJob(supabaseUrl, serviceRoleKey, order, "admin"),
      await sendEmailJob(supabaseUrl, serviceRoleKey, order, "customer"),
    ];
    const complete = emailResults.every((result) => result.status === "sent" || result.status === "duplicate");
    const adminEmailSent = emailResults.some((result) => result.type === "admin" && (result.status === "sent" || result.status === "duplicate"));
    const customerEmailSent = emailResults.some((result) => result.type === "customer" && (result.status === "sent" || result.status === "duplicate"));

    return jsonResponse({
      ok: true,
      complete,
      orderId: order.orderId,
      provider: "resend",
      adminEmailSent,
      customerEmailSent,
      emails: emailResults,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Email] send-order-notification failed", message);
    return jsonResponse({ ok: false, error: message }, 500);
  }
});
