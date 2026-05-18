function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatINR(amount) {
  return `Rs. ${Number(amount || 0).toLocaleString("en-IN")}`;
}

function buildItemsHtml(order) {
  const items = Array.isArray(order.items) ? order.items : [];
  return items
    .map((item) => {
      const image = item.image ? `<img src="${escapeHtml(item.image)}" alt="" width="64" height="48" style="display:block;border-radius:8px;object-fit:cover;background:#f3f4f6;border:1px solid #e5e7eb;" />` : "";
      return `
        <tr>
          <td style="padding:12px 10px;border-bottom:1px solid #eef2f7;vertical-align:top;">${image}</td>
          <td style="padding:12px 10px;border-bottom:1px solid #eef2f7;vertical-align:top;">
            <div style="font-weight:800;color:#101828;">${escapeHtml(item.name)}</div>
            <div style="color:#667085;font-size:13px;margin-top:2px;">Qty: ${escapeHtml(item.quantity)} • ${escapeHtml(item.category || "")}</div>
          </td>
          <td style="padding:12px 10px;border-bottom:1px solid #eef2f7;vertical-align:top;text-align:right;white-space:nowrap;font-weight:800;color:#101828;">${escapeHtml(formatINR(item.price))}</td>
          <td style="padding:12px 10px;border-bottom:1px solid #eef2f7;vertical-align:top;text-align:right;white-space:nowrap;font-weight:900;color:#101828;">${escapeHtml(formatINR(item.lineTotal))}</td>
        </tr>
      `;
    })
    .join("");
}

function buildItemsTableHtml(order) {
  return `<table style="width:100%;border-collapse:collapse;margin:0 0 12px;">
    <thead>
      <tr>
        <th style="text-align:left;padding:10px;border-bottom:1px solid #e5e7eb;color:#667085;font-size:12px;">Item</th>
        <th style="text-align:left;padding:10px;border-bottom:1px solid #e5e7eb;color:#667085;font-size:12px;">Details</th>
        <th style="text-align:right;padding:10px;border-bottom:1px solid #e5e7eb;color:#667085;font-size:12px;">Price</th>
        <th style="text-align:right;padding:10px;border-bottom:1px solid #e5e7eb;color:#667085;font-size:12px;">Total</th>
      </tr>
    </thead>
    <tbody>${buildItemsHtml(order)}</tbody>
  </table>`;
}

