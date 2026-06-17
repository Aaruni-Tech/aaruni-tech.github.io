import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

let supabaseClient = null;

const ORDER_STATUSES = ["Processing", "Order Confirmed", "Packed", "Shipped", "Out for Delivery", "Delivered", "Cancelled"];
const ORDER_EMAIL_FUNCTION_NAME =
  (window.AARUNI_CONFIG &&
    window.AARUNI_CONFIG.email &&
    window.AARUNI_CONFIG.email.orderNotificationFunctionName) ||
  "send-order-notification";
const ORDER_EMAIL_STORAGE_PREFIX = "aaruniOrderEmailNotification:";
const ORDER_EMAIL_INVOKE_MAX_ATTEMPTS = 3;
const ORDER_EMAIL_RETRY_DELAY_MS = 1200;
const CUSTOMER_PROFILE_TABLE = "customer_profiles";

console.log("[Supabase] Backend init", {
  url: window.SUPABASE_URL,
  keyPresent: !!window.SUPABASE_ANON_KEY,
});

function getSupabaseConfig() {
  return {
    url: typeof window.SUPABASE_URL === "string" ? window.SUPABASE_URL.trim() : "",
    anonKey: typeof window.SUPABASE_ANON_KEY === "string" ? window.SUPABASE_ANON_KEY.trim() : "",
  };
}

function isConfigured() {
  const { url, anonKey } = getSupabaseConfig();
  return Boolean(
    url && anonKey
  );
}

function normalizeRuntimeMode(value) {
  const raw = String(value || "").trim().toLowerCase();
  return raw === "production" || raw === "prod" || raw === "live" ? "production" : "test";
}

function getRuntimeMode() {
  const config = window.AARUNI_CONFIG || {};
  return normalizeRuntimeMode(config.isProduction ? "production" : config.mode || window.AARUNI_ENVIRONMENT || "test");
}

function getOrderSourceTable() {
  return getRuntimeMode() === "test" ? "test_orders" : "orders";
}

function maskValue(value) {
  const raw = String(value || "");
  if (!raw) return "";
  if (raw.length <= 8) return "***";
  return `${raw.slice(0, 4)}***${raw.slice(-4)}`;
}

function getClient() {
  if (!supabaseClient) {
    const { url, anonKey } = getSupabaseConfig();
    console.info("[Supabase] Initializing client", {
      url: url || "",
      anonKey: anonKey ? maskValue(anonKey) : "",
    });
    console.log("Supabase URL:", url);
    // Use window.* globals so GitHub Pages deployments work reliably.
    try {
      supabaseClient = createClient(url, anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          flowType: "pkce",
        },
      });
    } catch (err) {
      console.error("Supabase connection failed:", err);
      throw err;
    }
  }

  return supabaseClient;
}

function getOrderEmailFunctionUrl() {
  const { url } = getSupabaseConfig();

  if (!url || !ORDER_EMAIL_FUNCTION_NAME) {
    return "";
  }

  return `${url.replace(/\/+$/, "")}/functions/v1/${ORDER_EMAIL_FUNCTION_NAME}`;
}

function getAuthRedirectUrl(mode) {
  const url = new URL("index.html", window.location.href);
  url.searchParams.set("open_account", "1");
  if (mode) {
    url.searchParams.set("mode", mode);
  }
  return url.toString();
}

function getAddressFromParts(profile) {
  return [
    profile.houseNumber,
    profile.village,
    profile.mandal,
    profile.area,
    profile.district,
    profile.state,
  ].filter(Boolean).join(", ");
}

function getAddressPartsObject(profile) {
  return {
    state: String(profile.state || "").trim(),
    area: String(profile.area || "").trim(),
    district: String(profile.district || "").trim(),
    mandal: String(profile.mandal || "").trim(),
    village: String(profile.village || "").trim(),
    houseNumber: String(profile.houseNumber || profile.house_number || "").trim(),
  };
}

function normalizeCustomerProfile(input = {}, user = null) {
  const metadata = (user && user.user_metadata) || {};
  const addressParts = {
    ...getAddressPartsObject(metadata),
    ...getAddressPartsObject(input),
  };
  const address =
    String(input.address || input.shipping_address || metadata.address || metadata.shipping_address || "").trim() ||
    getAddressFromParts(addressParts);
  const email = String(input.email || (user && user.email) || metadata.email || "").trim();
  const fullName = String(input.full_name || input.fullName || input.name || metadata.full_name || metadata.name || "").trim();

  return {
    id: String(input.id || (user && user.id) || "").trim(),
    full_name: fullName || (email ? email.split("@")[0] : "Customer"),
    name: fullName || (email ? email.split("@")[0] : "Customer"),
    email,
    phone: String(input.phone || metadata.phone || "").trim(),
    address,
    shipping_address: address,
    state: addressParts.state,
    area: addressParts.area,
    district: addressParts.district,
    mandal: addressParts.mandal,
    village: addressParts.village,
    houseNumber: addressParts.houseNumber,
    address_parts: addressParts,
    created_at: input.created_at || "",
  };
}

function customerProfileToPayload(profile, user) {
  const normalized = normalizeCustomerProfile(profile, user);

  return {
    id: user.id,
    full_name: normalized.full_name,
    email: normalized.email || user.email || "",
    phone: normalized.phone || null,
    address: normalized.address || "",
    address_parts: normalized.address_parts || {},
  };
}

async function getAuthSession() {
  if (!isConfigured()) {
    return { ok: false, session: null, user: null, reason: "Supabase is not configured." };
  }

  const client = getClient();
  const { data, error } = await client.auth.getSession();

  if (error) {
    return { ok: false, session: null, user: null, error: toSafeMessage(error), details: toSupabaseErrorDetails(error) };
  }

  return { ok: true, session: data.session || null, user: data.session ? data.session.user : null };
}

async function fetchCustomerProfile(user) {
  if (!user) {
    return { ok: false, profile: null, reason: "Missing authenticated user." };
  }

  const client = getClient();
  const { data, error } = await client
    .from(CUSTOMER_PROFILE_TABLE)
    .select("id, full_name, email, phone, address, address_parts, created_at")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    console.warn("[Auth] Customer profile lookup failed", toSupabaseErrorDetails(error));
    return {
      ok: false,
      profile: normalizeCustomerProfile({}, user),
      error: toSafeMessage(error),
      details: toSupabaseErrorDetails(error),
    };
  }

  return { ok: true, profile: normalizeCustomerProfile(data || {}, user) };
}

async function upsertCustomerProfile(profileInput = {}) {
  const sessionResult = await getAuthSession();

  if (!sessionResult.ok || !sessionResult.user) {
    return { ok: false, error: sessionResult.error || "You must be logged in to save account details." };
  }

  const client = getClient();
  const payload = customerProfileToPayload(profileInput, sessionResult.user);
  const { data, error } = await client
    .from(CUSTOMER_PROFILE_TABLE)
    .upsert(payload, { onConflict: "id" })
    .select("id, full_name, email, phone, address, address_parts, created_at")
    .maybeSingle();

  if (error) {
    return { ok: false, error: toSafeMessage(error), details: toSupabaseErrorDetails(error) };
  }

  return { ok: true, profile: normalizeCustomerProfile(data || payload, sessionResult.user) };
}

async function getCurrentAccount() {
  const sessionResult = await getAuthSession();

  if (!sessionResult.ok || !sessionResult.user) {
    return {
      ok: sessionResult.ok,
      session: sessionResult.session || null,
      user: null,
      profile: null,
      error: sessionResult.error || "",
      reason: sessionResult.reason || "not_authenticated",
    };
  }

  const profileResult = await fetchCustomerProfile(sessionResult.user);

  return {
    ok: true,
    session: sessionResult.session,
    user: sessionResult.user,
    profile: profileResult.profile || normalizeCustomerProfile({}, sessionResult.user),
    profileStatus: profileResult.ok ? "loaded" : "fallback",
    profileError: profileResult.error || "",
  };
}

