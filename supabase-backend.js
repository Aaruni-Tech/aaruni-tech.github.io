import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

let supabaseClient = null;

const ORDER_STATUSES = ["Order Confirmed", "Packed", "Shipped", "Out for Delivery", "Delivered"];
const ORDER_EMAIL_FUNCTION_NAME =
  (window.AARUNI_CONFIG &&
    window.AARUNI_CONFIG.email &&
    window.AARUNI_CONFIG.email.orderNotificationFunctionName) ||
  "send-order-notification";
const ORDER_EMAIL_STORAGE_PREFIX = "aaruniOrderEmailNotification:";

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
    console.log("Supabase URL:", url);
    // Use window.* globals so GitHub Pages deployments work reliably.
    try {
      supabaseClient = createClient(url, anonKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
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
    return { ok: false, skipped: true, reason: "Supabase is not configured." };
  }

  const notificationKey = getOrderEmailNotificationKey(order);
  const orderId = String((order && order.id) || order.order_id || "").trim();
  const paymentId = getOrderPaymentId(order);
  const paymentStatus = String((order && order.payment && order.payment.status) || order.payment_status || "").toLowerCase();

  if (!orderId || !paymentId || paymentId === "not available") {
    return { ok: false, skipped: true, reason: "Missing order ID or payment ID for email notification." };
  }

  if (paymentStatus && paymentStatus !== "paid") {
    return { ok: false, skipped: true, reason: `Payment status is ${paymentStatus}.` };
  }

  if (hasStoredOrderEmailNotification(notificationKey)) {
    return { ok: true, skipped: true, duplicate: true, reason: "Order notification already sent from this browser." };
  }

  const client = getClient();
  const payload = buildOrderNotificationPayload(order);
  const functionUrl = getOrderEmailFunctionUrl();

  console.info("[OrderEmail] Invoking send-order-notification", {
    orderId,
    paymentId,
    functionName: ORDER_EMAIL_FUNCTION_NAME,
    functionUrl,
    payload: summarizeOrderNotificationPayload(payload),
  });

  try {
    const { data, error } = await client.functions.invoke(ORDER_EMAIL_FUNCTION_NAME, {
      body: payload,
    });

    if (error) {
      const status = error && error.context && error.context.status ? Number(error.context.status) : 0;
      const details = toSupabaseErrorDetails(error);

      console.error("[OrderEmail] send-order-notification returned error", {
        orderId,
        paymentId,
        functionName: ORDER_EMAIL_FUNCTION_NAME,
        functionUrl,
        status,
        details,
      });

      if (status === 404) {
        return {
          ok: false,
          skipped: true,
          reason: "Order email Edge Function is not deployed.",
          details,
        };
      }

      return { ok: false, error: toSafeMessage(error), details };
    }

    console.info("[OrderEmail] send-order-notification response", {
      orderId,
      paymentId,
      functionName: ORDER_EMAIL_FUNCTION_NAME,
      data,
    });

    if (data && (data.ok || data.duplicate) && data.complete !== false) {
      storeOrderEmailNotification(notificationKey);
    }

    return data || { ok: false, error: "Empty email function response." };
  } catch (error) {
    console.error("[OrderEmail] send-order-notification threw", {
      orderId,
      paymentId,
      functionName: ORDER_EMAIL_FUNCTION_NAME,
      functionUrl,
      error: toSafeMessage(error),
      details: toSupabaseErrorDetails(error),
    });
    return { ok: false, error: toSafeMessage(error), details: toSupabaseErrorDetails(error) };
  }
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
        };

        console.info("[Supabase] Calling RPC place_order_cart", {
          ...rpcPayload,
          p_products_json: JSON.stringify(productsJson),
        });
        const rpcResponse = await client.rpc("place_order_cart", rpcPayload);

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
      const productsJson = buildProductsJsonbPayload(items);
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
        total_amount: Number(orderDraft.totalAmount || 0),
        subtotal: Number(orderDraft.subtotal || orderDraft.totalAmount || 0),
        products: productsJson,
        cart_items: productsJson,
        shipping_address: buyer.address || "",
        payment_id: paymentId || (orderDraft.payment && orderDraft.payment.id) || "",
        payment_status: paymentId ? "Paid" : "Pending",
        order_id: orderDraft.id,
      };
      const liveSchemaPayload = {
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
      };
      const liveSchemaMinimalPayload = {
        customer_name: basePayload.customer_name,
        customer_email: basePayload.customer_email,
        phone: basePayload.phone,
        shipping_address: basePayload.shipping_address,
        payment_id: basePayload.payment_id,
        payment_status: basePayload.payment_status,
        order_id: basePayload.order_id,
        products: productsJson,
        total_amount: Number(orderDraft.totalAmount || 0),
      };

      const v2Insert = await insertWithFallback({
        client,
        table: "orders",
        payloads: [
          { ...basePayload, order_status: normalizeStatus(orderDraft.status || "Order Confirmed") },
          liveSchemaPayload,
          liveSchemaMinimalPayload,
          { ...basePayload, status: normalizeStatus(orderDraft.status || "Order Confirmed") },
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
          },
        };

        return { ok: true, order: upgradedOrder };
      }
    } catch (error) {
      console.warn("[Supabase] v2 orders insert threw", error);
    }

    // Do not attempt older schema variants here.
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
    const buildQuery = (selectColumns) => {
      let orderQuery = client
        .from("orders")
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
    let { data: row, error } = await client
      .from("orders")
      .select("id, created_at, order_id, customer_name, customer_email, phone, product_name, quantity, total_price, total_amount, products, shipping_address, payment_status, order_status")
      .eq("order_id", safeOrderId)
      .maybeSingle();

    if (error && (error.code === "42703" || error.code === "PGRST204")) {
      console.info("[Supabase] Retrying order lookup with compact live schema", toSupabaseErrorDetails(error));
      const compactResult = await client
        .from("orders")
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
  saveOrderAfterPayment,
  sendOrderNotificationEmail,
  listOrdersForCustomer,
  fetchOrderByOrderId,
  ORDER_STATUSES,
};
