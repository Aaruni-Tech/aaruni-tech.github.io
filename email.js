const AARUNI_EMAIL_CONFIG = {
  publicKey: window.EMAILJS_PUBLIC_KEY || "YOUR_EMAILJS_PUBLIC_KEY",
  serviceId: window.EMAILJS_SERVICE_ID || "YOUR_EMAILJS_SERVICE_ID",
  buyerTemplateId: window.EMAILJS_BUYER_TEMPLATE_ID || "YOUR_BUYER_TEMPLATE_ID",
  sellerTemplateId: window.EMAILJS_SELLER_TEMPLATE_ID || "YOUR_SELLER_TEMPLATE_ID",
  sellerEmail: "tech.aaruni@gmail.com",
};

let emailJsInitialized = false;

function isEmailPlaceholder(value) {
  return !value || String(value).startsWith("YOUR_");
}

function maskKey(value) {
  const raw = String(value || "");
  if (raw.length <= 6) {
    return raw ? "***" : "";
  }
  return `${raw.slice(0, 3)}***${raw.slice(-3)}`;
}

function isEmailConfigured() {
  return Boolean(
    window.emailjs &&
    !isEmailPlaceholder(AARUNI_EMAIL_CONFIG.publicKey) &&
    !isEmailPlaceholder(AARUNI_EMAIL_CONFIG.serviceId) &&
    !isEmailPlaceholder(AARUNI_EMAIL_CONFIG.buyerTemplateId) &&
    !isEmailPlaceholder(AARUNI_EMAIL_CONFIG.sellerTemplateId)
  );
}

function initEmailService() {
  if (!isEmailConfigured()) {
    return false;
  }

  if (!emailJsInitialized) {
    console.info("[EmailJS] Initializing", {
      serviceId: AARUNI_EMAIL_CONFIG.serviceId,
      buyerTemplateId: AARUNI_EMAIL_CONFIG.buyerTemplateId,
      sellerTemplateId: AARUNI_EMAIL_CONFIG.sellerTemplateId,
      publicKey: maskKey(AARUNI_EMAIL_CONFIG.publicKey),
      adminTo: AARUNI_EMAIL_CONFIG.sellerEmail,
    });
    window.emailjs.init({
      publicKey: AARUNI_EMAIL_CONFIG.publicKey,
    });
    emailJsInitialized = true;
  }

  return true;
}

function escapeEmailHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildItemsText(order) {
  return order.items
    .map((item) => `${item.name} x ${item.quantity} - ${window.AaruniOrders.formatOrderPrice(item.lineTotal)}`)
    .join("\n");
}

function buildItemsHtml(order) {
  return order.items
    .map((item) => `
      <tr>
        <td style="padding:12px;border-bottom:1px solid #edf0f3;">
          <strong style="display:block;color:#111827;">${escapeEmailHtml(item.name)}</strong>
          <span style="color:#667085;font-size:13px;">${escapeEmailHtml(item.category)}</span>
        </td>
        <td style="padding:12px;border-bottom:1px solid #edf0f3;text-align:center;">${item.quantity}</td>
        <td style="padding:12px;border-bottom:1px solid #edf0f3;text-align:right;">${window.AaruniOrders.formatOrderPrice(item.price)}</td>
        <td style="padding:12px;border-bottom:1px solid #edf0f3;text-align:right;font-weight:700;">${window.AaruniOrders.formatOrderPrice(item.lineTotal)}</td>
      </tr>
    `)
    .join("");
}

function buildBuyerEmailHtml(order) {
  return `
    <div style="margin:0;background:#f4f7fb;padding:24px;font-family:Arial,sans-serif;color:#111827;">
      <div style="max-width:620px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
        <div style="background:#111827;color:#ffffff;padding:22px 24px;">
          <h1 style="margin:0;font-size:20px;letter-spacing:0.4px;">Aaruni Tech</h1>
          <p style="margin:10px 0 0;font-size:14px;color:#e5e7eb;">Order placed successfully.</p>
        </div>
        <div style="padding:24px;">
          <p style="margin:0 0 10px;color:#475467;">Hi ${escapeEmailHtml(order.buyer.name)}, your order has been placed.</p>
          <div style="border:1px solid #e5e7eb;border-radius:12px;padding:16px;background:#f9fafb;">
            <p style="margin:0;color:#667085;font-size:12px;font-weight:800;text-transform:uppercase;">Order ID</p>
            <p style="margin:6px 0 0;font-size:16px;font-weight:900;color:#101828;">${escapeEmailHtml(order.id)}</p>
          </div>
        </div>
      </div>
    </div>
  `;
}