async function claimCustomerOrdersForCurrentUser() {
  const sessionResult = await getAuthSession();

  if (!sessionResult.ok || !sessionResult.user) {
    return { ok: false, claimed: 0, reason: "not_authenticated" };
  }

  try {
    const { data, error } = await getClient().rpc("claim_customer_orders_for_current_user");

    if (error) {
      console.info("[Auth] Order claim RPC unavailable or failed", toSupabaseErrorDetails(error));
      return { ok: false, claimed: 0, error: toSafeMessage(error), details: toSupabaseErrorDetails(error) };
    }

    return { ok: true, claimed: Number(data || 0) };
  } catch (error) {
    return { ok: false, claimed: 0, error: toSafeMessage(error) };
  }
}

async function signUpCustomer({ fullName, email, password, phone, address, addressParts }) {
  if (!isConfigured()) {
    return { ok: false, error: "Supabase is not configured." };
  }

  const profile = normalizeCustomerProfile({
    full_name: fullName,
    email,
    phone,
    address,
    ...(addressParts || {}),
  });

  const { data, error } = await getClient().auth.signUp({
    email: profile.email,
    password,
    options: {
      emailRedirectTo: getAuthRedirectUrl("login"),
      data: {
        full_name: profile.full_name,
        phone: profile.phone,
        address: profile.address,
      },
    },
  });

  if (error) {
    return { ok: false, error: toSafeMessage(error), details: toSupabaseErrorDetails(error) };
  }

  if (data.session && data.user) {
    const savedProfile = await upsertCustomerProfile(profile);
    await claimCustomerOrdersForCurrentUser();

    return {
      ok: true,
      session: data.session,
      user: data.user,
      profile: savedProfile.profile || profile,
      requiresEmailConfirmation: false,
    };
  }

  return {
    ok: true,
    session: data.session || null,
    user: data.user || null,
    profile,
    requiresEmailConfirmation: true,
  };
}

async function signInCustomer({ email, password }) {
  if (!isConfigured()) {
    return { ok: false, error: "Supabase is not configured." };
  }

  const { data, error } = await getClient().auth.signInWithPassword({
    email: String(email || "").trim(),
    password,
  });

  if (error) {
    return { ok: false, error: toSafeMessage(error), details: toSupabaseErrorDetails(error) };
  }

  const account = await getCurrentAccount();
  await claimCustomerOrdersForCurrentUser();

  return {
    ok: true,
    session: data.session,
    user: data.user,
    profile: account.profile,
  };
}

async function signOutCustomer() {
  if (!isConfigured()) {
    return { ok: true };
  }

  const { error } = await getClient().auth.signOut();

  if (error) {
    return { ok: false, error: toSafeMessage(error), details: toSupabaseErrorDetails(error) };
  }

  return { ok: true };
}

async function sendPasswordReset(email) {
  if (!isConfigured()) {
    return { ok: false, error: "Supabase is not configured." };
  }

  const { error } = await getClient().auth.resetPasswordForEmail(String(email || "").trim(), {
    redirectTo: getAuthRedirectUrl("reset"),
  });

  if (error) {
    return { ok: false, error: toSafeMessage(error), details: toSupabaseErrorDetails(error) };
  }

  return { ok: true };
}

async function updatePassword(password) {
  if (!isConfigured()) {
    return { ok: false, error: "Supabase is not configured." };
  }

  const { data, error } = await getClient().auth.updateUser({ password });

  if (error) {
    return { ok: false, error: toSafeMessage(error), details: toSupabaseErrorDetails(error) };
  }

  return { ok: true, user: data.user || null };
}

function onAuthStateChange(callback) {
  if (!isConfigured()) {
    return { data: { subscription: { unsubscribe() {} } } };
  }

  return getClient().auth.onAuthStateChange(callback);
}

function toSafeMessage(error) {
  if (!error) {
    return "Unexpected error.";
  }

  if (typeof error === "string") {
    return error;
  }

  if (error.message) {
    return String(error.message);
  }

  return "Unexpected error.";
}

function toSupabaseErrorDetails(error) {
  if (!error) {
    return null;
  }

  if (typeof error === "string") {
    return { message: error };
  }

  return {
    status: error.status || (error.context && error.context.status) || "",
    statusText: error.statusText || (error.context && error.context.statusText) || "",
    message: toSafeMessage(error),
    code: error.code || "",
    details: error.details || "",
    hint: error.hint || "",
    raw: error,
  };
}

function toDebugError(error) {
  const details = toSupabaseErrorDetails(error);

  if (!details) {
    return null;
  }

  return {
    status: details.status || "",
    statusText: details.statusText || "",
    code: details.code || "",
    message: details.message || "",
    details: details.details || "",
    hint: details.hint || "",
  };
}

function toJsonSafe(value) {
  if (value === undefined) {
    return null;
  }

  try {
    return JSON.parse(JSON.stringify(value));
  } catch (error) {
    return { value: String(value) };
  }
}

async function logCheckoutDebug({ step, payload, error }) {
  if (!isConfigured()) {
    return { ok: false, skipped: true, reason: "Supabase is not configured." };
  }

  const debugRow = {
    step: String(step || "unknown").slice(0, 200),
    payload: toJsonSafe(payload) || {},
    error: toDebugError(error) || toJsonSafe(error) || null,
  };

  try {
    console.info("[CheckoutDebug] Writing checkout_debug_logs", debugRow);
    const { error: insertError, status, statusText } = await getClient()
      .from("checkout_debug_logs")
      .insert(debugRow);

    if (insertError) {
      console.warn("[CheckoutDebug] checkout_debug_logs insert failed", {
        status,
        statusText,
        error: toDebugError({ ...insertError, status, statusText }),
      });
      return { ok: false, error: toSafeMessage(insertError), details: toDebugError({ ...insertError, status, statusText }) };
    }

    return { ok: true };
  } catch (debugError) {
    console.warn("[CheckoutDebug] checkout_debug_logs insert threw", toDebugError(debugError));
    return { ok: false, error: toSafeMessage(debugError), details: toDebugError(debugError) };
  }
}

function isMissingColumnError(errorDetails, columnName) {
  if (!errorDetails) return false;
  const message = String(errorDetails.message || "");
  return message.includes(`'${columnName}'`) && message.toLowerCase().includes("could not find");
}

function isMissingTableError(errorDetails, tableName) {
  if (!errorDetails) return false;
  const message = String(errorDetails.message || "");
  return message.includes(`table`) && message.includes(tableName) && message.toLowerCase().includes("could not find");
}

function isMissingFunctionError(errorDetails, fnName) {
  if (!errorDetails) return false;
  const message = String(errorDetails.message || "");
  return message.includes(fnName) && message.toLowerCase().includes("could not find function");
}

