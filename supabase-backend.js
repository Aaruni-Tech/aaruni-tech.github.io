import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

let supabaseClient = null;

const ORDER_STATUSES = ["Order Confirmed", "Packed", "Shipped", "Out for Delivery", "Delivered"];

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
    // Use window.* globals so GitHub Pages deployments work reliably.
    supabaseClient = createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY, {
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

function toSupabaseErrorDetails(error) {
  if (!error) {
    return null;
  }

  if (typeof error === "string") {
    return { message: error };
  }

  return {
    message: toSafeMessage(error),
    code: error.code || "",
    details: error.details || "",
    hint: error.hint || "",
    raw: error,
  };
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
  for (let index = 0; index < payloads.length; index += 1) {
    const payload = payloads[index];
    try {
      const query = client.from(table).insert(payload);
      const { data, error } = select ? await query.select(select).single() : await query;

      if (!error) {
        return { ok: true, data, usedIndex: index };
      }

      const details = toSupabaseErrorDetails(error);
      console.warn(`[Supabase] Insert into ${table} failed (variant ${index + 1}/${payloads.length})`, details);
    } catch (error) {
      console.warn(`[Supabase] Insert into ${table} threw (variant ${index + 1}/${payloads.length})`, error);
    }
  }

  return { ok: false };
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

async function saveOrderAfterPayment({ orderDraft, paymentId }) {
  if (!isConfigured()) {
    console.warn("[Supabase] Not configured", {
      url: window.SUPABASE_URL || "",
      anonKeyPresent: Boolean(window.SUPABASE_ANON_KEY),
    });
    return {
      ok: false,
      skipped: true,
      reason: "Supabase is not configured.",
      debug: { supabaseUrl: window.SUPABASE_URL || "", anonKeyPresent: Boolean(window.SUPABASE_ANON_KEY) },
    };
  }

  if (!orderDraft) {
    return { ok: false, error: "Missing order draft." };
  }

  const client = getClient();

  try {
    const buyer = orderDraft.buyer || {};
    const createdAtIso = orderDraft.createdAt || new Date().toISOString();

    console.info("[Supabase] saveOrderAfterPayment start", {
      paymentId,
      draftId: orderDraft.id,
      items: Array.isArray(orderDraft.items) ? orderDraft.items.length : 0,
      buyer: {
        name: buyer.name,
        email: buyer.email,
        phone: buyer.phone,
      },
    });

    // Best-effort: store customer profile in `users` if the ecommerce schema is installed.
    // This is optional and safe to ignore if the table doesn't exist or RLS blocks it.
    try {
      const userInsert = await insertWithFallback({
        client,
        table: "users",
        payloads: [
          {
            full_name: buyer.name || "Customer",
            email: buyer.email || null,
            phone: buyer.phone || null,
            shipping_address: buyer.address || "",
          },
          {
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
      const cartPayload = items
        .map((item) => ({
          product_id: item.id || "",
          quantity: Number(item.quantity || 0),
        }))
        .filter((item) => item.product_id && item.quantity > 0);

      if (cartPayload.length) {
        console.info("[Supabase] Calling RPC place_order_cart", { cartPayload });
        const { data: rpcOrder, error: rpcError } = await client.rpc("place_order_cart", {
          p_customer_name: buyer.name || "Customer",
          p_customer_email: buyer.email || "",
          p_phone: buyer.phone || "",
          p_shipping_address: buyer.address || "",
          p_items: cartPayload,
          p_payment_status: paymentId ? "Paid" : "Pending",
        });

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
            },
          };

          return { ok: true, order: upgradedOrder };
        }

        if (rpcError) {
          const details = toSupabaseErrorDetails(rpcError);
          console.warn("[Supabase] RPC place_order_cart failed", details);

          if (isMissingFunctionError(details, "place_order_cart")) {
            console.warn("[Supabase] Missing RPC place_order_cart. Install it via SQL migration.");
          }
        }
      }
    } catch (error) {
      console.warn("[Supabase] RPC place_order_cart threw", error);
    }

    // If the v2 `orders` table exists but RPC is not installed, at least store the order row (no stock decrement).
    try {
      const items = Array.isArray(orderDraft.items) ? orderDraft.items : [];
      const productsText = items
        .map((item) => `${item.name || "Product"} x ${Number(item.quantity || 1)}`)
        .filter(Boolean)
        .join(", ");
      const totalQty = items.reduce((sum, item) => sum + Number(item.quantity || 0), 0) || Number(orderDraft.totalQuantity || 0) || 1;

      console.info("[Supabase] Trying direct insert into v2 orders table (no stock decrement)", {
        productsText,
        totalQty,
        totalPrice: Number(orderDraft.totalAmount || 0),
      });
      const basePayload = {
        customer_name: buyer.name || "Customer",
        customer_email: buyer.email || null,
        phone: buyer.phone || null,
        product_name: productsText || "Cart items",
        quantity: totalQty,
        total_price: Number(orderDraft.totalAmount || 0),
        shipping_address: buyer.address || "",
        payment_status: paymentId ? "Paid" : "Pending",
        order_id: orderDraft.id,
      };

      const v2Insert = await insertWithFallback({
        client,
        table: "orders",
        select: "id, order_id, created_at, order_status, status, payment_status, total_price",
        payloads: [
          { ...basePayload, order_status: normalizeStatus(orderDraft.status || "Order Confirmed") },
          { ...basePayload, status: normalizeStatus(orderDraft.status || "Order Confirmed") },
          { ...basePayload },
        ],
      });

      const v2Row = v2Insert.ok ? v2Insert.data : null;

      if (v2Row && v2Row.order_id) {
        console.info("[Supabase] v2 orders insert ok", { v2Row });
        const orderAtIso = v2Row.created_at ? new Date(v2Row.created_at).toISOString() : createdAtIso;
        const orderAtDate = new Date(orderAtIso);
        const upgradedOrder = {
          ...orderDraft,
          id: v2Row.order_id,
          invoiceNumber: orderDraft.invoiceNumber || `INV-${v2Row.order_id}`,
          status: normalizeStatus(v2Row.order_status || v2Row.status || "Order Confirmed"),
          createdAt: orderAtIso,
          orderDate: new Intl.DateTimeFormat("en-IN", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          }).format(orderAtDate),
          orderTime: new Intl.DateTimeFormat("en-IN", { hour: "2-digit", minute: "2-digit" }).format(orderAtDate),
          subtotal: Number(v2Row.total_price || orderDraft.subtotal || 0),
          totalAmount: Number(v2Row.total_price || orderDraft.totalAmount || 0),
          payment: {
            provider: "Razorpay",
            id: paymentId || (orderDraft.payment && orderDraft.payment.id) || "not available",
            status: String(v2Row.payment_status || (paymentId ? "Paid" : "Pending")),
          },
          statusHistory: [
            {
              status: normalizeStatus(v2Row.order_status || v2Row.status || "Order Confirmed"),
              at: orderAtIso,
            },
          ],
          backend: {
            provider: "supabase",
            schema: "orders_v2_no_stock",
            orderRowId: v2Row.id,
          },
        };

        return { ok: true, order: upgradedOrder };
      }
    } catch (error) {
      console.warn("[Supabase] v2 orders insert threw", error);
    }

    // Do not attempt legacy `customers/order_items` schema here.
    // Production checkout should use either:
    // - RPC `place_order_cart` (preferred), or
    // - direct insert into v2 `orders` table (fallback).
    return {
      ok: false,
      error:
        "Order could not be saved to Supabase. Ensure `place_order_cart` exists or the `orders` table has required columns.",
      code: "supabase_save_failed",
    };
  } catch (error) {
    console.warn("[Supabase] saveOrderAfterPayment threw", error);
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
    let customerQuery = client
      .from("customers")
      .select("id, name, phone, email, address, address_parts")
      .order("id", { ascending: false })
      .limit(5);

    if (safeEmail && safePhone) {
      customerQuery = customerQuery.eq("email", safeEmail).eq("phone", safePhone);
    } else if (safeEmail) {
      customerQuery = customerQuery.eq("email", safeEmail);
    } else {
      customerQuery = customerQuery.eq("phone", safePhone);
    }

    const { data: customers, error: customerError } = await customerQuery;

    if (customerError) {
      return { ok: false, error: toSafeMessage(customerError), code: customerError.code || "customer_lookup_failed" };
    }

    const customerIds = Array.isArray(customers) ? customers.map((row) => row.id).filter(Boolean) : [];

    if (!customerIds.length) {
      return { ok: true, orders: [] };
    }

    const { data: orderRows, error: orderError } = await client
      .from("orders")
      .select(
        `
        id,
        order_id,
        status,
        subtotal,
        total_amount,
        currency,
        order_at,
        payment_id,
        cart_items,
        customers:customer_id (name, email, phone, address, address_parts),
        order_items (product_id, name, category, image, unit_price, quantity, line_total),
        order_status_events (status, at, created_at)
      `
      )
      .in("customer_id", customerIds)
      .order("order_at", { ascending: false })
      .limit(Math.min(50, Math.max(1, Number(limit) || 20)));

    if (orderError) {
      return { ok: false, error: toSafeMessage(orderError), code: orderError.code || "orders_lookup_failed" };
    }

    const orders = (orderRows || []).map((row) => {
      const customer = row.customers || {};
      const statusEvents = Array.isArray(row.order_status_events) ? row.order_status_events : [];
      const orderItems = Array.isArray(row.order_items) ? row.order_items : [];

      return buildOrderLikeObject({
        orderDraft: {
          id: row.order_id,
          status: normalizeStatus(row.status),
          subtotal: row.subtotal,
          totalAmount: row.total_amount,
          createdAt: row.order_at,
          payment: { id: row.payment_id, provider: "Razorpay" },
          buyer: {
            name: customer.name,
            email: customer.email,
            phone: customer.phone,
            address: customer.address,
            addressParts: customer.address_parts,
          },
          items: orderItems.map((item) => ({
            id: item.product_id,
            name: item.name,
            category: item.category,
            image: item.image,
            price: Number(item.unit_price || 0),
            quantity: Number(item.quantity || 1),
            lineTotal: Number(item.line_total || 0),
          })),
        },
        paymentId: row.payment_id,
        customer,
        statusEvents,
        orderItems,
        orderAtIso: row.order_at,
      });
    });

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

  try {
    const { data: row, error } = await client
      .from("orders")
      .select(
        `
        id,
        order_id,
        status,
        subtotal,
        total_amount,
        currency,
        order_at,
        payment_id,
        cart_items,
        customers:customer_id (name, email, phone, address, address_parts),
        order_items (product_id, name, category, image, unit_price, quantity, line_total),
        order_status_events (status, at, created_at)
      `
      )
      .eq("order_id", safeOrderId)
      .maybeSingle();

    if (error) {
      return { ok: false, error: toSafeMessage(error), code: error.code || "order_lookup_failed" };
    }

    if (!row) {
      return { ok: true, order: null };
    }

    const customer = row.customers || {};
    const statusEvents = Array.isArray(row.order_status_events) ? row.order_status_events : [];
    const orderItems = Array.isArray(row.order_items) ? row.order_items : [];

    const order = buildOrderLikeObject({
      orderDraft: {
        id: row.order_id,
        status: normalizeStatus(row.status),
        subtotal: row.subtotal,
        totalAmount: row.total_amount,
        createdAt: row.order_at,
        payment: { id: row.payment_id, provider: "Razorpay" },
        buyer: {
          name: customer.name,
          email: customer.email,
          phone: customer.phone,
          address: customer.address,
          addressParts: customer.address_parts,
        },
        items: orderItems.map((item) => ({
          id: item.product_id,
          name: item.name,
          category: item.category,
          image: item.image,
          price: Number(item.unit_price || 0),
          quantity: Number(item.quantity || 1),
          lineTotal: Number(item.line_total || 0),
        })),
      },
      paymentId: row.payment_id,
      customer,
      statusEvents,
      orderItems,
      orderAtIso: row.order_at,
    });

    return { ok: true, order };
  } catch (error) {
    return { ok: false, error: toSafeMessage(error), code: "unexpected_error" };
  }
}

window.AaruniSupabaseBackend = {
  isConfigured,
  saveOrderAfterPayment,
  listOrdersForCustomer,
  fetchOrderByOrderId,
  ORDER_STATUSES,
};
