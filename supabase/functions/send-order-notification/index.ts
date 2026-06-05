const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ADMIN_RECIPIENT_EMAIL = Deno.env.get("ORDER_NOTIFICATION_TO_EMAIL") || "tech.aaruni@gmail.com";
const SUPPORT_EMAIL = "tech.aaruni@gmail.com";
const RESEND_API_URL = "https://api.resend.com/emails";
const SENDING_STALE_AFTER_MS = 10 * 60 * 1000;
const RESEND_MAX_ATTEMPTS = 3;
const RESEND_RETRY_DELAY_MS = 1200;

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
  environmentMode: "test" | "production";
  sourceTable: "orders" | "test_orders";
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

type RuntimeEmailSettings = {
  resendFromEmail?: string;
  notificationEmail?: string;
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

function normalizeEnvironmentMode(value: unknown): "test" | "production" {
  const raw = cleanText(value).toLowerCase();
  if (raw === "prod" || raw === "live" || raw === "production") {
    return "production";
  }
  return "test";
}

function getSourceTableForMode(mode: "test" | "production"): "orders" | "test_orders" {
  return mode === "test" ? "test_orders" : "orders";
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

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function getErrorStack(error: unknown) {
  return error instanceof Error ? error.stack || "" : "";
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldRetryResend(status: number) {
  return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
}

function extractEmailAddress(value: string) {
  const raw = cleanText(value).toLowerCase();
  const bracketMatch = raw.match(/<([^>]+)>/);
  return cleanText(bracketMatch ? bracketMatch[1] : raw).toLowerCase();
}

function isResendTestingSender(value: string) {
  return extractEmailAddress(value) === "onboarding@resend.dev";
}

function parseJsonObject(text: string) {
  if (!text) {
    return null;
  }

  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : null;
  } catch (error) {
    return null;
  }
}

function summarizeResendResponse(text: string) {
  const parsed = parseJsonObject(text);

  if (parsed) {
    return {
      id: cleanText(parsed.id),
      name: cleanText(parsed.name),
      message: cleanText(parsed.message),
      error: cleanText(parsed.error),
      statusCode: cleanText(parsed.statusCode),
    };
  }

  return text ? text.slice(0, 1000) : "";
}

function getEmailRuntimeConfig(settings: RuntimeEmailSettings = {}) {
  const resendApiKey = Deno.env.get("RESEND_API_KEY") || "";
  const fromEmail = cleanText(settings.resendFromEmail || Deno.env.get("RESEND_FROM_EMAIL"));
  const adminRecipientEmail = cleanText(settings.notificationEmail || ADMIN_RECIPIENT_EMAIL);

  if (!resendApiKey) {
    throw new Error("Missing required environment variable: RESEND_API_KEY");
  }

  if (!fromEmail) {
    throw new Error("Missing required environment variable: RESEND_FROM_EMAIL");
  }

  return {
    resendApiKey,
    fromEmail,
    adminRecipientEmail,
    orderRecipientEnvPresent: Boolean(Deno.env.get("ORDER_NOTIFICATION_TO_EMAIL")),
    usingResendTestingSender: isResendTestingSender(fromEmail),
  };
}

async function fetchRuntimeEmailSettings(supabaseUrl: string, serviceRoleKey: string): Promise<RuntimeEmailSettings> {
  if (!supabaseUrl || !serviceRoleKey) {
    return {};
  }

  const url = new URL(`${supabaseUrl}/rest/v1/app_settings`);
  url.searchParams.set("select", "resend_from_email,notification_email");
  url.searchParams.set("id", "eq.global");
  url.searchParams.set("limit", "1");

  try {
    const response = await fetch(url, { headers: getServiceHeaders(serviceRoleKey) });
    const text = await response.text();

    if (!response.ok) {
      console.warn("[Email] app_settings email config unavailable", {
        status: response.status,
        body: text.slice(0, 500),
      });
      return {};
    }

    const rows = text ? JSON.parse(text) : [];
    const row = Array.isArray(rows) && rows[0] ? rows[0] as Record<string, unknown> : {};
    return {
      resendFromEmail: cleanText(row.resend_from_email),
      notificationEmail: cleanText(row.notification_email),
    };
  } catch (error) {
    console.warn("[Email] app_settings email config lookup failed", getErrorMessage(error));
    return {};
  }
}

function logRuntimeConfig(requestId: string) {
  const fromEmail = Deno.env.get("RESEND_FROM_EMAIL") || "";

  console.log("[Email] Runtime config", {
    requestId,
    hasResendApiKey: Boolean(Deno.env.get("RESEND_API_KEY")),
    hasSupabaseUrl: Boolean(Deno.env.get("SUPABASE_URL")),
    hasServiceRoleKey: Boolean(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")),
    hasFromEmail: Boolean(fromEmail),
    fromEmail,
    adminRecipientEmail: ADMIN_RECIPIENT_EMAIL,
    orderRecipientEnvPresent: Boolean(Deno.env.get("ORDER_NOTIFICATION_TO_EMAIL")),
    usingResendTestingSender: isResendTestingSender(fromEmail),
  });

  if (isResendTestingSender(fromEmail)) {
    console.warn("[Email] Failure reason", {
      requestId,
      reason: "resend_testing_sender_restriction_possible",
      fromEmail,
      detail: "onboarding@resend.dev can only deliver to the Resend account email. Use a verified domain sender for admin and customer emails.",
    });
  }
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
  const requestEnvironment = requestOrder.environment && typeof requestOrder.environment === "object"
    ? requestOrder.environment as Record<string, unknown>
    : {};
  const environmentMode = normalizeEnvironmentMode(row.environment_mode || requestEnvironment.mode || requestOrder.environment_mode || "production");
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
    environmentMode,
    sourceTable: getSourceTableForMode(environmentMode),
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
  const testPrefix = order.environmentMode === "test" ? "[TEST ORDER] " : "";
  const subject = `${testPrefix}New Order on Aaruni Tech - ${order.orderId}`;
  const text = [
    ...(order.environmentMode === "test" ? ["TEST ORDER - do not fulfill as a live customer order.", ""] : []),
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
          <p style="margin:8px 0 0;color:#f3f4f6;">${order.environmentMode === "test" ? "TEST ORDER - not a live fulfillment" : "New paid order received"}</p>
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
  const testPrefix = order.environmentMode === "test" ? "[TEST ORDER] " : "";
  const subject = `${testPrefix}Your Aaruni Tech Order is Confirmed`;
  const text = [
    `Hello ${order.customerName},`,
    "",
    ...(order.environmentMode === "test" ? ["TEST ORDER - this confirmation was generated in test mode.", ""] : []),
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
          <p style="margin:8px 0 0;color:#f3f4f6;">${order.environmentMode === "test" ? "TEST ORDER" : "Smart shopping, better living"}</p>
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

function toJsonSafe(value: unknown) {
  if (value === undefined) {
    return null;
  }

  try {
    return JSON.parse(JSON.stringify(value));
  } catch (_error) {
    return { value: String(value) };
  }
}

function toDebugError(error: unknown) {
  if (!error) {
    return null;
  }

  if (typeof error === "string") {
    return { message: error };
  }

  const entry = error && typeof error === "object" ? error as Record<string, unknown> : {};

  return {
    status: cleanText(entry.status),
    statusText: cleanText(entry.statusText),
    code: cleanText(entry.code),
    message: getErrorMessage(error),
    details: cleanText(entry.details),
    hint: cleanText(entry.hint),
  };
}

async function logCheckoutDebug(
  supabaseUrl: string,
  serviceRoleKey: string,
  step: string,
  payload: Record<string, unknown>,
  error: unknown,
) {
  if (!supabaseUrl || !serviceRoleKey) {
    return;
  }

  const body = {
    step: cleanText(step, "unknown").slice(0, 200),
    payload: toJsonSafe(payload) || {},
    error: toDebugError(error) || toJsonSafe(error),
  };

  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/checkout_debug_logs`, {
      method: "POST",
      headers: {
        ...getServiceHeaders(serviceRoleKey),
        Prefer: "return=minimal",
      },
      body: JSON.stringify(body),
    });
    const text = await response.text();

    if (!response.ok) {
      console.error("[CheckoutDebug] checkout_debug_logs insert failed", {
        step,
        status: response.status,
        body: text,
      });
    }
  } catch (debugError) {
    console.error("[CheckoutDebug] checkout_debug_logs insert threw", {
      step,
      reason: getErrorMessage(debugError),
      stack: getErrorStack(debugError),
    });
  }
}

function isMissingColumnResponse(text: string, columnName: string) {
  const normalized = text.toLowerCase();
  return normalized.includes(columnName.toLowerCase()) &&
    (normalized.includes("column") || normalized.includes("schema cache") || normalized.includes("pgrst204"));
}

async function fetchSavedOrder(
  supabaseUrl: string,
  serviceRoleKey: string,
  orderId: string,
  paymentId: string,
  sourceTable: "orders" | "test_orders",
) {
  const url = new URL(`${supabaseUrl}/rest/v1/${sourceTable}`);
  const selectWithEnvironment = "order_id,payment_id,customer_name,customer_email,phone,product_name,quantity,total_price,total_amount,products,shipping_address,created_at,environment_mode,db_saved,admin_email_sent,customer_email_sent";
  const selectLegacy = "order_id,payment_id,customer_name,customer_email,phone,product_name,quantity,total_price,total_amount,products,shipping_address,created_at,db_saved,admin_email_sent,customer_email_sent";
  url.searchParams.set("select", selectWithEnvironment);
  url.searchParams.set("order_id", `eq.${orderId}`);
  url.searchParams.set("payment_id", `eq.${paymentId}`);
  url.searchParams.set("limit", "1");

  let response = await fetch(url, {
    headers: getServiceHeaders(serviceRoleKey),
  });
  let text = await response.text();

  if (!response.ok && isMissingColumnResponse(text, "environment_mode")) {
    url.searchParams.set("select", selectLegacy);
    response = await fetch(url, { headers: getServiceHeaders(serviceRoleKey) });
    text = await response.text();
  }

  if (!response.ok) {
    throw new Error(`Order lookup failed from ${sourceTable}: ${text || response.status}`);
  }

  const rows = text ? JSON.parse(text) : [];
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function fetchNotificationStatus(supabaseUrl: string, serviceRoleKey: string, idempotencyKey: string) {
  const url = new URL(`${supabaseUrl}/rest/v1/order_email_notifications`);
  url.searchParams.set("select", "status,updated_at,provider_message_id,error,sent_at");
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
      sent: true,
      providerMessageId: cleanText(existing && existing.provider_message_id),
      sentAt: cleanText(existing && existing.sent_at),
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
    sent: false,
    reason: status === "sending" ? "send_already_in_progress" : "notification_already_exists",
  };
}

async function markOrderEmailSent(supabaseUrl: string, serviceRoleKey: string, order: NormalizedOrder, emailType: EmailType, sentAt: string) {
  const url = new URL(`${supabaseUrl}/rest/v1/${order.sourceTable}`);
  url.searchParams.set("order_id", `eq.${order.orderId}`);
  url.searchParams.set("payment_id", `eq.${order.paymentId}`);
  const payload = emailType === "admin"
    ? {
      admin_email_sent: true,
      admin_email_sent_at: sentAt,
    }
    : {
      customer_email_sent: true,
      customer_email_sent_at: sentAt,
    };
  const fallbackPayload = emailType === "admin"
    ? { admin_email_sent: true }
    : { customer_email_sent: true };

  const sendPatch = async (body: Record<string, unknown>) => {
    const response = await fetch(url, {
      method: "PATCH",
      headers: getServiceHeaders(serviceRoleKey),
      body: JSON.stringify(body),
    });
    return { response, text: await response.text() };
  };

  let result = await sendPatch(payload);

  if (!result.response.ok && isMissingColumnResponse(result.text, `${emailType}_email_sent_at`)) {
    result = await sendPatch(fallbackPayload);
  }

  if (!result.response.ok && !isMissingColumnResponse(result.text, `${emailType}_email_sent`)) {
    console.error("[Email] Order email sent flag update failed", {
      orderId: order.orderId,
      emailType,
      status: result.response.status,
      body: result.text,
    });
  }
}

async function recordEmailLog(
  supabaseUrl: string,
  serviceRoleKey: string,
  order: NormalizedOrder,
  emailType: EmailType,
  result: EmailResult,
  resendAttempts = 0,
) {
  const payload = {
    order_id: order.orderId,
    payment_id: order.paymentId || null,
    email_type: emailType === "admin" ? "owner" : "customer",
    recipient_email: result.recipient || null,
    provider: "resend",
    provider_message_id: result.providerMessageId || null,
    status: result.status,
    resend_attempts: Math.max(0, resendAttempts),
    failure_reason: result.error || result.reason || null,
    environment_mode: order.environmentMode,
    source_table: order.sourceTable,
  };
  const url = new URL(`${supabaseUrl}/rest/v1/email_logs`);
  url.searchParams.set("on_conflict", "order_id,payment_id,email_type,environment_mode");

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        ...getServiceHeaders(serviceRoleKey),
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(payload),
    });
    const text = await response.text();

    if (!response.ok) {
      console.warn("[Email] email_logs upsert failed", {
        orderId: order.orderId,
        emailType,
        status: response.status,
        body: text.slice(0, 500),
      });
    }
  } catch (error) {
    console.warn("[Email] email_logs upsert threw", {
      orderId: order.orderId,
      emailType,
      reason: getErrorMessage(error),
    });
  }
}

async function sendWithResendAttempt(
  content: EmailContent,
  recipientEmail: string,
  idempotencyKey: string,
  order: NormalizedOrder,
  emailType: EmailType,
  attempt: number,
  emailConfig: ReturnType<typeof getEmailRuntimeConfig>,
) {
  const response = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${emailConfig.resendApiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify({
      from: emailConfig.fromEmail,
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

  console.log("[Email] Resend response", {
    orderId: order.orderId,
    emailType,
    to: recipientEmail,
    from: emailConfig.fromEmail,
    attempt,
    maxAttempts: RESEND_MAX_ATTEMPTS,
    status: response.status,
    ok: response.ok,
    body: summarizeResendResponse(responseText),
  });

  if (!response.ok) {
    const error = new Error(`Resend send failed (${response.status}): ${responseText || response.status}`);
    (error as Error & { retryable?: boolean; status?: number }).retryable = shouldRetryResend(response.status);
    (error as Error & { retryable?: boolean; status?: number }).status = response.status;
    throw error;
  }

  return {
    ...(parseJsonObject(responseText) || {}),
    attempts: attempt,
  };
}

async function sendWithResend(
  content: EmailContent,
  recipientEmail: string,
  idempotencyKey: string,
  order: NormalizedOrder,
  emailType: EmailType,
  emailSettings: RuntimeEmailSettings,
) {
  const emailConfig = getEmailRuntimeConfig(emailSettings);
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= RESEND_MAX_ATTEMPTS; attempt += 1) {
    try {
      return await sendWithResendAttempt(content, recipientEmail, idempotencyKey, order, emailType, attempt, emailConfig);
    } catch (error) {
      lastError = error;
      const retryable = Boolean((error as Error & { retryable?: boolean }).retryable) || !(error as Error & { status?: number }).status;

      console.error("[EMAIL FAILED]", {
        orderId: order.orderId,
        paymentId: order.paymentId,
        emailType,
        recipient: recipientEmail,
        attempt,
        maxAttempts: RESEND_MAX_ATTEMPTS,
        retryable,
        reason: getErrorMessage(error),
      });

      if (!retryable || attempt >= RESEND_MAX_ATTEMPTS) {
        break;
      }

      await delay(RESEND_RETRY_DELAY_MS * attempt);
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Resend send failed");
}

async function sendEmailJob(
  supabaseUrl: string,
  serviceRoleKey: string,
  order: NormalizedOrder,
  emailType: EmailType,
  emailSettings: RuntimeEmailSettings,
): Promise<EmailResult> {
  const recipientEmail = emailType === "admin" ? cleanText(emailSettings.notificationEmail || ADMIN_RECIPIENT_EMAIL) : order.customerEmail;

  if (emailType === "admin" && !isUsableEmail(recipientEmail)) {
    console.error("[Email] Failure reason", {
      orderId: order.orderId,
      emailType,
      recipient: recipientEmail,
      reason: "invalid_admin_recipient_email",
    });
    console.error("[EMAIL FAILED]", {
      orderId: order.orderId,
      paymentId: order.paymentId,
      emailType,
      recipient: recipientEmail,
      reason: "invalid_admin_recipient_email",
    });
    await logCheckoutDebug(
      supabaseUrl,
      serviceRoleKey,
      "edge_invalid_admin_recipient_email",
      { orderId: order.orderId, paymentId: order.paymentId, emailType, recipient: recipientEmail },
      "invalid_admin_recipient_email",
    );
    const result: EmailResult = {
      type: emailType,
      status: "failed",
      recipient: recipientEmail,
      error: "invalid_admin_recipient_email",
    };
    await recordEmailLog(supabaseUrl, serviceRoleKey, order, emailType, result, 0);
    return result;
  }

  if (emailType === "customer" && !isUsableEmail(recipientEmail)) {
    console.warn("[Email] Failure reason", {
      orderId: order.orderId,
      emailType,
      recipient: recipientEmail,
      reason: "missing_customer_email",
    });
    console.error("[EMAIL FAILED]", {
      orderId: order.orderId,
      paymentId: order.paymentId,
      emailType,
      recipient: recipientEmail,
      reason: "missing_customer_email",
    });
    await logCheckoutDebug(
      supabaseUrl,
      serviceRoleKey,
      "edge_missing_customer_email",
      { orderId: order.orderId, paymentId: order.paymentId, emailType, recipient: recipientEmail },
      "missing_customer_email",
    );
    const result: EmailResult = {
      type: emailType,
      status: "skipped",
      recipient: recipientEmail,
      reason: "missing_customer_email",
    };
    await recordEmailLog(supabaseUrl, serviceRoleKey, order, emailType, result, 0);
    return result;
  }

  const idempotencyKey = buildIdempotencyKey(order.orderId, order.paymentId, emailType);
  let notificationLockAvailable = true;

  const recordFailedStatus = async (message: string) => {
    if (!notificationLockAvailable) {
      return;
    }

    try {
      await updateNotificationStatus(supabaseUrl, serviceRoleKey, idempotencyKey, {
        status: "failed",
        error: message.slice(0, 1000),
      });
    } catch (statusError) {
      console.error("[Email] Failure reason", {
        orderId: order.orderId,
        emailType,
        stage: "record_failed_status",
        reason: getErrorMessage(statusError),
        stack: getErrorStack(statusError),
      });
    }
  };

  try {
    const lock = await createNotificationLock(supabaseUrl, serviceRoleKey, idempotencyKey, emailType, recipientEmail, order);

    if (!lock.locked) {
      const lockRecord = lock as Record<string, unknown>;
      const alreadySent = Boolean(lockRecord.sent) || Boolean(cleanText(lockRecord.providerMessageId));
      const providerMessageId = cleanText(lockRecord.providerMessageId);
      console.log("[Email] Duplicate notification skipped", {
        orderId: order.orderId,
        emailType,
        recipient: recipientEmail,
        alreadySent,
        reason: cleanText(lockRecord.reason),
      });
      if (alreadySent) {
        try {
          await markOrderEmailSent(
            supabaseUrl,
            serviceRoleKey,
            order,
            emailType,
            cleanText(lockRecord.sentAt) || new Date().toISOString(),
          );
        } catch (markError) {
          console.error("[Email] Failure reason", {
            orderId: order.orderId,
            emailType,
            stage: "mark_duplicate_email_sent",
            reason: getErrorMessage(markError),
            stack: getErrorStack(markError),
          });
        }
      }
      const result: EmailResult = {
        type: emailType,
        status: alreadySent ? "duplicate" : "skipped",
        recipient: recipientEmail,
        providerMessageId,
        reason: cleanText(lockRecord.reason),
      };
      await recordEmailLog(supabaseUrl, serviceRoleKey, order, emailType, result, 0);
      return result;
    }
  } catch (error) {
    notificationLockAvailable = false;
    console.error("[Email] Failure reason", {
      orderId: order.orderId,
      emailType,
      recipient: recipientEmail,
      stage: "notification_lock",
      reason: getErrorMessage(error),
      stack: getErrorStack(error),
    });
    await logCheckoutDebug(
      supabaseUrl,
      serviceRoleKey,
      "edge_notification_lock_failed",
      { orderId: order.orderId, paymentId: order.paymentId, emailType, recipient: recipientEmail },
      error,
    );
    console.warn("[Email] Continuing without notification lock; Resend idempotency still applies", {
      orderId: order.orderId,
      emailType,
      recipient: recipientEmail,
    });
  }

  try {
    const content = emailType === "admin"
      ? buildAdminEmailContent(order)
      : buildCustomerEmailContent(order);

    if (emailType === "admin") {
      console.log("[Email] Sending admin notification", {
        orderId: order.orderId,
        paymentId: order.paymentId,
        to: recipientEmail,
      });
    } else {
      console.log("[Email] Sending customer confirmation", {
        orderId: order.orderId,
        paymentId: order.paymentId,
        to: recipientEmail,
      });
    }

    const resendResponse = await sendWithResend(content, recipientEmail, idempotencyKey, order, emailType, emailSettings);
    const sentAt = new Date().toISOString();
    const providerMessageId = cleanText(resendResponse.id);

    if (notificationLockAvailable) {
      try {
        await updateNotificationStatus(supabaseUrl, serviceRoleKey, idempotencyKey, {
          status: "sent",
          provider_message_id: providerMessageId,
          error: null,
          sent_at: sentAt,
        });
      } catch (statusError) {
        console.error("[Email] Failure reason", {
          orderId: order.orderId,
          emailType,
          stage: "record_sent_status",
          reason: getErrorMessage(statusError),
          stack: getErrorStack(statusError),
        });
      }
    }

    try {
      await markOrderEmailSent(supabaseUrl, serviceRoleKey, order, emailType, sentAt);
    } catch (markError) {
      console.error("[Email] Failure reason", {
        orderId: order.orderId,
        emailType,
        stage: `mark_${emailType}_email_sent`,
        reason: getErrorMessage(markError),
        stack: getErrorStack(markError),
      });
    }

    console.log(emailType === "admin" ? "[ADMIN EMAIL SENT]" : "[CUSTOMER EMAIL SENT]", {
      orderId: order.orderId,
      paymentId: order.paymentId,
      to: recipientEmail,
      providerMessageId,
    });
    if (emailType === "admin") {
      console.log("[STEP 6] Admin email sent");
    } else {
      console.log("[STEP 7] Customer email sent");
    }

    console.log("[Email] Success", {
      orderId: order.orderId,
      emailType,
      to: recipientEmail,
      providerMessageId,
    });

    const result: EmailResult = {
      type: emailType,
      status: "sent",
      recipient: recipientEmail,
      providerMessageId,
    };
    await recordEmailLog(
      supabaseUrl,
      serviceRoleKey,
      order,
      emailType,
      result,
      Math.max(0, cleanNumber((resendResponse as Record<string, unknown>).attempts, 1) - 1),
    );
    return result;
  } catch (error) {
    const message = getErrorMessage(error);

    await recordFailedStatus(message);

    console.error("[Email] Failure reason", {
      orderId: order.orderId,
      emailType,
      recipient: recipientEmail,
      stage: "send_email",
      reason: message,
      stack: getErrorStack(error),
    });
    console.error("[EMAIL FAILED]", {
      orderId: order.orderId,
      paymentId: order.paymentId,
      emailType,
      recipient: recipientEmail,
      reason: message,
    });
    await logCheckoutDebug(
      supabaseUrl,
      serviceRoleKey,
      "edge_send_email_failed",
      { orderId: order.orderId, paymentId: order.paymentId, emailType, recipient: recipientEmail },
      error,
    );
    const result: EmailResult = {
      type: emailType,
      status: "failed",
      recipient: recipientEmail,
      error: message,
    };
    await recordEmailLog(supabaseUrl, serviceRoleKey, order, emailType, result, RESEND_MAX_ATTEMPTS - 1);
    return result;
  }
}

Deno.serve(async (req) => {
  const requestId = crypto.randomUUID();
  let supabaseUrl = "";
  let serviceRoleKey = "";

  console.log("[Email] Function called", {
    requestId,
    method: req.method,
    origin: req.headers.get("origin") || "",
    contentType: req.headers.get("content-type") || "",
    hasAuthorization: Boolean(req.headers.get("authorization")),
  });

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    console.error("[Email] Failure reason", {
      requestId,
      reason: "method_not_allowed",
      method: req.method,
    });
    return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);
  }

  try {
    logRuntimeConfig(requestId);

    supabaseUrl = getRequiredEnv("SUPABASE_URL").replace(/\/+$/, "");
    serviceRoleKey = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    const body = await req.json();
    const requestOrder = body && typeof body.order === "object" ? body.order as Record<string, unknown> : {};
    const requestPayment = requestOrder.payment && typeof requestOrder.payment === "object"
      ? requestOrder.payment as Record<string, unknown>
      : {};
    const requestEnvironment = requestOrder.environment && typeof requestOrder.environment === "object"
      ? requestOrder.environment as Record<string, unknown>
      : {};
    const environmentMode = requestOrder.environment_mode || requestEnvironment.mode
      ? normalizeEnvironmentMode(requestOrder.environment_mode || requestEnvironment.mode)
      : "production";
    const sourceTable = getSourceTableForMode(environmentMode);
    const orderId = cleanText(requestOrder.id);
    const paymentId = cleanText(requestPayment.id);

    console.log("[Email] Payload received", {
      requestId,
      orderId,
      paymentId,
      environmentMode,
      sourceTable,
      itemCount: Array.isArray(requestOrder.items) ? requestOrder.items.length : 0,
      customerEmail: cleanText((requestOrder.customer as Record<string, unknown> | undefined)?.email),
      totalAmount: cleanNumber(requestOrder.total_amount),
    });

    if (!orderId || !paymentId) {
      console.error("[Email] Failure reason", {
        requestId,
        reason: "missing_order_or_payment_id",
        orderId,
        paymentId,
      });
      await logCheckoutDebug(
        supabaseUrl,
        serviceRoleKey,
        "edge_missing_order_or_payment_id",
        { requestId, orderId, paymentId },
        "missing_order_or_payment_id",
      );
      return jsonResponse({ ok: false, error: "missing_order_or_payment_id" }, 400);
    }

    const savedOrder = await fetchSavedOrder(supabaseUrl, serviceRoleKey, orderId, paymentId, sourceTable);

    if (!savedOrder) {
      console.error("[Email] Failure reason", {
        requestId,
        reason: "saved_order_not_found",
        orderId,
        paymentId,
      });
      await logCheckoutDebug(
        supabaseUrl,
        serviceRoleKey,
        "edge_saved_order_not_found",
        { requestId, orderId, paymentId },
        "saved_order_not_found",
      );
      return jsonResponse({ ok: false, error: "saved_order_not_found" }, 404);
    }

    const order = normalizeOrder(savedOrder, requestOrder);
    console.log("[Email] Saved order found", {
      requestId,
      orderId: order.orderId,
      paymentId: order.paymentId,
      environmentMode: order.environmentMode,
      sourceTable: order.sourceTable,
      customerEmail: order.customerEmail,
      itemCount: order.items.length,
      totalAmount: order.totalAmount,
    });
    console.log("[ORDER SAVED]", {
      requestId,
      orderId: order.orderId,
      paymentId: order.paymentId,
      db_saved: Boolean(savedOrder.db_saved),
      admin_email_sent: Boolean(savedOrder.admin_email_sent),
      customer_email_sent: Boolean(savedOrder.customer_email_sent),
    });

    const emailSettings = await fetchRuntimeEmailSettings(supabaseUrl, serviceRoleKey);
    const emailResults = [
      await sendEmailJob(supabaseUrl, serviceRoleKey, order, "admin", emailSettings),
      await sendEmailJob(supabaseUrl, serviceRoleKey, order, "customer", emailSettings),
    ];
    const complete = emailResults.every((result) => result.status === "sent" || result.status === "duplicate");
    const adminEmailSent = emailResults.some((result) => result.type === "admin" && (result.status === "sent" || result.status === "duplicate"));
    const customerEmailSent = emailResults.some((result) => result.type === "customer" && (result.status === "sent" || result.status === "duplicate"));

    console.log("[Email] Success", {
      requestId,
      orderId: order.orderId,
      complete,
      adminEmailSent,
      customerEmailSent,
      emails: emailResults,
    });

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
    const message = getErrorMessage(error);
    console.error("[Email] Failure reason", {
      requestId,
      stage: "function",
      reason: message,
      stack: getErrorStack(error),
    });
    console.error("[Email] send-order-notification failed", message);
    await logCheckoutDebug(
      supabaseUrl,
      serviceRoleKey,
      "edge_function_failed",
      { requestId },
      error,
    );
    return jsonResponse({ ok: false, error: message }, 500);
  }
});