async function insertWithFallback({ client, table, payloads, select }) {
  let lastError = null;

  for (let index = 0; index < payloads.length; index += 1) {
    const payload = payloads[index];
    try {
      console.info("[Supabase] Insert attempt", {
        table,
        variant: index + 1,
        variants: payloads.length,
        columns: Object.keys(payload),
      });
      const query = client.from(table).insert(payload);
      const response = select ? await query.select(select).single() : await query;
      const { data, error, status, statusText } = response;

      if (!error) {
        return { ok: true, data, usedIndex: index };
      }

      const details = toSupabaseErrorDetails({ ...error, status, statusText });
      lastError = details;
      console.warn(`[Supabase] Insert into ${table} failed (variant ${index + 1}/${payloads.length})`, details);
    } catch (error) {
      lastError = toSupabaseErrorDetails(error);
      console.warn(`[Supabase] Insert into ${table} threw (variant ${index + 1}/${payloads.length})`, error);
    }
  }

  console.error("[SUPABASE INSERT FAILED]", {
    table,
    variants: payloads.length,
    lastError,
  });
  return { ok: false, error: toSafeMessage(lastError), details: lastError };
}

function normalizeStatus(value) {
  if (!value) {
    return "Order Confirmed";
  }

  const raw = String(value).trim();

  // Backwards-compat: older local-only statuses.
  if (raw === "Confirmed") {
    return "Order Confirmed";
  }

  const lower = raw.toLowerCase();
  if (lower === "pending" || lower === "processing") {
    return "Processing";
  }
  if (lower === "shipped") {
    return "Shipped";
  }
  if (lower === "delivered") {
    return "Delivered";
  }
  if (lower === "cancelled" || lower === "canceled") {
    return "Cancelled";
  }

  if (ORDER_STATUSES.includes(raw)) {
    return raw;
  }

  return "Order Confirmed";
}

function buildOrderLikeObject({ orderDraft, paymentId, customer, statusEvents, orderItems, orderAtIso }) {
  const createdAtIso = orderAtIso || (orderDraft && orderDraft.createdAt) || new Date().toISOString();
  const createdAt = new Date(createdAtIso);

  const items = Array.isArray(orderItems)
    ? orderItems.map((item) => ({
        id: item.product_id || item.productId || item.id || null,
        name: item.name || "",
        category: item.category || "",
        image: item.image || "",
        price: Number(item.unit_price ?? item.unitPrice ?? item.price ?? 0),
        quantity: Number(item.quantity ?? 1),
        lineTotal: Number(item.line_total ?? item.lineTotal ?? 0),
      }))
    : Array.isArray(orderDraft && orderDraft.items)
      ? orderDraft.items
      : [];

  const subtotal = Number(orderDraft && orderDraft.subtotal) || items.reduce((sum, item) => sum + Number(item.lineTotal || 0), 0);
  const totalAmount = Number(orderDraft && orderDraft.totalAmount) || Number(orderDraft && orderDraft.total_amount) || subtotal;

  const statusHistory = Array.isArray(statusEvents)
    ? statusEvents
        .map((event) => ({
          status: normalizeStatus(event.status),
          at: event.at || event.created_at || event.createdAt || createdAtIso,
        }))
        .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
    : [
        {
          status: normalizeStatus(orderDraft && orderDraft.status),
          at: createdAtIso,
        },
      ];

  const buyer = customer || (orderDraft && orderDraft.buyer) || {};

  return {
    ...(orderDraft || {}),
    id: (orderDraft && orderDraft.id) || (orderDraft && orderDraft.order_id) || "",
    status: normalizeStatus((orderDraft && orderDraft.status) || (orderDraft && orderDraft.order_status)),
    createdAt: createdAtIso,
    orderDate:
      (orderDraft && orderDraft.orderDate) ||
      new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(createdAt),
    orderTime:
      (orderDraft && orderDraft.orderTime) ||
      new Intl.DateTimeFormat("en-IN", { hour: "2-digit", minute: "2-digit" }).format(createdAt),
    estimatedDeliveryDate:
      (orderDraft && orderDraft.estimatedDeliveryDate) ||
      new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(
        new Date(createdAt.getTime() + 5 * 24 * 60 * 60 * 1000)
      ),
    payment: {
      provider: "Razorpay",
      id: paymentId || (orderDraft && orderDraft.payment && orderDraft.payment.id) || (orderDraft && orderDraft.payment_id) || "not available",
      status: paymentId ? "Paid" : (orderDraft && orderDraft.payment && orderDraft.payment.status) || "Paid",
    },
    buyer: {
      name: buyer.name || "Customer",
      email: buyer.email || "",
      phone: buyer.phone || "",
      address: buyer.address || "",
      addressParts: Array.isArray(buyer.address_parts) ? buyer.address_parts : Array.isArray(buyer.addressParts) ? buyer.addressParts : [],
      state: buyer.state || "",
      district: buyer.district || "",
    },
    items,
    totalQuantity: items.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
    subtotal,
    shippingCharge: Number(orderDraft && orderDraft.shippingCharge) || 0,
    totalAmount,
    supportEmail: (orderDraft && orderDraft.supportEmail) || "tech.aaruni@gmail.com",
    trackingUrl:
      (orderDraft && orderDraft.trackingUrl) ||
      `${window.location.origin}${window.location.pathname.replace(/index\\.html$/, "")}track-order.html?order_id=${encodeURIComponent(
        (orderDraft && orderDraft.id) || ""
      )}`,
    statusHistory,
  };
}

function parseOrderProducts(productName, quantity, totalPrice) {
  const productsText = String(productName || "").trim();
  if (!productsText) {
    return [];
  }

  const entries = productsText.split(",").map((entry) => entry.trim()).filter(Boolean);
  const fallbackQuantity = Number(quantity || 1);
  const fallbackLineTotal = Number(totalPrice || 0);

  return entries.map((entry, index) => {
    const match = entry.match(/^(.*)\s+x\s+(\d+)$/i);
    const itemQuantity = match ? Number(match[2]) : fallbackQuantity;
    const itemName = match ? match[1].trim() : entry;

    return {
      id: null,
      name: itemName || "Product",
      category: "",
      image: "",
      price: itemQuantity > 0 && entries.length === 1 ? fallbackLineTotal / itemQuantity : 0,
      quantity: itemQuantity > 0 ? itemQuantity : 1,
      lineTotal: entries.length === 1 ? fallbackLineTotal : 0,
      sortIndex: index,
    };
  });
}

function parseJsonOrderProducts(products, totalAmount) {
  if (!Array.isArray(products)) {
    return [];
  }

  return products
    .map((item, index) => {
      const itemQuantity = Number(item.quantity || 0);
      const itemPrice = Number(item.price || 0);
      const lineTotal = Number(item.line_total || item.lineTotal || (itemPrice * itemQuantity));

      return {
        id: item.product_id || item.id || null,
        name: item.name || item.product_name || "Product",
        category: "",
        image: "",
        price: itemQuantity > 0 && !itemPrice && products.length === 1 ? Number(totalAmount || 0) / itemQuantity : itemPrice,
        quantity: itemQuantity > 0 ? itemQuantity : 1,
        lineTotal: lineTotal || (products.length === 1 ? Number(totalAmount || 0) : 0),
        sortIndex: index,
      };
    })
    .filter((item) => item.name);
}

function orderFromFlatOrderRow(row) {
  const createdAtIso = row.created_at || new Date().toISOString();
  const totalAmount = Number(row.total_price ?? row.total_amount ?? 0);
  const jsonItems = parseJsonOrderProducts(row.products, totalAmount);
  const items = jsonItems.length ? jsonItems : parseOrderProducts(row.product_name, row.quantity, totalAmount);
  const status = normalizeStatus(row.order_status || row.status || "Order Confirmed");

  return buildOrderLikeObject({
    orderDraft: {
      id: row.order_id || row.id,
      status,
      subtotal: totalAmount,
      totalAmount,
      createdAt: createdAtIso,
      payment: {
        id: row.payment_id || "not available",
        provider: "Razorpay",
        status: row.payment_status || "Paid",
      },
      buyer: {
        name: row.customer_name || "Customer",
        email: row.customer_email || "",
        phone: row.phone || "",
        address: row.shipping_address || "",
        addressParts: [],
      },
      items,
    },
    paymentId: row.payment_id || "not available",
    customer: {
      name: row.customer_name || "Customer",
      email: row.customer_email || "",
      phone: row.phone || "",
      address: row.shipping_address || "",
      addressParts: [],
    },
    statusEvents: [{ status, at: createdAtIso }],
    orderItems: items,
    orderAtIso: createdAtIso,
  });
}

