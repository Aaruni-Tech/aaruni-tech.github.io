import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

let supabaseClient = null;

function getSupabaseConfig() {
  return {
    url: typeof window.SUPABASE_URL === "string" ? window.SUPABASE_URL.trim() : "",
    anonKey: typeof window.SUPABASE_ANON_KEY === "string" ? window.SUPABASE_ANON_KEY.trim() : "",
  };
}

function isConfigured() {
  const { url, anonKey } = getSupabaseConfig();
  return Boolean(url && anonKey);
}

function getClient() {
  if (!supabaseClient) {
    const { url, anonKey } = getSupabaseConfig();
    console.log("Supabase URL:", url);
    supabaseClient = createClient(url, anonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  }

  return supabaseClient;
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

function createOrderId() {
  const now = new Date();
  const datePart = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(now)
    .replaceAll("-", "");
  const randomPart = Math.random().toString(16).slice(2, 10).toUpperCase().padEnd(8, "0");

  return `AT-${datePart}-${randomPart}`;
}

async function listProducts({ limit = 100 } = {}) {
  if (!isConfigured()) {
    return { ok: false, skipped: true, reason: "Supabase is not configured." };
  }

  const client = getClient();

  try {
    let { data, error } = await client
      .from("products")
      .select("id, created_at, product_name, price, image_url, stock, description")
      .order("created_at", { ascending: false })
      .limit(Math.min(500, Math.max(1, Number(limit) || 100)));

    if (error && (error.code === "42703" || error.code === "PGRST204")) {
      const legacyResult = await client
        .from("products")
        .select('"product id", "product name", price, "image url", stock, discription')
        .limit(Math.min(500, Math.max(1, Number(limit) || 100)));
      data = Array.isArray(legacyResult.data)
        ? legacyResult.data.map((product) => ({
            id: String(product["product id"] || product["product name"] || ""),
            created_at: "",
            product_name: product["product name"] || "",
            price: Number(product.price || 0),
            image_url: product["image url"] || "",
            stock: Number(product.stock || 0),
            description: product.discription || "",
          }))
        : legacyResult.data;
      error = legacyResult.error;
    }

    if (error) {
      return { ok: false, error: toSafeMessage(error), code: error.code || "products_select_failed" };
    }

    return { ok: true, products: data || [] };
  } catch (error) {
    return { ok: false, error: toSafeMessage(error), code: "unexpected_error" };
  }
}

async function placeOrder({ productId, customerName, customerEmail, customerPhone = "", shippingAddress = "", quantity }) {
  if (!isConfigured()) {
    return { ok: false, skipped: true, reason: "Supabase is not configured." };
  }

  const safeProductId = String(productId || "").trim();
  const safeCustomerName = String(customerName || "").trim();
  const safeCustomerEmail = String(customerEmail || "").trim();
  const safeCustomerPhone = String(customerPhone || "").trim();
  const safeShippingAddress = String(shippingAddress || "").trim();
  const safeQuantity = Number(quantity || 0);

  if (!safeProductId) {
    return { ok: false, error: "Missing productId." };
  }

  if (!safeCustomerName) {
    return { ok: false, error: "Missing customerName." };
  }

  if (!Number.isFinite(safeQuantity) || safeQuantity <= 0) {
    return { ok: false, error: "Quantity must be greater than 0." };
  }

  const client = getClient();

  try {
    const productsJson = JSON.parse(JSON.stringify([
      {
        product_id: safeProductId,
        id: safeProductId,
        name: "",
        quantity: Math.floor(safeQuantity),
        price: 0,
        line_total: 0,
      },
    ]));

    const { data, error } = await client.rpc("place_order_cart", {
      p_customer_email: safeCustomerEmail,
      p_customer_name: safeCustomerName,
      p_order_id: createOrderId(),
      p_payment_id: "",
      p_payment_status: "Paid",
      p_phone: safeCustomerPhone,
      p_products: productsJson,
      p_shipping_address: safeShippingAddress,
      p_total_amount: 0,
    });

    if (error) {
      console.error("Supabase connection failed:", error);
      return { ok: false, error: toSafeMessage(error), code: error.code || "place_order_cart_failed" };
    }

    return { ok: true, order: data };
  } catch (error) {
    console.error("Supabase connection failed:", error);
    return { ok: false, error: toSafeMessage(error), code: "unexpected_error" };
  }
}

window.EcommerceSupabase = {
  isConfigured,
  listProducts,
  placeOrder,
};