function buildCustomerEmailHtml(order) {
  const orange = "#ff6a00";
  return `
  <div style="margin:0;padding:0;background:#fff7ea;">
    <div style="max-width:680px;margin:0 auto;padding:24px 14px;">
      <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden;box-shadow:0 18px 50px rgba(17,24,39,0.10);font-family:Arial,sans-serif;line-height:1.45;">
        <div style="padding:18px 20px;background:linear-gradient(90deg,#111111 0%,#1b1b1c 55%,#111111 100%);color:#ffffff;">
          <div style="font-weight:900;letter-spacing:0.2px;font-size:18px;">Aaruni Tech</div>
          <div style="margin-top:6px;font-size:14px;color:rgba(255,255,255,0.9);">Your order is confirmed</div>
        </div>

        <div style="padding:18px 20px;">
          <h2 style="margin:0 0 10px;font-size:20px;color:#101828;">Thanks ${escapeHtml(order.buyer.name)}, your order is confirmed.</h2>
          <p style="margin:0 0 14px;color:#475467;">We’ll notify you when your order is packed and shipped.</p>

          <div style="border:1px solid #eef2f7;border-radius:12px;padding:12px 14px;background:#fafafa;margin:0 0 16px;">
            <p style="margin:0;"><strong>Order ID:</strong> ${escapeHtml(order.id)}</p>
            <p style="margin:6px 0 0;"><strong>Order Date:</strong> ${escapeHtml(order.orderDate)} ${order.orderTime ? escapeHtml(order.orderTime) : ""}</p>
            <p style="margin:6px 0 0;"><strong>Payment Status:</strong> ${escapeHtml(order.payment.status)}</p>
            <p style="margin:6px 0 0;"><strong>Payment ID:</strong> ${escapeHtml(order.payment.id)}</p>
            <p style="margin:6px 0 0;"><strong>Estimated Delivery:</strong> ${escapeHtml(order.estimatedDeliveryDate)}</p>
          </div>

          <table style="width:100%;border-collapse:collapse;margin:0 0 16px;">
            <thead>
              <tr>
                <th style="text-align:left;padding:10px;border-bottom:1px solid #e5e7eb;color:#667085;font-size:12px;">Item</th>
                <th style="text-align:left;padding:10px;border-bottom:1px solid #e5e7eb;color:#667085;font-size:12px;">Details</th>
                <th style="text-align:right;padding:10px;border-bottom:1px solid #e5e7eb;color:#667085;font-size:12px;">Price</th>
                <th style="text-align:right;padding:10px;border-bottom:1px solid #e5e7eb;color:#667085;font-size:12px;">Total</th>
              </tr>
            </thead>
            <tbody>
              ${buildItemsHtml(order)}
            </tbody>
          </table>

          <div style="display:flex;gap:14px;flex-wrap:wrap;align-items:flex-start;justify-content:space-between;border-top:1px solid #eef2f7;padding-top:14px;">
            <div style="min-width:260px;flex:1;">
              <div style="font-weight:900;color:#101828;margin-bottom:8px;">Shipping Address</div>
              <div style="color:#344054;">${escapeHtml(order.buyer.address || "Not provided")}</div>
              <div style="color:#667085;font-size:13px;margin-top:6px;">Phone: ${escapeHtml(order.buyer.phone || "Not provided")} • Email: ${escapeHtml(order.buyer.email || "Not provided")}</div>
            </div>
            <div style="min-width:240px;flex:0 0 auto;">
              <div style="font-weight:900;color:#101828;margin-bottom:8px;">Price Details</div>
              <div style="display:flex;justify-content:space-between;gap:12px;color:#344054;">
                <span>Subtotal</span><span>${escapeHtml(formatINR(order.subtotal))}</span>
              </div>
              <div style="display:flex;justify-content:space-between;gap:12px;color:#344054;margin-top:6px;">
                <span>Shipping</span><span>${escapeHtml(formatINR(order.shippingCharge))}</span>
              </div>
              <div style="display:flex;justify-content:space-between;gap:12px;color:#101828;margin-top:10px;font-weight:950;font-size:16px;">
                <span>Total</span><span>${escapeHtml(formatINR(order.totalAmount))}</span>
              </div>
            </div>
          </div>

          <div style="margin-top:16px;">
            <a href="${escapeHtml(order.trackingUrl)}" style="display:inline-block;background:${orange};color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:900;">Track Order</a>
          </div>

          <p style="margin:18px 0 0;color:#667085;font-size:13px;">Need help? Contact ${escapeHtml(order.supportEmail)}.</p>
        </div>
      </div>
    </div>
  </div>`;
}

function buildAdminEmailHtml(order) {
  return `
    <div style="font-family:Arial,sans-serif;line-height:1.5">
      <h2 style="margin:0 0 10px">New Aaruni Tech order</h2>
      <p style="margin:0 0 6px"><strong>Order ID:</strong> ${escapeHtml(order.id)}</p>
      <p style="margin:0 0 6px"><strong>Timestamp:</strong> ${escapeHtml(order.createdAt)}</p>
      <p style="margin:0 0 6px"><strong>Payment:</strong> ${escapeHtml(order.payment.status)} • ${escapeHtml(order.payment.id)}</p>
      <p style="margin:0 0 6px"><strong>Total:</strong> ${escapeHtml(formatINR(order.totalAmount))}</p>
      <h3 style="margin:16px 0 6px">Customer</h3>
      <p style="margin:0 0 6px"><strong>Name:</strong> ${escapeHtml(order.buyer.name)}</p>
      <p style="margin:0 0 6px"><strong>Phone:</strong> ${escapeHtml(order.buyer.phone || "not provided")}</p>
      <p style="margin:0 0 6px"><strong>Email:</strong> ${escapeHtml(order.buyer.email || "not provided")}</p>
      <p style="margin:0 0 6px"><strong>Address:</strong> ${escapeHtml(order.buyer.address || "not provided")}</p>
      <h3 style="margin:16px 0 6px">Items</h3>
      <table style="width:100%;border-collapse:collapse">
        <thead>
          <tr>
            <th style="text-align:left;padding:8px;border-bottom:1px solid #e5e7eb">Product</th>
            <th style="text-align:right;padding:8px;border-bottom:1px solid #e5e7eb">Qty</th>
            <th style="text-align:right;padding:8px;border-bottom:1px solid #e5e7eb">Price</th>
            <th style="text-align:right;padding:8px;border-bottom:1px solid #e5e7eb">Line</th>
          </tr>
        </thead>
        <tbody>${buildItemsHtml(order)}</tbody>
      </table>
    </div>
  `;
}

module.exports = {
  buildCustomerEmailHtml,
  buildAdminEmailHtml,
  buildItemsTableHtml,
};
