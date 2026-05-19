import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = window.SUPABASE_URL;
const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY;

let supabaseClient = null;

function isConfigured() {
  return Boolean(
    SUPABASE_URL &&
      SUPABASE_ANON_KEY &&
      SUPABASE_URL !== "YOUR_SUPABASE_URL" &&
      SUPABASE_ANON_KEY !== "YOUR_SUPABASE_ANON_KEY"
  );
}

function getClient() {
  if (!supabaseClient) {
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
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

async function listProducts({ limit = 100 } = {}) {
  if (!isConfigured()) {
    return { ok: false, skipped: true, reason: "Supabase is not configured." };
  }

  const client = getClient();

  try {
    const { data, error } = await client
      .from("products")
      .select("id, created_at, product_name, price, image_url, stock, description")
      .order("created_at", { ascending: false })
      .limit(Math.min(500, Math.max(1, Number(limit) || 100)));

    if (error) {
      return { ok: false, error: toSafeMessage(error), code: error.code || "products_select_failed" };
    }

    return { ok: true, products: data || [] };
  } catch (error) {
    return { ok: false, error: toSafeMessage(error), code: "unexpected_error" };
  }
}

async function placeOrder({ productId, customerName, customerEmail, quantity }) {
  if (!isConfigured()) {
    return { ok: false, skipped: true, reason: "Supabase is not configured." };
  }

  const safeProductId = String(productId || "").trim();
  const safeCustomerName = String(customerName || "").trim();
  const safeCustomerEmail = String(customerEmail || "").trim();
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
    const { data, error } = await client.rpc("place_order", {
      p_product_id: safeProductId,
      p_customer_name: safeCustomerName,
      p_customer_email: safeCustomerEmail,
      p_quantity: Math.floor(safeQuantity),
    });

    if (error) {
      return { ok: false, error: toSafeMessage(error), code: error.code || "place_order_failed" };
    }

    return { ok: true, order: data };
  } catch (error) {
    return { ok: false, error: toSafeMessage(error), code: "unexpected_error" };
  }
}

window.EcommerceSupabase = {
  isConfigured,
  listProducts,
  placeOrder,
};