function normalizeRpcOrderPayload(rpcOrder) {
  if (Array.isArray(rpcOrder)) {
    return rpcOrder[0] || null;
  }

  return rpcOrder || null;
}

function buildProductsJsonbPayload(items) {
  const products = (Array.isArray(items) ? items : [])
    .map((item) => ({
      product_id: String(item.id || "").trim(),
      id: String(item.id || "").trim(),
      name: String(item.name || "").trim(),
      quantity: Number(item.quantity || 0),
      price: Number(item.price || 0),
      line_total: Number(item.lineTotal || 0),
    }))
    .filter((item) => item.product_id && item.quantity > 0);

  return JSON.parse(JSON.stringify(products));
}

function getOrderPaymentId(order) {
  return String((order && order.payment && order.payment.id) || order.paymentId || order.payment_id || "").trim();
}

function getOrderEmailNotificationKey(order) {
  const orderId = String((order && order.id) || order.order_id || "").trim();
  const paymentId = getOrderPaymentId(order);

  return orderId && paymentId ? `${orderId}:${paymentId}` : "";
}

function delay(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function hasStoredOrderEmailNotification(key) {
  if (!key) return false;

  try {
    return window.localStorage.getItem(`${ORDER_EMAIL_STORAGE_PREFIX}${key}`) === "sent";
  } catch (error) {
    return false;
  }
}

function storeOrderEmailNotification(key) {
  if (!key) return;

  try {
    window.localStorage.setItem(`${ORDER_EMAIL_STORAGE_PREFIX}${key}`, "sent");
  } catch (error) {
    // Storage can be unavailable in private browsing; server idempotency still protects sends.
  }
}

function buildOrderNotificationPayload(order) {
  const items = Array.isArray(order && order.items)
    ? order.items.map((item) => ({
        id: String(item.id || item.product_id || "").trim(),
        name: String(item.name || "Product").trim(),
        quantity: Number(item.quantity || 0),
        price: Number(item.price || 0),
        line_total: Number(item.lineTotal ?? item.line_total ?? 0),
      }))
    : [];

  return {
    order: {
      id: String((order && order.id) || order.order_id || "").trim(),
      created_at: (order && (order.createdAt || order.created_at)) || new Date().toISOString(),
      order_date: (order && order.orderDate) || "",
      order_time: (order && order.orderTime) || "",
      customer: {
        name: String((order && order.buyer && order.buyer.name) || order.customer_name || "Customer").trim(),
        email: String((order && order.buyer && order.buyer.email) || order.customer_email || "").trim(),
        phone: String((order && order.buyer && order.buyer.phone) || order.phone || "").trim(),
        shipping_address: String(
          (order && order.buyer && order.buyer.address) ||
            order.shipping_address ||
            ""
        ).trim(),
      },
      payment: {
        id: getOrderPaymentId(order),
        status: String((order && order.payment && order.payment.status) || order.payment_status || "Paid").trim(),
      },
      environment: {
        mode: normalizeRuntimeMode(
          (order && order.environment && order.environment.mode) ||
            order.environment_mode ||
            (order && order.payment && order.payment.mode === "test" ? "test" : "production")
        ),
      },
      items,
      total_quantity: Number((order && order.totalQuantity) || order.quantity || 0),
      total_amount: Number((order && order.totalAmount) || order.total_amount || order.total_price || 0),
    },
  };
}

function summarizeOrderNotificationPayload(payload) {
  const order = payload && payload.order ? payload.order : {};
  const customer = order.customer || {};
  const payment = order.payment || {};
  const items = Array.isArray(order.items) ? order.items : [];

  return {
    orderId: order.id || "",
    paymentId: payment.id || "",
    paymentStatus: payment.status || "",
    customerEmail: customer.email || "",
    customerPhonePresent: Boolean(customer.phone),
    shippingAddressPresent: Boolean(customer.shipping_address),
    itemCount: items.length,
    totalQuantity: order.total_quantity || 0,
    totalAmount: order.total_amount || 0,
  };
}

async function sendOrderNotificationEmail(order) {
  if (!isConfigured()) {
    await logCheckoutDebug({
      step: "email_supabase_not_configured",
      payload: { orderId: order && order.id, paymentId: getOrderPaymentId(order) },
      error: "Supabase is not configured.",
    });
    return { ok: false, skipped: true, reason: "Supabase is not configured." };
  }

  const notificationKey = getOrderEmailNotificationKey(order);
  const orderId = String((order && order.id) || order.order_id || "").trim();
  const paymentId = getOrderPaymentId(order);
  const paymentStatus = String((order && order.payment && order.payment.status) || order.payment_status || "").toLowerCase();

  if (!orderId || !paymentId || paymentId === "not available") {
    await logCheckoutDebug({
      step: "email_missing_order_or_payment_id",
      payload: { orderId, paymentId },
      error: "Missing order ID or payment ID for email notification.",
    });
    return { ok: false, skipped: true, reason: "Missing order ID or payment ID for email notification." };
  }

  if (paymentStatus && paymentStatus !== "paid") {
    await logCheckoutDebug({
      step: "email_payment_not_paid",
      payload: { orderId, paymentId, paymentStatus },
      error: `Payment status is ${paymentStatus}.`,
    });
    return { ok: false, skipped: true, reason: `Payment status is ${paymentStatus}.` };
  }

  if (hasStoredOrderEmailNotification(notificationKey)) {
    return {
      ok: true,
      complete: true,
      skipped: true,
      duplicate: true,
      adminEmailSent: true,
      customerEmailSent: true,
      reason: "Order notification already sent from this browser.",
    };
  }

  const client = getClient();
  const payload = buildOrderNotificationPayload(order);
  const functionUrl = getOrderEmailFunctionUrl();

  console.log("[STEP 5] Triggering email function");
  console.info("[OrderEmail] Invoking send-order-notification", {
    orderId,
    paymentId,
    functionName: ORDER_EMAIL_FUNCTION_NAME,
    functionUrl,
    payload: summarizeOrderNotificationPayload(payload),
  });

  let lastFailure = null;

  for (let attempt = 1; attempt <= ORDER_EMAIL_INVOKE_MAX_ATTEMPTS; attempt += 1) {
    console.info("[Edge Function invoke]", {
      orderId,
      paymentId,
      functionName: ORDER_EMAIL_FUNCTION_NAME,
      functionUrl,
      attempt,
      maxAttempts: ORDER_EMAIL_INVOKE_MAX_ATTEMPTS,
    });

    try {
      const { data, error } = await client.functions.invoke(ORDER_EMAIL_FUNCTION_NAME, {
        body: payload,
      });

      if (error) {
        const status = error && error.context && error.context.status ? Number(error.context.status) : 0;
        const details = toSupabaseErrorDetails(error);
        lastFailure = { ok: false, error: toSafeMessage(error), details, status };

        console.error("[OrderEmail] send-order-notification returned error", {
          orderId,
          paymentId,
          functionName: ORDER_EMAIL_FUNCTION_NAME,
          functionUrl,
          attempt,
          status,
          details,
        });
        console.error("[EMAIL FAILED]", {
          orderId,
          paymentId,
          stage: "edge_function_invoke",
          attempt,
          status,
          details,
        });
        await logCheckoutDebug({
          step: "edge_function_invoke_failed",
          payload: { orderId, paymentId, functionName: ORDER_EMAIL_FUNCTION_NAME, functionUrl, attempt, status },
          error: { ...details, status },
        });

        if (status === 404) {
          return {
            ok: false,
            skipped: true,
            reason: "Order email Edge Function is not deployed.",
            details,
          };
        }

        if (attempt < ORDER_EMAIL_INVOKE_MAX_ATTEMPTS) {
          await delay(ORDER_EMAIL_RETRY_DELAY_MS * attempt);
          continue;
        }

        return lastFailure;
      }

      console.info("[OrderEmail] send-order-notification response", {
        orderId,
        paymentId,
        functionName: ORDER_EMAIL_FUNCTION_NAME,
        attempt,
        data,
      });

      if (data && (data.ok || data.duplicate) && data.complete !== false) {
        if (data.adminEmailSent) {
          console.log("[STEP 6] Admin email sent");
        }
        if (data.customerEmailSent) {
          console.log("[STEP 7] Customer email sent");
        }
        storeOrderEmailNotification(notificationKey);
        return data;
      }

      lastFailure = data || { ok: false, error: "Empty email function response." };
      console.error("[EMAIL FAILED]", {
        orderId,
        paymentId,
        stage: "edge_function_response",
        attempt,
        result: lastFailure,
      });
      await logCheckoutDebug({
        step: "edge_function_incomplete_response",
        payload: { orderId, paymentId, functionName: ORDER_EMAIL_FUNCTION_NAME, functionUrl, attempt },
        error: lastFailure,
      });

      if (attempt < ORDER_EMAIL_INVOKE_MAX_ATTEMPTS) {
        await delay(ORDER_EMAIL_RETRY_DELAY_MS * attempt);
        continue;
      }

      return lastFailure;
    } catch (error) {
      lastFailure = { ok: false, error: toSafeMessage(error), details: toSupabaseErrorDetails(error) };
      console.error("[OrderEmail] send-order-notification threw", {
        orderId,
        paymentId,
        functionName: ORDER_EMAIL_FUNCTION_NAME,
        functionUrl,
        attempt,
        error: toSafeMessage(error),
        details: toSupabaseErrorDetails(error),
      });
      console.error("[EMAIL FAILED]", {
        orderId,
        paymentId,
        stage: "edge_function_throw",
        attempt,
        error: toSafeMessage(error),
      });
      await logCheckoutDebug({
        step: "edge_function_throw",
        payload: { orderId, paymentId, functionName: ORDER_EMAIL_FUNCTION_NAME, functionUrl, attempt },
        error,
      });

      if (attempt < ORDER_EMAIL_INVOKE_MAX_ATTEMPTS) {
        await delay(ORDER_EMAIL_RETRY_DELAY_MS * attempt);
      }
    }
  }

  return lastFailure || { ok: false, error: "Order email Edge Function failed after retries." };
}

async function saveDirectOrderToTable({ client, tableName, orderDraft, paymentId, account, buyer, createdAtIso, runtimeMode }) {
  const items = Array.isArray(orderDraft.items) ? orderDraft.items : [];
  const productsText = items
    .map((item) => `${item.name || "Product"} x ${Number(item.quantity || 1)}`)
    .filter(Boolean)
    .join(", ");
  const productsJson = buildProductsJsonbPayload(items);
  const totalQty = items.reduce((sum, item) => sum + Number(item.quantity || 0), 0) || Number(orderDraft.totalQuantity || 0) || 1;
  const gst = orderDraft.gst || {};
  const commercePayload = {
    environment_mode: runtimeMode,
    shipping_fee: Number(orderDraft.shippingFee ?? orderDraft.shippingCharge ?? 0),
    gst_enabled: Boolean(gst.enabled),
    gst_percent: Number(gst.percent || 0),
    gst_amount: Number(orderDraft.gstAmount ?? gst.amount ?? 0),
  };
  const basePayload = {
    customer_name: buyer.name || "Customer",
    customer_email: buyer.email || null,
    phone: buyer.phone || null,
    product_name: productsText || "Cart items",
    quantity: totalQty,
    total_price: Number(orderDraft.totalAmount || 0),
    total_amount: Number(orderDraft.totalAmount || 0),
    subtotal: Number(orderDraft.subtotal || orderDraft.totalAmount || 0),
    products: productsJson,
    cart_items: productsJson,
    shipping_address: buyer.address || "",
    payment_id: paymentId || (orderDraft.payment && orderDraft.payment.id) || "",
    payment_status: paymentId ? "Paid" : "Pending",
    order_id: orderDraft.id,
    user_id: account.user.id,
    db_saved: true,
    admin_email_sent: false,
    customer_email_sent: false,
  };
  const status = runtimeMode === "test" ? "Processing" : normalizeStatus(orderDraft.status || "Order Confirmed");
  const liveSchemaPayload = {
    user_id: basePayload.user_id,
    customer_name: basePayload.customer_name,
    customer_email: basePayload.customer_email,
    phone: basePayload.phone,
    shipping_address: basePayload.shipping_address,
    payment_id: basePayload.payment_id,
    payment_status: basePayload.payment_status,
    order_status: status,
    order_id: basePayload.order_id,
    products: productsJson,
    total_amount: Number(orderDraft.totalAmount || 0),
    db_saved: true,
    admin_email_sent: false,
    customer_email_sent: false,
  };

  console.info("[Supabase] Trying direct order insert", {
    tableName,
    runtimeMode,
    productsText,
    totalQty,
    totalPrice: Number(orderDraft.totalAmount || 0),
  });

  const insert = await insertWithFallback({
    client,
    table: tableName,
    payloads: [
      { ...basePayload, ...commercePayload, order_status: status, status },
      { ...liveSchemaPayload, ...commercePayload, status },
      { ...basePayload, order_status: status, status },
      liveSchemaPayload,
    ],
  });

  if (!insert.ok) {
    console.error("[SUPABASE INSERT FAILED]", {
      table: tableName,
      orderId: basePayload.order_id,
      paymentId: basePayload.payment_id,
      details: insert.details || insert.error || null,
    });
    await logCheckoutDebug({
      step: `${tableName}_direct_insert_failed`,
      payload: { paymentId: basePayload.payment_id, orderId: basePayload.order_id, tableName, runtimeMode },
      error: insert.details || insert.error || `${tableName} insert failed`,
    });
    return { ok: false, error: insert.error || `${tableName} insert failed`, details: insert.details };
  }

  const orderAtIso = createdAtIso;
  const orderAtDate = new Date(orderAtIso);
  const upgradedOrder = {
    ...orderDraft,
    id: basePayload.order_id,
    invoiceNumber: orderDraft.invoiceNumber || `INV-${basePayload.order_id}`,
    status,
    db_saved: true,
    admin_email_sent: false,
    customer_email_sent: false,
    createdAt: orderAtIso,
    orderDate: new Intl.DateTimeFormat("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(orderAtDate),
    orderTime: new Intl.DateTimeFormat("en-IN", { hour: "2-digit", minute: "2-digit" }).format(orderAtDate),
    subtotal: Number(orderDraft.subtotal || 0),
    totalAmount: Number(orderDraft.totalAmount || 0),
    payment: {
      provider: "Razorpay",
      id: paymentId || (orderDraft.payment && orderDraft.payment.id) || "not available",
      status: paymentId ? "Paid" : "Pending",
      mode: runtimeMode === "test" ? "test" : "live",
    },
    environment: {
      mode: runtimeMode,
      label: runtimeMode === "test" ? "TEST MODE" : "LIVE MODE",
      isTest: runtimeMode === "test",
    },
    statusHistory: [
      {
        status,
        at: orderAtIso,
      },
    ],
    backend: {
      provider: "supabase",
      schema: tableName,
      orderRowId: null,
      userId: account.user.id,
    },
  };

  console.info("[ORDER SAVED]", {
    orderId: upgradedOrder.id,
    paymentId: upgradedOrder.payment.id,
    schema: upgradedOrder.backend.schema,
    db_saved: upgradedOrder.db_saved,
    admin_email_sent: upgradedOrder.admin_email_sent,
    customer_email_sent: upgradedOrder.customer_email_sent,
  });
  console.log("[STEP 4] Order inserted into Supabase");

  return { ok: true, order: upgradedOrder };
}

async function saveOrderAfterPayment({ orderDraft, paymentId }) {
  console.log("[STEP 3] Starting saveOrderAfterPayment");

  if (!isConfigured()) {
    console.warn("[Supabase] Not configured", {
      url: window.SUPABASE_URL || "",
      anonKeyPresent: Boolean(window.SUPABASE_ANON_KEY),
    });
    await logCheckoutDebug({
      step: "save_order_supabase_not_configured",
      payload: { paymentId, orderId: orderDraft && orderDraft.id, supabaseUrl: window.SUPABASE_URL || "", anonKeyPresent: Boolean(window.SUPABASE_ANON_KEY) },
      error: "Supabase is not configured.",
    });
    return {
      ok: false,
      skipped: true,
      reason: "Supabase is not configured.",
      debug: { supabaseUrl: window.SUPABASE_URL || "", anonKeyPresent: Boolean(window.SUPABASE_ANON_KEY) },
    };
  }

  if (!orderDraft) {
    await logCheckoutDebug({
      step: "save_order_missing_order_draft",
      payload: { paymentId },
      error: "Missing order draft.",
    });
    return { ok: false, error: "Missing order draft." };
  }

  const client = getClient();
  const account = await getCurrentAccount();

  if (!account.user) {
    await logCheckoutDebug({
      step: "save_order_auth_required",
      payload: { paymentId, orderId: orderDraft.id },
      error: "Login is required before checkout.",
    });
    return { ok: false, error: "Login is required before checkout.", code: "auth_required" };
  }

  try {
    const accountProfile = account.profile || {};
    const buyer = {
      ...(orderDraft.buyer || {}),
      name: accountProfile.full_name || accountProfile.name || (orderDraft.buyer && orderDraft.buyer.name) || "Customer",
      email: accountProfile.email || (orderDraft.buyer && orderDraft.buyer.email) || "",
      phone: accountProfile.phone || (orderDraft.buyer && orderDraft.buyer.phone) || "",
      address: accountProfile.address || (orderDraft.buyer && orderDraft.buyer.address) || "",
    };
    const createdAtIso = orderDraft.createdAt || new Date().toISOString();
    const runtimeMode = getRuntimeMode();
    const targetOrderTable = getOrderSourceTable();

    console.info("[Supabase] saveOrderAfterPayment start", {
      paymentId,
      draftId: orderDraft.id,
      runtimeMode,
      targetOrderTable,
      userId: account.user.id,
      items: Array.isArray(orderDraft.items) ? orderDraft.items.length : 0,
      buyer: {
        name: buyer.name,
        email: buyer.email,
        phone: buyer.phone,
      },
    });

    if (runtimeMode === "test") {
      return saveDirectOrderToTable({
        client,
        tableName: "test_orders",
        orderDraft,
        paymentId,
        account,
        buyer,
        createdAtIso,
        runtimeMode,
      });
    }

    // Best-effort: store customer profile in `users` if the ecommerce schema is installed.
    // This is optional and safe to ignore if the table doesn't exist or RLS blocks it.
    try {
      const userInsert = await insertWithFallback({
        client,
        table: "users",
        payloads: [
          {
            id: account.user.id,
            full_name: buyer.name || "Customer",
            email: buyer.email || null,
            phone: buyer.phone || null,
            shipping_address: buyer.address || "",
          },
          {
            id: account.user.id,
            name: buyer.name || "Customer",
            email: buyer.email || null,
            phone: buyer.phone || null,
            shipping_address: buyer.address || "",
          },
        ],
      });

      if (userInsert.ok) {
        console.info("[Supabase] users insert ok", { variant: userInsert.usedIndex });
      }
    } catch (error) {
      console.warn("[Supabase] users insert threw", error);
    }

    // Prefer the stock-safe cart RPC if present (orders v2).
    try {
      const items = Array.isArray(orderDraft.items) ? orderDraft.items : [];
      const productsJson = buildProductsJsonbPayload(items);

      if (productsJson.length) {
        const rpcPayload = {
          p_customer_email: buyer.email || "",
          p_customer_name: buyer.name || "Customer",
          p_order_id: orderDraft.id,
          p_payment_id: paymentId || (orderDraft.payment && orderDraft.payment.id) || "",
          p_payment_status: paymentId ? "Paid" : "Pending",
          p_phone: buyer.phone || "",
          p_products: productsJson,
          p_shipping_address: buyer.address || "",
          p_total_amount: Number(orderDraft.totalAmount || 0),
          p_user_id: account.user.id,
        };

        console.info("[Supabase] Calling RPC place_order_cart", {
          ...rpcPayload,
          p_products_json: JSON.stringify(productsJson),
        });
        let rpcResponse = await client.rpc("place_order_cart", rpcPayload);

        if (rpcResponse.error && isMissingFunctionError(toSupabaseErrorDetails(rpcResponse.error), "place_order_cart")) {
          const { p_user_id: _userId, ...legacyRpcPayload } = rpcPayload;
          console.warn("[Supabase] Retrying legacy place_order_cart RPC without p_user_id");
          rpcResponse = await client.rpc("place_order_cart", legacyRpcPayload);
        }

        const rpcOrder = normalizeRpcOrderPayload(rpcResponse.data);
        const rpcError = rpcResponse.error;

        if (!rpcError && rpcOrder && rpcOrder.order_id) {
          console.info("[Supabase] RPC place_order_cart ok", { rpcOrder });
          const orderId = rpcOrder.order_id;
          const orderAt = rpcOrder.created_at || createdAtIso;
          const orderAtIso = new Date(orderAt).toISOString();
          const orderAtDate = new Date(orderAtIso);

          const upgradedOrder = {
            ...orderDraft,
            id: orderId,
            invoiceNumber: orderDraft.invoiceNumber || `INV-${orderId}`,
            status: normalizeStatus(rpcOrder.order_status || "Order Confirmed"),
            db_saved: true,
            admin_email_sent: Boolean(rpcOrder.admin_email_sent),
            customer_email_sent: Boolean(rpcOrder.customer_email_sent),
            createdAt: orderAtIso,
            orderDate: new Intl.DateTimeFormat("en-IN", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            }).format(orderAtDate),
            orderTime: new Intl.DateTimeFormat("en-IN", { hour: "2-digit", minute: "2-digit" }).format(orderAtDate),
            subtotal: Number(rpcOrder.total_price || orderDraft.subtotal || 0),
            totalAmount: Number(rpcOrder.total_price || orderDraft.totalAmount || 0),
            payment: {
              provider: "Razorpay",
              id: paymentId || (orderDraft.payment && orderDraft.payment.id) || "not available",
              status: String(rpcOrder.payment_status || (paymentId ? "Paid" : "Pending")),
            },
            statusHistory: [
              {
                status: normalizeStatus(rpcOrder.order_status || "Order Confirmed"),
                at: orderAtIso,
              },
            ],
            backend: {
              provider: "supabase",
              schema: "orders_v2",
              orderRowId: rpcOrder.id,
              userId: account.user.id,
            },
          };

          console.info("[ORDER SAVED]", {
            orderId,
            paymentId: upgradedOrder.payment.id,
            schema: upgradedOrder.backend.schema,
            db_saved: upgradedOrder.db_saved,
            admin_email_sent: upgradedOrder.admin_email_sent,
            customer_email_sent: upgradedOrder.customer_email_sent,
          });
          console.log("[STEP 4] Order inserted into Supabase");

          return { ok: true, order: upgradedOrder };
        }

        if (rpcError) {
          const details = toSupabaseErrorDetails(rpcError);
          console.warn("[Supabase] RPC place_order_cart failed", details);
          await logCheckoutDebug({
            step: "place_order_cart_rpc_failed",
            payload: { paymentId, orderId: orderDraft.id, rpcPayload },
            error: details,
          });

          if (isMissingFunctionError(details, "place_order_cart")) {
            console.warn("[Supabase] Missing RPC place_order_cart. Install it via SQL migration.");
          }
        }
      }
    } catch (error) {
      console.warn("[Supabase] RPC place_order_cart threw", error);
      await logCheckoutDebug({
        step: "place_order_cart_rpc_threw",
        payload: { paymentId, orderId: orderDraft.id },
        error,
      });
    }

    // If the v2 `orders` table exists but RPC is not installed, at least store the order row (no stock decrement).
    try {
      const items = Array.isArray(orderDraft.items) ? orderDraft.items : [];
      const productsText = items
        .map((item) => `${item.name || "Product"} x ${Number(item.quantity || 1)}`)
        .filter(Boolean)
        .join(", ");
      const productsJson = buildProductsJsonbPayload(items);
      const totalQty = items.reduce((sum, item) => sum + Number(item.quantity || 0), 0) || Number(orderDraft.totalQuantity || 0) || 1;

      console.info("[Supabase] Trying direct insert into v2 orders table (no stock decrement)", {
        productsText,
        totalQty,
        totalPrice: Number(orderDraft.totalAmount || 0),
      });
      const gst = orderDraft.gst || {};
      const commercePayload = {
        environment_mode: runtimeMode,
        shipping_fee: Number(orderDraft.shippingFee ?? orderDraft.shippingCharge ?? 0),
        gst_enabled: Boolean(gst.enabled),
        gst_percent: Number(gst.percent || 0),
        gst_amount: Number(orderDraft.gstAmount ?? gst.amount ?? 0),
      };
      const basePayload = {
        customer_name: buyer.name || "Customer",
        customer_email: buyer.email || null,
        phone: buyer.phone || null,
        product_name: productsText || "Cart items",
        quantity: totalQty,
        total_price: Number(orderDraft.totalAmount || 0),
        total_amount: Number(orderDraft.totalAmount || 0),
        subtotal: Number(orderDraft.subtotal || orderDraft.totalAmount || 0),
        products: productsJson,
        cart_items: productsJson,
        shipping_address: buyer.address || "",
        payment_id: paymentId || (orderDraft.payment && orderDraft.payment.id) || "",
        payment_status: paymentId ? "Paid" : "Pending",
        order_id: orderDraft.id,
        user_id: account.user.id,
        db_saved: true,
        admin_email_sent: false,
        customer_email_sent: false,
      };
      const liveSchemaPayload = {
        user_id: basePayload.user_id,
        customer_name: basePayload.customer_name,
        customer_email: basePayload.customer_email,
        phone: basePayload.phone,
        shipping_address: basePayload.shipping_address,
        payment_id: basePayload.payment_id,
        payment_status: basePayload.payment_status,
        order_status: normalizeStatus(orderDraft.status || "Order Confirmed"),
        order_id: basePayload.order_id,
        products: productsJson,
        total_amount: Number(orderDraft.totalAmount || 0),
        db_saved: true,
        admin_email_sent: false,
        customer_email_sent: false,
      };
      const liveSchemaMinimalPayload = {
        user_id: basePayload.user_id,
        customer_name: basePayload.customer_name,
        customer_email: basePayload.customer_email,
        phone: basePayload.phone,
        shipping_address: basePayload.shipping_address,
        payment_id: basePayload.payment_id,
        payment_status: basePayload.payment_status,
        order_id: basePayload.order_id,
        products: productsJson,
        total_amount: Number(orderDraft.totalAmount || 0),
        db_saved: true,
        admin_email_sent: false,
        customer_email_sent: false,
      };

      const v2Insert = await insertWithFallback({
        client,
        table: "orders",
        payloads: [
          { ...basePayload, ...commercePayload, order_status: normalizeStatus(orderDraft.status || "Order Confirmed") },
          { ...liveSchemaPayload, ...commercePayload },
          { ...liveSchemaMinimalPayload, ...commercePayload },
          { ...basePayload, ...commercePayload, status: normalizeStatus(orderDraft.status || "Order Confirmed") },
          { ...basePayload },
        ],
      });

      if (v2Insert.ok) {
        console.info("[Supabase] v2 orders insert ok", { usedIndex: v2Insert.usedIndex });
        const orderAtIso = createdAtIso;
        const orderAtDate = new Date(orderAtIso);
        const upgradedOrder = {
          ...orderDraft,
          id: basePayload.order_id,
          invoiceNumber: orderDraft.invoiceNumber || `INV-${basePayload.order_id}`,
          status: normalizeStatus(orderDraft.status || "Order Confirmed"),
          db_saved: true,
          admin_email_sent: false,
          customer_email_sent: false,
          createdAt: orderAtIso,
          orderDate: new Intl.DateTimeFormat("en-IN", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          }).format(orderAtDate),
          orderTime: new Intl.DateTimeFormat("en-IN", { hour: "2-digit", minute: "2-digit" }).format(orderAtDate),
          subtotal: Number(orderDraft.subtotal || 0),
          totalAmount: Number(orderDraft.totalAmount || 0),
          payment: {
            provider: "Razorpay",
            id: paymentId || (orderDraft.payment && orderDraft.payment.id) || "not available",
            status: paymentId ? "Paid" : "Pending",
          },
          statusHistory: [
            {
              status: normalizeStatus(orderDraft.status || "Order Confirmed"),
              at: orderAtIso,
            },
          ],
          backend: {
            provider: "supabase",
            schema: "orders_v2_no_stock",
            orderRowId: null,
            userId: account.user.id,
          },
        };

        console.info("[ORDER SAVED]", {
          orderId: upgradedOrder.id,
          paymentId: upgradedOrder.payment.id,
          schema: upgradedOrder.backend.schema,
          db_saved: upgradedOrder.db_saved,
          admin_email_sent: upgradedOrder.admin_email_sent,
          customer_email_sent: upgradedOrder.customer_email_sent,
        });
        console.log("[STEP 4] Order inserted into Supabase");

        return { ok: true, order: upgradedOrder };
      }
      console.error("[SUPABASE INSERT FAILED]", {
        table: "orders",
        orderId: basePayload.order_id,
        paymentId: basePayload.payment_id,
        details: v2Insert.details || v2Insert.error || null,
      });
      await logCheckoutDebug({
        step: "orders_direct_insert_failed",
        payload: { paymentId: basePayload.payment_id, orderId: basePayload.order_id },
        error: v2Insert.details || v2Insert.error || "orders insert failed",
      });
    } catch (error) {
      console.warn("[Supabase] v2 orders insert threw", error);
      console.error("[SUPABASE INSERT FAILED]", {
        table: "orders",
        orderId: orderDraft.id,
        paymentId,
        error: toSafeMessage(error),
        details: toSupabaseErrorDetails(error),
      });
      await logCheckoutDebug({
        step: "orders_direct_insert_threw",
        payload: { paymentId, orderId: orderDraft.id },
        error,
      });
    }

    // Do not attempt older schema variants here.
    // Production checkout should use either:
    // - RPC `place_order_cart` (preferred), or
    // - direct insert into v2 `orders` table (fallback).
    console.error("[SUPABASE INSERT FAILED]", {
      orderId: orderDraft.id,
      paymentId,
      reason: "No Supabase order save strategy succeeded.",
    });
    await logCheckoutDebug({
      step: "save_order_all_strategies_failed",
      payload: { paymentId, orderId: orderDraft.id },
      error: "No Supabase order save strategy succeeded.",
    });
    return {
      ok: false,
      error:
        "Order could not be saved to Supabase. Ensure `place_order_cart` exists or the `orders` table has required columns.",
      code: "supabase_save_failed",
    };
  } catch (error) {
    console.warn("[Supabase] saveOrderAfterPayment threw", error);
    await logCheckoutDebug({
      step: "save_order_unexpected_error",
      payload: { paymentId, orderId: orderDraft && orderDraft.id },
      error,
    });
    return { ok: false, error: toSafeMessage(error), code: "unexpected_error", debug: { stage: "catch", error } };
  }
}