function buildSellerEmailHtml(order) {
  const itemsList = Array.isArray(order.items)
    ? order.items
        .map(
          (item) =>
            `${escapeEmailHtml(item.name)} x ${escapeEmailHtml(item.quantity)} (${window.AaruniOrders.formatOrderPrice(item.lineTotal)})`
        )
        .join("<br>")
    : "";

  return `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111827;">
      <h2 style="margin:0 0 12px;">New Aaruni Tech Order</h2>
      <p><strong>Generated Order ID:</strong> ${escapeEmailHtml(order.id)}</p>
      <p><strong>Order Date and Time:</strong> ${escapeEmailHtml(`${order.orderDate} ${order.orderTime}`)}</p>
      <p><strong>Order Timestamp (ISO):</strong> ${escapeEmailHtml(order.createdAt)}</p>
      <hr style="border:0;border-top:1px solid #e5e7eb;margin:16px 0;" />
      <p style="margin:0 0 6px;"><strong>Customer Full Name:</strong> ${escapeEmailHtml(order.buyer.name)}</p>
      <p style="margin:0 0 6px;"><strong>Customer Email:</strong> ${escapeEmailHtml(order.buyer.email || "not provided")}</p>
      <p style="margin:0 0 6px;"><strong>Phone Number:</strong> ${escapeEmailHtml(order.buyer.phone || "not provided")}</p>
      <p style="margin:0 0 6px;"><strong>Shipping Address:</strong> ${escapeEmailHtml(order.buyer.address || "not provided")}</p>
      <hr style="border:0;border-top:1px solid #e5e7eb;margin:16px 0;" />
      <p><strong>Ordered Products:</strong><br>${itemsList || escapeEmailHtml(buildItemsText(order)).replace(/\\n/g, "<br>")}</p>
      <p><strong>Quantity:</strong> ${escapeEmailHtml(order.totalQuantity || 0)}</p>
      <p><strong>Subtotal:</strong> ${window.AaruniOrders.formatOrderPrice(order.subtotal)}</p>
      <p><strong>Total Amount:</strong> ${window.AaruniOrders.formatOrderPrice(order.totalAmount)}</p>
      <p><strong>Razorpay Payment ID:</strong> ${escapeEmailHtml(order.payment.id)}</p>
      <p><strong>Payment Status:</strong> ${escapeEmailHtml((order.payment && order.payment.status) || "Paid")}</p>
    </div>
  `;
}

function buildTemplateParams(order) {
  const itemsText = buildItemsText(order);
  const sellerParams = {
    order_id: order.id,
    invoice_number: order.invoiceNumber,
    order_date: order.orderDate,
    order_time: order.orderTime,
    order_timestamp: order.createdAt,
    order_status: order.status,
    customer_name: order.buyer.name,
    customer_email: order.buyer.email,
    customer_phone: order.buyer.phone,
    delivery_address: order.buyer.address,
    shipping_address: order.buyer.address,
    items_text: itemsText,
    items_html: buildItemsHtml(order),
    total_amount: window.AaruniOrders.formatOrderPrice(order.totalAmount),
    subtotal_amount: window.AaruniOrders.formatOrderPrice(order.subtotal),
    total_amount_raw: Number(order.totalAmount || 0),
    subtotal_amount_raw: Number(order.subtotal || 0),
    payment_id: order.payment.id,
    razorpay_payment_id: order.payment.id,
    payment_status: (order.payment && order.payment.status) || "Paid",
    product_details: itemsText,
    estimated_delivery_date: order.estimatedDeliveryDate,
    support_email: order.supportEmail,
    tracking_url: order.trackingUrl,
    // Common EmailJS template fields (prevents hardcoded template names).
    from_name: order.buyer.name,
    reply_to: order.buyer.email || "",
    subject: `New Aaruni Tech Order ${order.id}`,
  };

  return {
    buyer: {
      // Keep buyer payload minimal so templates can't accidentally render internal details.
      to_name: order.buyer.name,
      to_email: order.buyer.email,
      from_name: "Aaruni Tech",
      reply_to: order.supportEmail,
      subject: `Aaruni Tech Order ${order.id}`,
      order_id: order.id,
      customer_name: order.buyer.name,
      message_html: buildBuyerEmailHtml(order),
    },
    seller: {
      ...sellerParams,
      to_name: "Aaruni Tech",
      to_email: AARUNI_EMAIL_CONFIG.sellerEmail,
      seller_email: AARUNI_EMAIL_CONFIG.sellerEmail,
      message_html: buildSellerEmailHtml(order),
    },
  };
}

