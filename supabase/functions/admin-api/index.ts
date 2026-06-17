const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const OWNER_EMAIL = "tech.aaruni@gmail.com";
const ORDER_STATUSES = new Set(["Processing", "Shipped", "Delivered", "Cancelled"]);

type AdminContext = {
  supabaseUrl: string;
  serviceRoleKey: string;
  adminEmail: string;
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

function cleanText(value: unknown, fallback = "") {
  return String(value || fallback).trim();
}

function cleanNumber(value: unknown, fallback = 0) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function normalizeMode(value: unknown) {
  const raw = cleanText(value).toLowerCase();
  if (raw === "prod" || raw === "live" || raw === "production") return "production";
  if (raw === "all") return "all";
  return "test";
}

function getServiceHeaders(serviceRoleKey: string) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
  };
}

function getBearerToken(req: Request) {
  const header = req.headers.get("authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : "";
}

async function readJson(req: Request) {
  try {
    const body = await req.json();
    return body && typeof body === "object" ? body as Record<string, unknown> : {};
  } catch (_error) {
    return {};
  }
}

async function verifyAdmin(req: Request): Promise<AdminContext | Response> {
  const supabaseUrl = cleanText(Deno.env.get("SUPABASE_URL")).replace(/\/+$/, "");
  const serviceRoleKey = cleanText(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
  const token = getBearerToken(req);

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ ok: false, error: "admin_api_not_configured" }, 500);
  }

  if (!token) {
    return jsonResponse({ ok: false, error: "missing_auth_token" }, 401);
  }

  const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${token}`,
    },
  });
  const userText = await userResponse.text();

  if (!userResponse.ok) {
    return jsonResponse({ ok: false, error: "invalid_auth_token" }, 401);
  }

  const user = userText ? JSON.parse(userText) as Record<string, unknown> : {};
  const email = cleanText(user.email).toLowerCase();

  if (email !== OWNER_EMAIL) {
    return jsonResponse({ ok: false, error: "admin_email_not_allowed" }, 403);
  }

  const adminRows = await restSelect(supabaseUrl, serviceRoleKey, "admin_users", "email,active,role", {
    email: `eq.${email}`,
    limit: "1",
  });
  const admin = adminRows[0] as Record<string, unknown> | undefined;

  if (admin && admin.active === false) {
    return jsonResponse({ ok: false, error: "admin_user_disabled" }, 403);
  }

  return { supabaseUrl, serviceRoleKey, adminEmail: email };
}

async function restSelect(
  supabaseUrl: string,
  serviceRoleKey: string,
  table: string,
  select: string,
  params: Record<string, string> = {},
) {
  const url = new URL(`${supabaseUrl}/rest/v1/${table}`);
  url.searchParams.set("select", select);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));

  const response = await fetch(url, { headers: getServiceHeaders(serviceRoleKey) });
  const text = await response.text();

  if (!response.ok) {
    console.warn("[AdminAPI] select failed", { table, status: response.status, body: text.slice(0, 500) });
    return [];
  }

  const rows = text ? JSON.parse(text) : [];
  return Array.isArray(rows) ? rows : [];
}

async function restPatch(
  supabaseUrl: string,
  serviceRoleKey: string,
  table: string,
  filters: Record<string, string>,
  payload: Record<string, unknown>,
) {
  const url = new URL(`${supabaseUrl}/rest/v1/${table}`);
  Object.entries(filters).forEach(([key, value]) => url.searchParams.set(key, value));

  const response = await fetch(url, {
    method: "PATCH",
    headers: {
      ...getServiceHeaders(serviceRoleKey),
      Prefer: "return=representation",
    },
    body: JSON.stringify(payload),
  });
  const text = await response.text();

  if (!response.ok) {
    throw new Error(text || `Patch failed (${response.status})`);
  }

  const rows = text ? JSON.parse(text) : [];
  return Array.isArray(rows) ? rows : [];
}

function sourceTableForMode(mode: string) {
  return mode === "test" ? "test_orders" : "orders";
}

function normalizePaymentStatus(value: unknown) {
  const raw = cleanText(value || "pending").toLowerCase();
  if (raw.includes("fail")) return "failed";
  if (raw.includes("paid") || raw.includes("captured") || raw.includes("success")) return "paid";
  return "pending";
}

function validateRazorpayKeyId(value: unknown, expectedPrefix: "rzp_test_" | "rzp_live_", label: string) {
  const keyId = cleanText(value);
  if (!keyId) return "";
  if (!keyId.startsWith(expectedPrefix)) {
    throw new Error(`${label} must start with ${expectedPrefix}.`);
  }
  return keyId;
}

function normalizeOrder(row: Record<string, unknown>, sourceTable: string) {
  const products = Array.isArray(row.products) ? row.products : [];
  const totalAmount = cleanNumber(row.total_amount ?? row.total_price);
  return {
    sourceTable,
    mode: normalizeMode(row.environment_mode || (sourceTable === "test_orders" ? "test" : "production")),
    id: cleanText(row.order_id || row.id),
    rowId: cleanText(row.id),
    createdAt: cleanText(row.created_at),
    customerName: cleanText(row.customer_name, "Customer"),
    customerEmail: cleanText(row.customer_email),
    phone: cleanText(row.phone),
    products,
    productSummary: products.length
      ? products.map((item: Record<string, unknown>) => `${cleanText(item.name || item.product_name || item.product_id, "Product")} x ${cleanNumber(item.quantity, 1)}`).join(", ")
      : cleanText(row.product_name, "Cart items"),
    quantity: cleanNumber(row.quantity, 1),
    subtotal: cleanNumber(row.subtotal, totalAmount),
    shippingFee: cleanNumber(row.shipping_fee),
    gstAmount: cleanNumber(row.gst_amount),
    totalAmount,
    shippingAddress: cleanText(row.shipping_address),
    paymentId: cleanText(row.payment_id),
    paymentStatus: normalizePaymentStatus(row.payment_status),
    orderStatus: cleanText(row.order_status || row.status, "Processing"),
    adminEmailSent: Boolean(row.admin_email_sent),
    customerEmailSent: Boolean(row.customer_email_sent),
  };
}

async function getCombinedOrders(ctx: AdminContext, mode = "all", limit = 500) {
  const normalizedMode = normalizeMode(mode);
  const tables = normalizedMode === "all" ? ["orders", "test_orders"] : [sourceTableForMode(normalizedMode)];
  const rows = await Promise.all(tables.map(async (table) => {
    const data = await restSelect(
      ctx.supabaseUrl,
      ctx.serviceRoleKey,
      table,
      "id,created_at,order_id,user_id,customer_name,customer_email,phone,product_name,quantity,subtotal,shipping_fee,gst_amount,total_price,total_amount,products,shipping_address,payment_id,payment_status,order_status,status,environment_mode,admin_email_sent,customer_email_sent",
      { order: "created_at.desc", limit: String(limit) },
    );
    return data.map((row) => normalizeOrder(row as Record<string, unknown>, table));
  }));

  return rows.flat().sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()).slice(0, limit);
}

function filterOrders(orders: ReturnType<typeof normalizeOrder>[], body: Record<string, unknown>) {
  const search = cleanText(body.search).toLowerCase();
  const paymentStatus = cleanText(body.paymentStatus).toLowerCase();

  return orders.filter((order) => {
    const matchesPayment = !paymentStatus || paymentStatus === "all" || order.paymentStatus === paymentStatus;
    const haystack = [
      order.id,
      order.customerName,
      order.customerEmail,
      order.phone,
      order.paymentId,
      order.productSummary,
    ].join(" ").toLowerCase();
    const matchesSearch = !search || haystack.includes(search);
    return matchesPayment && matchesSearch;
  });
}

async function getSettings(ctx: AdminContext) {
  const rows = await restSelect(ctx.supabaseUrl, ctx.serviceRoleKey, "app_settings", "*", { id: "eq.global", limit: "1" });
  const row = (rows[0] || {}) as Record<string, unknown>;
  return {
    environment_mode: normalizeMode(row.environment_mode),
    razorpay_test_key_id: cleanText(row.razorpay_test_key_id, "rzp_test_SpYO2ojU9ZzsNG"),
    razorpay_live_key_id: cleanText(row.razorpay_live_key_id),
    razorpay_test_secret_configured: Boolean(row.razorpay_test_key_secret),
    razorpay_live_secret_configured: Boolean(row.razorpay_live_key_secret),
    resend_from_email: cleanText(row.resend_from_email),
    notification_email: cleanText(row.notification_email, OWNER_EMAIL),
    shipping_fee: cleanNumber(row.shipping_fee),
    gst_enabled: Boolean(row.gst_enabled),
    gst_percent: cleanNumber(row.gst_percent),
    updated_at: cleanText(row.updated_at),
  };
}

async function updateSettings(ctx: AdminContext, body: Record<string, unknown>) {
  const source = body.settings && typeof body.settings === "object"
    ? body.settings as Record<string, unknown>
    : body;
  const payload: Record<string, unknown> = { id: "global" };
  const mode = normalizeMode(source.environment_mode);

  if (mode === "test" || mode === "production") payload.environment_mode = mode;
  if ("razorpay_test_key_id" in source) payload.razorpay_test_key_id = validateRazorpayKeyId(source.razorpay_test_key_id, "rzp_test_", "Razorpay test key ID");
  if ("razorpay_live_key_id" in source) payload.razorpay_live_key_id = validateRazorpayKeyId(source.razorpay_live_key_id, "rzp_live_", "Razorpay live key ID");
  if (cleanText(source.razorpay_test_key_secret)) payload.razorpay_test_key_secret = cleanText(source.razorpay_test_key_secret);
  if (cleanText(source.razorpay_live_key_secret)) payload.razorpay_live_key_secret = cleanText(source.razorpay_live_key_secret);
  if ("resend_from_email" in source) payload.resend_from_email = cleanText(source.resend_from_email);
  if ("notification_email" in source) payload.notification_email = cleanText(source.notification_email, OWNER_EMAIL);
  if ("shipping_fee" in source) payload.shipping_fee = Math.max(0, cleanNumber(source.shipping_fee));
  if ("gst_enabled" in source) payload.gst_enabled = Boolean(source.gst_enabled);
  if ("gst_percent" in source) payload.gst_percent = Math.max(0, cleanNumber(source.gst_percent));

  const url = new URL(`${ctx.supabaseUrl}/rest/v1/app_settings`);
  url.searchParams.set("on_conflict", "id");
  const response = await fetch(url, {
    method: "POST",
    headers: {
      ...getServiceHeaders(ctx.serviceRoleKey),
      Prefer: "resolution=merge-duplicates,return=representation",
    },
    body: JSON.stringify(payload),
  });
  const text = await response.text();

  if (!response.ok) {
    throw new Error(text || `Settings update failed (${response.status})`);
  }

  return getSettings(ctx);
}

async function fetchAuthUsers(ctx: AdminContext) {
  const response = await fetch(`${ctx.supabaseUrl}/auth/v1/admin/users?page=1&per_page=1000`, {
    headers: getServiceHeaders(ctx.serviceRoleKey),
  });
  const text = await response.text();

  if (!response.ok) {
    console.warn("[AdminAPI] auth user list unavailable", { status: response.status, body: text.slice(0, 500) });
    return [];
  }

  const parsed = text ? JSON.parse(text) : {};
  return Array.isArray(parsed.users) ? parsed.users as Record<string, unknown>[] : [];
}

async function getCustomers(ctx: AdminContext) {
  const [profiles, authUsers, orders] = await Promise.all([
    restSelect(ctx.supabaseUrl, ctx.serviceRoleKey, "customer_profiles", "id,full_name,email,phone,created_at,updated_at", { limit: "1000" }),
    fetchAuthUsers(ctx),
    getCombinedOrders(ctx, "all", 1000),
  ]);
  const authById = new Map(authUsers.map((user) => [cleanText(user.id), user]));
  const customers = new Map<string, Record<string, unknown>>();

  profiles.forEach((profile) => {
    const entry = profile as Record<string, unknown>;
    const email = cleanText(entry.email).toLowerCase();
    const id = cleanText(entry.id);
    const key = email || id;
    const authUser = authById.get(id) || {};
    customers.set(key, {
      id,
      name: cleanText(entry.full_name, email || "Customer"),
      email,
      phone: cleanText(entry.phone),
      orderCount: 0,
      totalSpent: 0,
      lastLogin: cleanText(authUser.last_sign_in_at),
      createdAt: cleanText(entry.created_at),
    });
  });

  orders.forEach((order) => {
    const email = cleanText(order.customerEmail).toLowerCase();
    if (!email) return;
    const current = customers.get(email) || {
      id: "",
      name: order.customerName,
      email,
      phone: order.phone,
      orderCount: 0,
      totalSpent: 0,
      lastLogin: "",
      createdAt: order.createdAt,
    };
    current.orderCount = cleanNumber(current.orderCount) + 1;
    current.totalSpent = cleanNumber(current.totalSpent) + order.totalAmount;
    if (!cleanText(current.phone)) current.phone = order.phone;
    customers.set(email, current);
  });

  return Array.from(customers.values()).sort((a, b) => cleanNumber(b.totalSpent) - cleanNumber(a.totalSpent));
}

async function getEmailLogs(ctx: AdminContext) {
  const logs = await restSelect(
    ctx.supabaseUrl,
    ctx.serviceRoleKey,
    "email_logs",
    "id,created_at,updated_at,order_id,payment_id,email_type,recipient_email,provider,provider_message_id,status,resend_attempts,failure_reason,environment_mode,source_table",
    { order: "created_at.desc", limit: "300" },
  );

  if (logs.length) {
    return logs;
  }

  const notifications = await restSelect(
    ctx.supabaseUrl,
    ctx.serviceRoleKey,
    "order_email_notifications",
    "id,created_at,updated_at,order_id,payment_id,email_type,recipient_email,provider,provider_message_id,status,error",
    { order: "created_at.desc", limit: "300" },
  );

  return notifications.map((entry) => {
    const row = entry as Record<string, unknown>;
    return {
      ...row,
      email_type: cleanText(row.email_type) === "admin" ? "owner" : cleanText(row.email_type, "customer"),
      resend_attempts: 0,
      failure_reason: cleanText(row.error),
      environment_mode: "production",
      source_table: "orders",
    };
  });
}

async function updateOrderStatus(ctx: AdminContext, body: Record<string, unknown>) {
  const orderId = cleanText(body.orderId);
  const sourceTable = cleanText(body.sourceTable) || sourceTableForMode(normalizeMode(body.mode));
  const status = cleanText(body.status);

  if (!orderId) throw new Error("Missing order ID.");
  if (!ORDER_STATUSES.has(status)) throw new Error("Invalid order status.");
  if (sourceTable !== "orders" && sourceTable !== "test_orders") throw new Error("Invalid order source.");

  const rows = await restPatch(ctx.supabaseUrl, ctx.serviceRoleKey, sourceTable, { order_id: `eq.${orderId}` }, {
    order_status: status,
    status,
  });

  return rows[0] ? normalizeOrder(rows[0] as Record<string, unknown>, sourceTable) : null;
}

async function routeAction(ctx: AdminContext, body: Record<string, unknown>) {
  const action = cleanText(body.action);

  if (action === "dashboard") {
    const [orders, customers, emailLogs, products, settings] = await Promise.all([
      getCombinedOrders(ctx, "all", 1000),
      getCustomers(ctx),
      getEmailLogs(ctx),
      restSelect(ctx.supabaseUrl, ctx.serviceRoleKey, "products", "id,product_name,product_id,slug,price,stock,created_at,description,image_url", { order: "created_at.desc", limit: "300" }),
      getSettings(ctx),
    ]);
    const productionOrders = orders.filter((order) => order.mode === "production");
    return {
      settings,
      stats: {
        totalOrders: orders.length,
        productionOrders: productionOrders.length,
        testOrders: orders.filter((order) => order.mode === "test").length,
        paidOrders: orders.filter((order) => order.paymentStatus === "paid").length,
        totalRevenue: productionOrders.reduce((sum, order) => sum + order.totalAmount, 0),
        customers: customers.length,
        products: products.length,
        emailFailures: emailLogs.filter((log: Record<string, unknown>) => cleanText(log.status).toLowerCase() === "failed").length,
      },
      recentOrders: orders.slice(0, 8),
      emailLogs: emailLogs.slice(0, 8),
    };
  }

  if (action === "orders") {
    const orders = await getCombinedOrders(ctx, cleanText(body.mode, "all"), 1000);
    return { orders: filterOrders(orders, body).slice(0, 300) };
  }

  if (action === "orderDetails") {
    const orders = await getCombinedOrders(ctx, cleanText(body.mode, "all"), 1000);
    return { order: orders.find((order) => order.id === cleanText(body.orderId)) || null };
  }

  if (action === "updateOrderStatus") {
    return { order: await updateOrderStatus(ctx, body) };
  }

  if (action === "customers") {
    return { customers: await getCustomers(ctx) };
  }

  if (action === "products") {
    return {
      products: await restSelect(ctx.supabaseUrl, ctx.serviceRoleKey, "products", "id,product_name,product_id,slug,price,stock,created_at,description,image_url", {
        order: "created_at.desc",
        limit: "500",
      }),
    };
  }

  if (action === "payments") {
    return { payments: (await getCombinedOrders(ctx, "all", 1000)).map((order) => ({
      orderId: order.id,
      mode: order.mode,
      paymentId: order.paymentId,
      paymentStatus: order.paymentStatus,
      amount: order.totalAmount,
      customerEmail: order.customerEmail,
      createdAt: order.createdAt,
    })) };
  }

  if (action === "emailLogs") {
    return { emailLogs: await getEmailLogs(ctx) };
  }

  if (action === "settings") {
    return { settings: await getSettings(ctx) };
  }

  if (action === "updateSettings") {
    return { settings: await updateSettings(ctx, body) };
  }

  throw new Error(`Unknown admin action: ${action || "missing"}`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);
  }

  try {
    const adminContext = await verifyAdmin(req);
    if (adminContext instanceof Response) return adminContext;

    const body = await readJson(req);
    const data = await routeAction(adminContext, body);
    return jsonResponse({ ok: true, ...data });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[AdminAPI] failed", message);
    return jsonResponse({ ok: false, error: message }, 500);
  }
});