async function listOrdersForCustomer({ email, phone, limit = 20 }) {
  if (!isConfigured()) {
    return { ok: false, skipped: true, reason: "Supabase is not configured." };
  }

  const client = getClient();
  const safeEmail = email ? String(email).trim() : "";
  const safePhone = phone ? String(phone).trim() : "";

  if (!safeEmail && !safePhone) {
    return { ok: false, error: "Missing email/phone for order lookup." };
  }

  try {
    const orderTable = getOrderSourceTable();
    const buildQuery = (selectColumns) => {
      let orderQuery = client
        .from(orderTable)
        .select(selectColumns)
        .order("created_at", { ascending: false })
        .limit(Math.min(50, Math.max(1, Number(limit) || 20)));

      if (safeEmail && safePhone) {
        orderQuery = orderQuery.eq("customer_email", safeEmail).eq("phone", safePhone);
      } else if (safeEmail) {
        orderQuery = orderQuery.eq("customer_email", safeEmail);
      } else {
        orderQuery = orderQuery.eq("phone", safePhone);
      }

      return orderQuery;
    };

    let { data: orderRows, error: orderError } = await buildQuery(
      "id, created_at, order_id, customer_name, customer_email, phone, product_name, quantity, total_price, total_amount, products, shipping_address, payment_status, order_status"
    );

    if (orderError && (orderError.code === "42703" || orderError.code === "PGRST204")) {
      console.info("[Supabase] Retrying orders lookup with compact live schema", toSupabaseErrorDetails(orderError));
      const compactResult = await buildQuery(
        "id, created_at, order_id, customer_name, customer_email, phone, products, total_amount, shipping_address, payment_status, order_status"
      );
      orderRows = compactResult.data;
      orderError = compactResult.error;
    }

    if (orderError) {
      console.info("[Supabase] Orders lookup unavailable; using local order history", toSupabaseErrorDetails(orderError));
      return { ok: false, error: toSafeMessage(orderError), code: orderError.code || "orders_lookup_failed" };
    }

    const orders = (orderRows || []).map(orderFromFlatOrderRow);

    return { ok: true, orders };
  } catch (error) {
    return { ok: false, error: toSafeMessage(error), code: "unexpected_error" };
  }
}

