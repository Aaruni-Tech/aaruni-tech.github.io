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

  const paymentId = payment && payment.id ? String(payment.id) : "unknown";
  const orderId = order && order.id ? String(order.id) : "unknown";
  const amount = payment && typeof payment.amount === "number" ? payment.amount / 100 : null;
  const currency = payment && payment.currency ? String(payment.currency) : "INR";
  const amountText = amount !== null ? `${currency} ${amount.toFixed(2)}` : "unknown amount";

  const subjectMap = {
    "payment.captured": "Payment received",
    "order.paid": "Order paid",
    "payment.failed": "Payment failed",
  };

  const title = subjectMap[eventName] || "Razorpay webhook event";
  const subject = `[Aaruni Tech] ${title}`;
  const plainText = [
    `Event: ${eventName}`,
    `Payment ID: ${paymentId}`,
    `Order ID: ${orderId}`,
    `Amount: ${amountText}`,
    `Time: ${new Date().toISOString()}`,
  ].join("\n");

  const htmlBody = `
    <div style="font-family:Arial,sans-serif;line-height:1.5">
      <h2 style="margin:0 0 12px">Aaruni Tech payment update</h2>
      <p><strong>Event:</strong> ${escapeHtml_(eventName)}</p>
      <p><strong>Payment ID:</strong> ${escapeHtml_(paymentId)}</p>
      <p><strong>Order ID:</strong> ${escapeHtml_(orderId)}</p>
      <p><strong>Amount:</strong> ${escapeHtml_(amountText)}</p>
      <p><strong>Time:</strong> ${escapeHtml_(new Date().toISOString())}</p>
    </div>
  `;

  return { subject, plainText, htmlBody };
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
