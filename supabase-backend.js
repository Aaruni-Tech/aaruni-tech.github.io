import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = window.SUPABASE_URL;
const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY;

let supabaseClient = null;

const ORDER_STATUSES = ["Order Confirmed", "Packed", "Shipped", "Out for Delivery", "Delivered"];

console.log("[Supabase] Backend init", {
  url: window.SUPABASE_URL,
  keyPresent: !!window.SUPABASE_ANON_KEY,
});

function isConfigured() {
  return Boolean(
    SUPABASE_URL &&
      SUPABASE_ANON_KEY &&
      SUPABASE_URL !== "YOUR_SUPABASE_URL" &&
      SUPABASE_ANON_KEY !== "YOUR_SUPABASE_ANON_KEY"
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
    console.info("[Supabase] Initializing client", {
      url: SUPABASE_URL || "",
      anonKey: SUPABASE_ANON_KEY ? maskValue(SUPABASE_ANON_KEY) : "",
    });
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

async function findOrCreateCustomer(client, buyer) {
  const email = buyer && buyer.email ? String(buyer.email).trim() : "";
  const phone = buyer && buyer.phone ? String(buyer.phone).trim() : "";

  if (email || phone) {
    try {
      let query = client.from("customers").select("id, name, phone, email, address, address_parts").limit(1);

      if (email && phone) {
        query = query.eq("email", email).eq("phone", phone);
      } else if (email) {
        query = query.eq("email", email);
      } else if (phone) {
        query = query.eq("phone", phone);
      }

      const { data: existing, error } = await query.maybeSingle();

      if (!error && existing && existing.id) {
        return { ok: true, customer: existing };
      }
    } catch (error) {
      // Non-fatal: fall back to insert.
    }
  }

  const { data: created, error: createError } = await client
    .from("customers")
    .insert({
      name: (buyer && buyer.name) || "Customer",
      phone: phone || "",
      email: email || null,
      address: (buyer && buyer.address) || "",
      address_parts: Array.isArray(buyer && buyer.addressParts) ? buyer.addressParts : [],
    })
    .select("id, name, phone, email, address, address_parts")
    .single();

  if (createError) {
    return { ok: false, error: toSafeMessage(createError), code: createError.code || "customer_insert_failed" };
  }

  return { ok: true, customer: created };
}

async function saveOrderAfterPayment({ orderDraft, paymentId }) {
  if (!isConfigured()) {
    console.warn("[Supabase] Not configured", {
      url: SUPABASE_URL || "",
      anonKeyPresent: Boolean(SUPABASE_ANON_KEY),
    });
    return {
      ok: false,
      skipped: true,
      reason: "Supabase is not configured.",
      debug: { supabaseUrl: SUPABASE_URL || "", anonKeyPresent: Boolean(SUPABASE_ANON_KEY) },
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
      const { error: userInsertError } = await client.from("users").insert({
        full_name: buyer.name || "Customer",
        email: buyer.email || null,
        phone: buyer.phone || null,
        shipping_address: buyer.address || "",
      });
      if (userInsertError) {
        console.warn("[Supabase] users insert failed", toSupabaseErrorDetails(userInsertError));
      } else {
        console.info("[Supabase] users insert ok");
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
          console.warn("[Supabase] RPC place_order_cart failed", toSupabaseErrorDetails(rpcError));
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
      const { data: v2Row, error: v2Error } = await client
        .from("orders")
        .insert({
          customer_name: buyer.name || "Customer",
          customer_email: buyer.email || null,
          phone: buyer.phone || null,
          product_name: productsText || "Cart items",
          quantity: totalQty,
          total_price: Number(orderDraft.totalAmount || 0),
          shipping_address: buyer.address || "",
          payment_status: paymentId ? "Paid" : "Pending",
          order_status: normalizeStatus(orderDraft.status || "Order Confirmed"),
          order_id: orderDraft.id,
        })
        .select("id, order_id, created_at, order_status, payment_status, total_price")
        .single();

      if (!v2Error && v2Row && v2Row.order_id) {
        console.info("[Supabase] v2 orders insert ok", { v2Row });
        const orderAtIso = v2Row.created_at ? new Date(v2Row.created_at).toISOString() : createdAtIso;
        const orderAtDate = new Date(orderAtIso);
        const upgradedOrder = {
          ...orderDraft,
          id: v2Row.order_id,
          invoiceNumber: orderDraft.invoiceNumber || `INV-${v2Row.order_id}`,
          status: normalizeStatus(v2Row.order_status || "Order Confirmed"),
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
              status: normalizeStatus(v2Row.order_status || "Order Confirmed"),
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

      if (v2Error) {
        console.warn("[Supabase] v2 orders insert failed", toSupabaseErrorDetails(v2Error));
      }
    } catch (error) {
      console.warn("[Supabase] v2 orders insert threw", error);
    }

    const customerResult = await findOrCreateCustomer(client, buyer);

    if (!customerResult.ok) {
      return customerResult;
    }

    const customerRow = customerResult.customer;

    const { data: orderRow, error: orderError } = await client
      .from("orders")
      .insert({
        order_id: orderDraft.id,
        customer_id: customerRow.id,
        payment_id: paymentId || (orderDraft.payment && orderDraft.payment.id) || "",
        status: normalizeStatus(orderDraft.status),
        subtotal: Number(orderDraft.subtotal || 0),
        total_amount: Number(orderDraft.totalAmount || 0),
        currency: "INR",
        order_at: createdAtIso,
        cart_items: Array.isArray(orderDraft.items) ? orderDraft.items : [],
      })
      .select("id, order_id")
      .single();

    if (orderError) {
      console.warn("[Supabase] legacy orders insert failed", toSupabaseErrorDetails(orderError));
      return {
        ok: false,
        error: toSafeMessage(orderError),
        code: orderError.code || "order_insert_failed",
        debug: { stage: "legacy_orders_insert", details: toSupabaseErrorDetails(orderError) },
      };
    }

    // Best-effort: seed status timeline.
    try {
      await client.from("order_status_events").insert({
        order_id: orderRow.id,
        status: normalizeStatus(orderDraft.status),
        at: createdAtIso,
      });
    } catch (error) {
      // ignore: timeline can be managed later.
    }

    const items = Array.isArray(orderDraft.items) ? orderDraft.items : [];
    const orderItemsPayload = items.map((item) => ({
      order_id: orderRow.id,
      product_id: item.id || null,
      name: item.name || "",
      category: item.category || "",
      image: item.image || "",
      unit_price: Number(item.price || 0),
      quantity: Number(item.quantity || 1),
      line_total: Number(item.lineTotal || 0),
    }));

    if (orderItemsPayload.length) {
      const { error: itemsError } = await client.from("order_items").insert(orderItemsPayload);

      if (itemsError) {
        console.warn("[Supabase] legacy order_items insert failed", toSupabaseErrorDetails(itemsError));
        return {
          ok: false,
          error: toSafeMessage(itemsError),
          code: itemsError.code || "order_items_insert_failed",
          debug: { stage: "legacy_order_items_insert", details: toSupabaseErrorDetails(itemsError) },
        };
      }
    }

    return {
      ok: true,
      order: {
        ...orderDraft,
        payment: {
          ...(orderDraft.payment || {}),
          id: paymentId || (orderDraft.payment && orderDraft.payment.id) || "not available",
        },
        backend: {
          provider: "supabase",
          customerId: customerRow.id,
          orderRowId: orderRow.id,
        },
      },
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