async function listOrdersForCurrentUser({ limit = 50 } = {}) {
  if (!isConfigured()) {
    return { ok: false, skipped: true, reason: "Supabase is not configured." };
  }

  const account = await getCurrentAccount();

  if (!account.user) {
    return { ok: false, error: "Login is required to view order history.", code: "auth_required" };
  }

  await claimCustomerOrdersForCurrentUser();

  try {
    const orderTable = getOrderSourceTable();
    const buildQuery = (selectColumns) => getClient()
      .from(orderTable)
      .select(selectColumns)
      .eq("user_id", account.user.id)
      .order("created_at", { ascending: false })
      .limit(Math.min(100, Math.max(1, Number(limit) || 50)));

    let { data: orderRows, error: orderError } = await buildQuery(
      "id, user_id, created_at, order_id, customer_name, customer_email, phone, product_name, quantity, total_price, total_amount, products, shipping_address, payment_status, order_status"
    );

    if (orderError && (orderError.code === "42703" || orderError.code === "PGRST204")) {
      console.info("[Supabase] Retrying authenticated orders lookup with compact schema", toSupabaseErrorDetails(orderError));
      const compactResult = await buildQuery(
        "id, created_at, order_id, customer_name, customer_email, phone, products, total_amount, shipping_address, payment_status, order_status"
      );
      orderRows = compactResult.data;
      orderError = compactResult.error;
    }

    if (orderError) {
      return { ok: false, error: toSafeMessage(orderError), code: orderError.code || "orders_lookup_failed" };
    }

    const orders = (orderRows || []).map(orderFromFlatOrderRow);

    return { ok: true, orders };
  } catch (error) {
    return { ok: false, error: toSafeMessage(error), code: "unexpected_error" };
  }
}

