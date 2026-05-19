const CART_KEY = "ecomCartV1";

function loadCart() {
  try {
    const cart = JSON.parse(window.localStorage.getItem(CART_KEY));
    return Array.isArray(cart) ? cart : [];
  } catch (error) {
    return [];
  }
}

function saveCart(cart) {
  window.localStorage.setItem(CART_KEY, JSON.stringify(cart));
}

function addToCart({ productId, quantity = 1 }) {
  const cart = loadCart();
  const existing = cart.find((item) => item.productId === productId);
  const qty = Math.max(1, Math.floor(Number(quantity || 1)));

  if (existing) {
    existing.quantity += qty;
  } else {
    cart.push({ productId, quantity: qty });
  }

  saveCart(cart);
  return cart;
}

function clearCart() {
  saveCart([]);
}

function getCartItems() {
  return loadCart();
}

async function checkout({ productId, quantity, customerName, customerEmail }) {
  if (!window.EcommerceSupabase || !window.EcommerceSupabase.placeOrder) {
    return { ok: false, error: "Supabase backend not loaded." };
  }

  const result = await window.EcommerceSupabase.placeOrder({
    productId,
    quantity,
    customerName,
    customerEmail,
  });

  if (!result || !result.ok) {
    return result;
  }

  return { ok: true, order: result.order };
}

function buildOrderConfirmationText(order) {
  if (!order) {
    return "Order placed.";
  }

  return `Thanks! Your order is confirmed.\n\nOrder ID: ${order.id}\nProduct: ${order.product_name}\nQty: ${order.quantity}\nTotal: ₹${Number(order.total_price || 0).toLocaleString("en-IN")}\nStatus: ${order.order_status}`;
}

window.EcommerceFrontend = {
  addToCart,
  clearCart,
  getCartItems,
  checkout,
  buildOrderConfirmationText,
};

