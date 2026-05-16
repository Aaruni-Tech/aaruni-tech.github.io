const AARUNI_EMAIL_CONFIG = {
  publicKey: "YOUR_EMAILJS_PUBLIC_KEY",
  serviceId: "YOUR_EMAILJS_SERVICE_ID",
  buyerTemplateId: "YOUR_BUYER_TEMPLATE_ID",
  sellerTemplateId: "YOUR_SELLER_TEMPLATE_ID",
  sellerEmail: "tech.aaruni@gmail.com",
};

let emailJsInitialized = false;

function isEmailPlaceholder(value) {
  return !value || String(value).startsWith("YOUR_");
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
      <div style="max-width:680px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
        <div style="background:#0f766e;color:#ffffff;padding:24px;">
          <h1 style="margin:0;font-size:24px;">Aaruni Tech</h1>
          <p style="margin:8px 0 0;font-size:16px;">Thanks ${escapeEmailHtml(order.buyer.name)}, your order is confirmed.</p>
        </div>
        <div style="padding:24px;">
          <p style="margin:0 0 18px;color:#475467;">We will notify you when your order is packed and shipped.</p>
          <div style="display:grid;gap:10px;margin-bottom:22px;">
            <p style="margin:0;"><strong>Order ID:</strong> ${escapeEmailHtml(order.id)}</p>
            <p style="margin:0;"><strong>Order Date:</strong> ${escapeEmailHtml(order.orderDate)}</p>
            <p style="margin:0;"><strong>Payment ID:</strong> ${escapeEmailHtml(order.payment.id)}</p>
            <p style="margin:0;"><strong>Estimated Delivery:</strong> ${escapeEmailHtml(order.estimatedDeliveryDate)}</p>
          </div>
          <table style="width:100%;border-collapse:collapse;margin:0 0 22px;">
            <thead>
              <tr style="background:#f9fafb;color:#475467;font-size:13px;">
                <th style="padding:12px;text-align:left;">Product</th>
                <th style="padding:12px;text-align:center;">Qty</th>
                <th style="padding:12px;text-align:right;">Price</th>
                <th style="padding:12px;text-align:right;">Total</th>
              </tr>
            </thead>
            <tbody>${buildItemsHtml(order)}</tbody>
          </table>
          <p style="margin:0 0 8px;"><strong>Total Amount:</strong> ${window.AaruniOrders.formatOrderPrice(order.totalAmount)}</p>
          <p style="margin:0 0 18px;"><strong>Delivery Address:</strong> ${escapeEmailHtml(order.buyer.address || "not provided")}</p>
          <a href="${escapeEmailHtml(order.trackingUrl)}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:700;">Track Order</a>
          <p style="margin:22px 0 0;color:#667085;font-size:13px;">Need help? Contact ${escapeEmailHtml(order.supportEmail)}.</p>
        </div>
      </div>
    </div>
  `;
}

function buildSellerEmailHtml(order) {
  return `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111827;">
      <h2 style="margin:0 0 12px;">New Aaruni Tech Order</h2>
      <p><strong>Order ID:</strong> ${escapeEmailHtml(order.id)}</p>
      <p><strong>Timestamp:</strong> ${escapeEmailHtml(order.createdAt)}</p>
      <p><strong>Customer:</strong> ${escapeEmailHtml(order.buyer.name)}</p>
      <p><strong>Phone:</strong> ${escapeEmailHtml(order.buyer.phone || "not provided")}</p>
      <p><strong>Email:</strong> ${escapeEmailHtml(order.buyer.email || "not provided")}</p>
      <p><strong>Address:</strong> ${escapeEmailHtml(order.buyer.address || "not provided")}</p>
      <p><strong>Items:</strong><br>${escapeEmailHtml(buildItemsText(order)).replace(/\n/g, "<br>")}</p>
      <p><strong>Total:</strong> ${window.AaruniOrders.formatOrderPrice(order.totalAmount)}</p>
      <p><strong>Razorpay Payment ID:</strong> ${escapeEmailHtml(order.payment.id)}</p>
    </div>
  `;
}

function buildTemplateParams(order) {
  const sharedParams = {
    order_id: order.id,
    invoice_number: order.invoiceNumber,
    order_date: order.orderDate,
    order_timestamp: order.createdAt,
    order_status: order.status,
    customer_name: order.buyer.name,
    customer_email: order.buyer.email,
    customer_phone: order.buyer.phone,
    delivery_address: order.buyer.address,
    items_text: buildItemsText(order),
    items_html: buildItemsHtml(order),
    total_amount: window.AaruniOrders.formatOrderPrice(order.totalAmount),
    payment_id: order.payment.id,
    estimated_delivery_date: order.estimatedDeliveryDate,
    support_email: order.supportEmail,
    tracking_url: order.trackingUrl,
  };

  return {
    buyer: {
      ...sharedParams,
      to_name: order.buyer.name,
      to_email: order.buyer.email,
      message_html: buildBuyerEmailHtml(order),
    },
    seller: {
      ...sharedParams,
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

function sendOrderEmails(order) {
  if (!initEmailService()) {
    console.warn("EmailJS is not configured. Update email.js with your EmailJS public key, service ID, and template IDs.");
    return Promise.resolve({ ok: false, skipped: true, reason: "EmailJS is not configured." });
  }

  const params = buildTemplateParams(order);
  const emailJobs = [];

  if (order.buyer.email) {
    emailJobs.push(
      sendEmailTemplate(AARUNI_EMAIL_CONFIG.buyerTemplateId, params.buyer)
        .then((response) => ({ type: "buyer", ok: true, response }))
        .catch((error) => ({ type: "buyer", ok: false, error }))
    );
  } else {
    emailJobs.push(Promise.resolve({ type: "buyer", ok: false, skipped: true, reason: "Buyer email is missing." }));
  }

  emailJobs.push(
    sendEmailTemplate(AARUNI_EMAIL_CONFIG.sellerTemplateId, params.seller)
      .then((response) => ({ type: "seller", ok: true, response }))
      .catch((error) => ({ type: "seller", ok: false, error }))
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