async function fetchOrderByOrderId(orderId) {
  if (!isConfigured()) {
    return { ok: false, skipped: true, reason: "Supabase is not configured." };
  }

  const safeOrderId = String(orderId || "").trim();
  if (!safeOrderId) {
    return { ok: false, error: "Missing order ID." };
  }

  const client = getClient();
  const orderTable = getOrderSourceTable();

  try {
    let { data: row, error } = await client
      .from(orderTable)
      .select("id, created_at, order_id, customer_name, customer_email, phone, product_name, quantity, total_price, total_amount, products, shipping_address, payment_status, order_status")
      .eq("order_id", safeOrderId)
      .maybeSingle();

    if (error && (error.code === "42703" || error.code === "PGRST204")) {
      console.info("[Supabase] Retrying order lookup with compact live schema", toSupabaseErrorDetails(error));
      const compactResult = await client
        .from(orderTable)
        .select("id, created_at, order_id, customer_name, customer_email, phone, products, total_amount, shipping_address, payment_status, order_status")
        .eq("order_id", safeOrderId)
        .maybeSingle();
      row = compactResult.data;
      error = compactResult.error;
    }

    if (error) {
      return { ok: false, error: toSafeMessage(error), code: error.code || "order_lookup_failed" };
    }

    if (!row) {
      return { ok: true, order: null };
    }

    const order = orderFromFlatOrderRow(row);

    return { ok: true, order };
  } catch (error) {
    return { ok: false, error: toSafeMessage(error), code: "unexpected_error" };
  }
}

window.AaruniSupabaseBackend = {
  isConfigured,
  getClient,
  getAuthSession,
  getCurrentAccount,
  onAuthStateChange,
  signUpCustomer,
  signInCustomer,
  signOutCustomer,
  sendPasswordReset,
  updatePassword,
  upsertCustomerProfile,
  claimCustomerOrdersForCurrentUser,
  logCheckoutDebug,
  saveOrderAfterPayment,
  sendOrderNotificationEmail,
  listOrdersForCustomer,
  listOrdersForCurrentUser,
  fetchOrderByOrderId,
  ORDER_STATUSES,
};

window.dispatchEvent(new CustomEvent("aaruni:supabase-ready"));