function sendEmailTemplate(templateId, params) {
  return window.emailjs.send(AARUNI_EMAIL_CONFIG.serviceId, templateId, params);
}

function toEmailJsErrorDetails(error) {
  if (!error) {
    return { message: "Unknown EmailJS error." };
  }

  if (typeof error === "string") {
    return { message: error };
  }

  const status = error.status != null ? String(error.status) : "";
  const text = error.text != null ? String(error.text) : "";
  const message = error.message != null ? String(error.message) : text || "EmailJS send failed.";

  return {
    message,
    status,
    text,
    raw: error,
  };
}

function sendOrderEmails(order) {
  if (!initEmailService()) {
    const missing = [];
    if (!window.emailjs) missing.push("emailjs_sdk_not_loaded");
    if (isEmailPlaceholder(AARUNI_EMAIL_CONFIG.publicKey)) missing.push("public_key");
    if (isEmailPlaceholder(AARUNI_EMAIL_CONFIG.serviceId)) missing.push("service_id");
    if (isEmailPlaceholder(AARUNI_EMAIL_CONFIG.buyerTemplateId)) missing.push("buyer_template_id");
    if (isEmailPlaceholder(AARUNI_EMAIL_CONFIG.sellerTemplateId)) missing.push("seller_template_id");

    console.warn("[EmailJS] Not configured", {
      missing,
      serviceId: AARUNI_EMAIL_CONFIG.serviceId,
      buyerTemplateId: AARUNI_EMAIL_CONFIG.buyerTemplateId,
      sellerTemplateId: AARUNI_EMAIL_CONFIG.sellerTemplateId,
      publicKey: maskKey(AARUNI_EMAIL_CONFIG.publicKey),
      adminTo: AARUNI_EMAIL_CONFIG.sellerEmail,
    });

    return Promise.resolve({
      ok: false,
      skipped: true,
      reason: `EmailJS is not configured. Missing: ${missing.join(", ")}`,
    });
  }

  const params = buildTemplateParams(order);
  const emailJobs = [];

  if (order.buyer.email) {
    console.info("[EmailJS] Sending buyer email", {
      to: order.buyer.email,
      templateId: AARUNI_EMAIL_CONFIG.buyerTemplateId,
      orderId: order.id,
    });
    emailJobs.push(
      sendEmailTemplate(AARUNI_EMAIL_CONFIG.buyerTemplateId, params.buyer)
        .then((response) => ({ type: "buyer", ok: true, response }))
        .catch((error) => ({ type: "buyer", ok: false, error: toEmailJsErrorDetails(error) }))
    );
  } else {
    emailJobs.push(Promise.resolve({ type: "buyer", ok: false, skipped: true, reason: "Buyer email is missing." }));
  }

  console.info("[EmailJS] Sending admin email", {
    to: AARUNI_EMAIL_CONFIG.sellerEmail,
    templateId: AARUNI_EMAIL_CONFIG.sellerTemplateId,
    orderId: order.id,
  });
  emailJobs.push(
    sendEmailTemplate(AARUNI_EMAIL_CONFIG.sellerTemplateId, params.seller)
      .then((response) => ({ type: "seller", ok: true, response }))
      .catch((error) => ({ type: "seller", ok: false, error: toEmailJsErrorDetails(error) }))
  );

  return Promise.all(emailJobs).then((results) => ({
    ok: results.every((result) => result.ok || result.skipped),
    results,
  }));
}

window.AaruniEmail = {
  initEmailService,
  isEmailConfigured,
  sendOrderEmails,
  buildBuyerEmailHtml,
  buildSellerEmailHtml,
  buildTemplateParams,
};
