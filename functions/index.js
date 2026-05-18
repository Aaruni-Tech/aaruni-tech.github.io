const functions = require("firebase-functions");
const admin = require("firebase-admin");
const crypto = require("crypto");

const { sendEmailJs } = require("./emailjs");
const { buildCustomerEmailHtml, buildAdminEmailHtml, buildItemsTableHtml } = require("./order-templates");

admin.initializeApp();
const db = admin.firestore();

function generateOrderId(date = new Date()) {
  const datePart = date.toISOString().slice(0, 10).replace(/-/g, "");
  const randomPart = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `AT-${datePart}-${randomPart}`;
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function formatOrderDate(value) {
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}

function formatOrderTime(value) {
  return new Intl.DateTimeFormat("en-IN", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function customerKeyFromEmail(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) {
    return null;
  }
  return crypto.createHash("sha256").update(normalized).digest("hex").slice(0, 32);
}

async function fetchRazorpayPayment(paymentId, { keyId, keySecret }) {
  if (!paymentId) {
    throw new Error("Missing paymentId.");
  }
  if (!keyId || !keySecret) {
    throw new Error("Missing Razorpay credentials in functions config.");
  }

  const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
  const response = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}`, {
    method: "GET",
    headers: { Authorization: `Basic ${auth}` },
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Razorpay payment fetch failed: ${response.status} ${text}`.trim());
  }

  return response.json();
}

function sanitizeDraftOrder(orderDraft) {
  const safe = typeof orderDraft === "object" && orderDraft ? orderDraft : {};
  const buyer = typeof safe.buyer === "object" && safe.buyer ? safe.buyer : {};
  const items = Array.isArray(safe.items) ? safe.items : [];

  return {
    buyer: {
      name: String(buyer.name || "Customer"),
      email: String(buyer.email || ""),
      phone: String(buyer.phone || ""),
      address: String(buyer.address || ""),
      addressParts: Array.isArray(buyer.addressParts) ? buyer.addressParts.map((v) => String(v || "")).filter(Boolean) : [],
      state: String(buyer.state || ""),
      district: String(buyer.district || ""),
    },
    items: items
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const quantity = Number.isInteger(item.quantity) && item.quantity > 0 ? item.quantity : 1;
        const price = Number(item.price || 0);
        return {
          id: String(item.id || ""),
          name: String(item.name || ""),
          category: String(item.category || ""),
          image: String(item.image || ""),
          price,
          quantity,
          lineTotal: Number(item.lineTotal || price * quantity),
        };
      })
      .filter(Boolean),
    clientTotals: {
      subtotal: Number(safe.subtotal || 0),
      shippingCharge: Number(safe.shippingCharge || 0),
      totalAmount: Number(safe.totalAmount || 0),
    },
    supportEmail: String(safe.supportEmail || "tech.aaruni@gmail.com"),
    source: "aaruni-tech.github.io",
  };
}

