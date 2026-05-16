const CONFIG = {
  recipient: "tech.aaruni@gmail.com",
  senderName: "Aaruni Tech",
  webhookTokenProperty: "WEBHOOK_TOKEN",
};

function doGet() {
  return ContentService.createTextOutput("Aaruni Tech webhook is running.");
}

function doPost(e) {
  try {
    if (!isAuthorizedRequest_(e)) {
      return jsonResponse_({ ok: false, error: "unauthorized" });
    }

    const payloadText = e && e.postData && e.postData.contents ? e.postData.contents : "{}";
    const payload = JSON.parse(payloadText);
    const eventName = payload && payload.event ? String(payload.event) : "";

    if (!shouldNotify_(eventName)) {
      return jsonResponse_({ ok: true, ignored: true, event: eventName });
    }

    const summary = buildSummary_(payload);
    MailApp.sendEmail({
      to: CONFIG.recipient,
      subject: summary.subject,
      body: summary.plainText,
      htmlBody: summary.htmlBody,
      name: CONFIG.senderName,
    });

    return jsonResponse_({ ok: true, notified: true, event: eventName });
  } catch (error) {
    return jsonResponse_({ ok: false, error: String(error) });
  }
}

function isAuthorizedRequest_(e) {
  const expectedToken = PropertiesService.getScriptProperties().getProperty(CONFIG.webhookTokenProperty);

  if (!expectedToken) {
    return false;
  }

  const receivedToken = e && e.parameter && e.parameter.token ? String(e.parameter.token) : "";
  return receivedToken === expectedToken;
}

function shouldNotify_(eventName) {
  return eventName === "payment.captured" || eventName === "order.paid" || eventName === "payment.failed";
}

function buildSummary_(payload) {
  const eventName = payload && payload.event ? String(payload.event) : "payment event";
  const payment = payload && payload.payload && payload.payload.payment && payload.payload.payment.entity
    ? payload.payload.payment.entity
    : null;
  const order = payload && payload.payload && payload.payload.order && payload.payload.order.entity
    ? payload.payload.order.entity
    : null;
  const notes = collectNotes_(payment, order);

  const paymentId = payment && payment.id ? String(payment.id) : "unknown";
  const orderId = order && order.id ? String(order.id) : payment && payment.order_id ? String(payment.order_id) : "not available";
  const amount = payment && typeof payment.amount === "number" ? payment.amount / 100 : null;
  const currency = payment && payment.currency ? String(payment.currency) : "INR";
  const amountText = amount !== null ? `${currency} ${amount.toFixed(2)}` : "unknown amount";
  const customerName = notes.delivery_name || payment && payment.notes && payment.notes.name || "not provided";
  const customerPhone = notes.delivery_phone || payment && payment.contact || "not provided";
  const customerEmail = payment && payment.email ? String(payment.email) : "not provided";
  const deliveryAddress = notes.delivery_address || "not provided";
  const cartItems = notes.cart_items || "not provided";
  const cartQuantity = notes.cart_quantity || "not provided";
  const cartTotal = notes.cart_total || amountText;
  const paymentMethod = payment && payment.method ? String(payment.method) : "not provided";
  const paymentStatus = payment && payment.status ? String(payment.status) : "not provided";

  const subjectMap = {
    "payment.captured": "Order placed - payment received",
    "order.paid": "Order paid",
    "payment.failed": "Payment failed",
  };

  const title = subjectMap[eventName] || "Razorpay webhook event";
  const subject = `[Aaruni Tech] ${title}`;
  const plainText = [
    `Event: ${eventName}`,
    `Customer: ${customerName}`,
    `Phone: ${customerPhone}`,
    `Email: ${customerEmail}`,
    `Delivery address: ${deliveryAddress}`,
    `Cart items: ${cartItems}`,
    `Cart quantity: ${cartQuantity}`,
    `Cart total: ${cartTotal}`,
    `Payment ID: ${paymentId}`,
    `Order ID: ${orderId}`,
    `Amount: ${amountText}`,
    `Method: ${paymentMethod}`,
    `Status: ${paymentStatus}`,
    `Time: ${new Date().toISOString()}`,
  ].join("\n");

  const htmlBody = `
    <div style="font-family:Arial,sans-serif;line-height:1.5">
      <h2 style="margin:0 0 12px">Aaruni Tech order update</h2>
      <p><strong>Event:</strong> ${escapeHtml_(eventName)}</p>
      <h3 style="margin:18px 0 8px">Customer</h3>
      <p><strong>Name:</strong> ${escapeHtml_(customerName)}</p>
      <p><strong>Phone:</strong> ${escapeHtml_(customerPhone)}</p>
      <p><strong>Email:</strong> ${escapeHtml_(customerEmail)}</p>
      <p><strong>Delivery address:</strong> ${escapeHtml_(deliveryAddress)}</p>
      <h3 style="margin:18px 0 8px">Order</h3>
      <p><strong>Cart items:</strong> ${escapeHtml_(cartItems)}</p>
      <p><strong>Cart quantity:</strong> ${escapeHtml_(cartQuantity)}</p>
      <p><strong>Cart total:</strong> ${escapeHtml_(cartTotal)}</p>
      <h3 style="margin:18px 0 8px">Payment</h3>
      <p><strong>Payment ID:</strong> ${escapeHtml_(paymentId)}</p>
      <p><strong>Order ID:</strong> ${escapeHtml_(orderId)}</p>
      <p><strong>Amount:</strong> ${escapeHtml_(amountText)}</p>
      <p><strong>Method:</strong> ${escapeHtml_(paymentMethod)}</p>
      <p><strong>Status:</strong> ${escapeHtml_(paymentStatus)}</p>
      <p><strong>Time:</strong> ${escapeHtml_(new Date().toISOString())}</p>
    </div>
  `;

  return { subject, plainText, htmlBody };
}

function collectNotes_(payment, order) {
  const notes = {};

  if (order && order.notes && typeof order.notes === "object") {
    Object.keys(order.notes).forEach((key) => {
      notes[key] = String(order.notes[key] || "");
    });
  }

  if (payment && payment.notes && typeof payment.notes === "object") {
    Object.keys(payment.notes).forEach((key) => {
      notes[key] = String(payment.notes[key] || "");
    });
  }

  return notes;
}

function jsonResponse_(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}

function escapeHtml_(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