exports.createOrderAfterPayment = functions.https.onCall(async (data, context) => {
  const paymentId = data && data.paymentId ? String(data.paymentId) : "";
  const orderDraft = data && data.orderDraft ? data.orderDraft : null;
  const authUid = context && context.auth && context.auth.uid ? String(context.auth.uid) : null;

  if (!paymentId) {
    throw new functions.https.HttpsError("invalid-argument", "paymentId is required.");
  }

  const razorpayKeyId = functions.config().razorpay && functions.config().razorpay.key_id;
  const razorpayKeySecret = functions.config().razorpay && functions.config().razorpay.key_secret;

  const emailjsConfig = functions.config().emailjs || {};
  const adminEmail = (functions.config().store && functions.config().store.admin_email) || "tech.aaruni@gmail.com";

  const payment = await fetchRazorpayPayment(paymentId, { keyId: razorpayKeyId, keySecret: razorpayKeySecret });

  const isCaptured = payment && (payment.status === "captured" || payment.captured === true);
  if (!isCaptured) {
    throw new functions.https.HttpsError("failed-precondition", "Payment not captured.");
  }

  const draft = sanitizeDraftOrder(orderDraft);
  const now = new Date();
  const orderId = generateOrderId(now);

  const paymentAmount = typeof payment.amount === "number" ? payment.amount / 100 : null;
  const paymentCurrency = payment && payment.currency ? String(payment.currency) : "INR";

  const order = {
    id: orderId,
    invoiceNumber: `INV-${orderId}`,
    status: "Confirmed",
    createdAt: now.toISOString(),
    orderDate: formatOrderDate(now),
    orderTime: formatOrderTime(now),
    estimatedDeliveryDate: formatOrderDate(addDays(now, 5)),
    payment: {
      provider: "Razorpay",
      id: paymentId,
      status: "Paid",
      currency: paymentCurrency,
      amount: paymentAmount,
      method: payment && payment.method ? String(payment.method) : "",
    },
    buyer: draft.buyer,
    authUid,
    items: draft.items,
    totalQuantity: draft.items.reduce((sum, item) => sum + (item.quantity || 0), 0),
    subtotal: draft.items.reduce((sum, item) => sum + (item.lineTotal || 0), 0),
    shippingCharge: 0,
    totalAmount: paymentAmount !== null ? paymentAmount : draft.clientTotals.totalAmount,
    clientTotalAmount: draft.clientTotals.totalAmount,
    supportEmail: draft.supportEmail,
    trackingUrl: `https://aaruni-tech.github.io/track-order.html?order_id=${encodeURIComponent(orderId)}`,
    deliveryEstimateDays: 5,
    source: draft.source,
    paymentRaw: {
      id: payment.id,
      status: payment.status,
      captured: payment.captured,
      amount: payment.amount,
      currency: payment.currency,
      created_at: payment.created_at,
      email: payment.email,
      contact: payment.contact,
      method: payment.method,
    },
  };

  const paymentRef = db.collection("payments").doc(paymentId);
  const orderRef = db.collection("orders").doc(orderId);
  const customerKey = customerKeyFromEmail(order.buyer.email);
  const customerRef = customerKey ? db.collection("customers").doc(customerKey) : null;

  const transactionResult = await db.runTransaction(async (tx) => {
    const existingPayment = await tx.get(paymentRef);
    if (existingPayment.exists) {
      const existing = existingPayment.data() || {};
      const existingOrderId = existing.orderId;
      if (existingOrderId) {
        const existingOrderSnap = await tx.get(db.collection("orders").doc(existingOrderId));
        const existingOrder = existingOrderSnap.exists ? existingOrderSnap.data() : null;
        return { ok: true, duplicate: true, order: existingOrder || order };
      }
      return { ok: true, duplicate: true, order };
    }

    tx.set(paymentRef, {
      paymentId,
      orderId,
      status: "captured",
      amount: payment.amount,
      currency: payment.currency,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      raw: order.paymentRaw,
    });

    tx.set(orderRef, {
      ...order,
      createdAtServer: admin.firestore.FieldValue.serverTimestamp(),
      paymentId,
    });

    if (customerRef) {
      tx.set(
        customerRef,
        {
          email: normalizeEmail(order.buyer.email),
          name: order.buyer.name,
          phone: order.buyer.phone,
          address: order.buyer.address,
          state: order.buyer.state,
          district: order.buyer.district,
          lastOrderId: orderId,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    }

    return { ok: true, duplicate: false, order };
  });

  const templateParams = {
    order_id: order.id,
    invoice_number: order.invoiceNumber,
    order_date: order.orderDate,
    order_timestamp: order.createdAt,
    order_status: order.status,
    customer_name: order.buyer.name,
    customer_email: order.buyer.email,
    customer_phone: order.buyer.phone,
    delivery_address: order.buyer.address,
    items_text: order.items.map((i) => `${i.name} x${i.quantity} - ${i.lineTotal}`).join("\n"),
    items_html: buildItemsTableHtml(order),
    total_amount: String(order.totalAmount),
    payment_id: order.payment.id,
    estimated_delivery_date: order.estimatedDeliveryDate,
    support_email: order.supportEmail,
    tracking_url: order.trackingUrl,
    to_name: order.buyer.name,
    to_email: order.buyer.email,
    seller_email: adminEmail,
    message_html: "",
  };

  const emailTasks = [];

  if (order.buyer.email) {
    emailTasks.push(
      sendEmailJs({
        serviceId: emailjsConfig.service_id,
        templateId: emailjsConfig.buyer_template_id,
        userId: emailjsConfig.user_id,
        accessToken: emailjsConfig.access_token,
        templateParams: {
          ...templateParams,
          message_html: buildCustomerEmailHtml(order),
        },
      }),
    );
  }

  emailTasks.push(
    sendEmailJs({
      serviceId: emailjsConfig.service_id,
      templateId: emailjsConfig.seller_template_id,
      userId: emailjsConfig.user_id,
      accessToken: emailjsConfig.access_token,
      templateParams: {
        ...templateParams,
        message_html: buildAdminEmailHtml(order),
      },
    }),
  );

  const emailResults = await Promise.allSettled(emailTasks);

  const anyEmailFailed = emailResults.some((r) => r.status === "rejected");
  if (anyEmailFailed) {
    console.warn("One or more emails failed", emailResults);
  }

  return {
    ok: true,
    duplicate: transactionResult.duplicate,
    order: transactionResult.order,
    email: {
      results: emailResults.map((r) => (r.status === "fulfilled" ? { ok: true } : { ok: false, error: String(r.reason) })),
    },
  };
});
