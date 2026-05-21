const products = [
  {
    id: "nova-phone-lite",
    name: "Nova Phone Lite 5G",
    category: "Mobiles",
    price: 12999,
    rating: 4.4,
    description: "A balanced 5G phone with smooth display and all-day battery life.",
    image: "",
  },
  {
    id: "spark-phone-max",
    name: "Spark Phone Max",
    category: "Mobiles",
    price: 17999,
    rating: 4.5,
    description: "Large screen, fast charging, and dependable cameras for daily use.",
    image: "",
  },
  {
    id: "airbuds-prime",
    name: "AirBuds Prime ANC",
    category: "Audio",
    price: 2499,
    rating: 4.6,
    description: "Noise control earbuds with clear calls and pocket-friendly charging.",
    image: "",
  },
  {
    id: "soundbar-mini",
    name: "SoundBar Mini 60W",
    category: "Audio",
    price: 3999,
    rating: 4.3,
    description: "Compact TV audio upgrade for bedrooms, hostels, and small apartments.",
    image: "",
  },
  {
    id: "workmate-laptop",
    name: "WorkMate Laptop 14",
    category: "Computing",
    price: 38999,
    rating: 4.4,
    description: "Lightweight laptop for study, office work, browsing, and video calls.",
    image: "",
  },
  {
    id: "usb-c-hub",
    name: "6-in-1 USB-C Hub",
    category: "Computing",
    price: 1599,
    rating: 4.2,
    description: "Connect display, storage, and cards with one slim travel adapter.",
    image: "",
  },
  {
    id: "smart-bulb-pack",
    name: "Smart Bulb Duo Pack",
    category: "Smart Home",
    price: 1199,
    rating: 4.1,
    description: "Warm and cool lighting presets for living rooms and study spaces.",
    image: "",
  },
  {
    id: "security-camera",
    name: "HomeGuard Wi-Fi Camera",
    category: "Smart Home",
    price: 2199,
    rating: 4.5,
    description: "Indoor security camera with motion alerts and night visibility.",
    image: "",
  },
  {
    id: "power-bank-pro",
    name: "Aaruni Power Bank Pro",
    category: "Accessories",
    price: 1799,
    rating: 4.7,
    description: "20,000 mAh backup power with dual USB output and slim carry design.",
    image: "",
  },
  {
    id: "fast-charger",
    name: "RapidCharge 65W Adapter",
    category: "Accessories",
    price: 1499,
    rating: 4.3,
    description: "Fast wall charger for compatible phones, tablets, and laptops.",
    image: "",
  },
  {
    id: "keyboard-mouse",
    name: "QuietKey Keyboard Mouse Set",
    category: "Computing",
    price: 1299,
    rating: 4.2,
    description: "Wireless desk combo with soft keys and precise everyday tracking.",
    image: "",
  },
  {
    id: "neckband-sport",
    name: "Pulse Neckband Sport",
    category: "Audio",
    price: 999,
    rating: 4.1,
    description: "Lightweight neckband for calls, workouts, and long commute playlists.",
    image: "",
  },
];

const CART_STORAGE_KEY = "aaruniTechCart";
const SIGNUP_STORAGE_KEY = "aaruniTechSignupProfile";
const RAZORPAY_KEY_ID = "rzp_test_SpYO2ojU9ZzsNG";
const RAZORPAY_BUSINESS_NAME = "Aaruni Tech";
const RAZORPAY_SUPPORT_EMAIL = "tech.aaruni@gmail.com";

const productGrid = document.querySelector("#productGrid");
const resultSummary = document.querySelector("#resultSummary");
const searchForm = document.querySelector("#searchForm");
const searchInput = document.querySelector("#searchInput");
const cartCount = document.querySelector("#cartCount");
const cartButton = document.querySelector("#cartButton");
const accountButton = document.querySelector("#accountButton");
const toast = document.querySelector("#toast");
const pageOverlay = document.querySelector("#pageOverlay");
const cartDrawer = document.querySelector("#cartDrawer");
const closeCartButton = document.querySelector("#closeCartButton");
const cartItemsContainer = document.querySelector("#cartItems");
const cartPanelCount = document.querySelector("#cartPanelCount");
const cartSubtotal = document.querySelector("#cartSubtotal");
const clearCartButton = document.querySelector("#clearCartButton");
const checkoutButton = document.querySelector("#checkoutButton");
const accountModal = document.querySelector("#accountModal");
const closeAccountButton = document.querySelector("#closeAccountButton");
const accountSignupForm = document.querySelector("#accountSignupForm");

let activeCategory = "All";
let cartItems = loadCart();
let toastTimer;

const FALLBACK_IMAGE_URL = "https://via.placeholder.com/400x400?text=No+Image";
const BAD_HOSTS = ["localhost:7071", "localhost:37857"];

function isLocalhostUrl(value) {
  const raw = String(value || "").trim().toLowerCase();
  return BAD_HOSTS.some((host) => raw.includes(host)) || raw.includes("://localhost");
}

function getSafeImageUrl(value) {
  const raw = String(value || "").trim();

  if (!raw) {
    return FALLBACK_IMAGE_URL;
  }

  if (isLocalhostUrl(raw)) {
    return FALLBACK_IMAGE_URL;
  }

  // Only allow http(s) absolute URLs or same-origin relative paths.
  if (/^https?:\/\//i.test(raw) || raw.startsWith("/") || raw.startsWith("./") || raw.startsWith("../")) {
    return raw;
  }

  return FALLBACK_IMAGE_URL;
}

function onProductImageError(event) {
  const img = event.target;
  if (!img || img.tagName !== "IMG") return;
  if (img.dataset.fallbackApplied === "1") return;
  img.dataset.fallbackApplied = "1";
  img.src = FALLBACK_IMAGE_URL;
}

function sanitizeAllImages() {
  document.querySelectorAll("img").forEach((img) => {
    const src = String(img.currentSrc || img.src || "");
    if (BAD_HOSTS.some((host) => src.includes(host))) {
      img.dataset.fallbackApplied = "1";
      img.src = FALLBACK_IMAGE_URL;
      if (img.srcset) {
        img.srcset = "";
      }
    }
  });
}

function formatPrice(price) {
  return `Rs. ${price.toLocaleString("en-IN")}`;
}

function getFilteredProducts() {
  const query = searchInput.value.trim().toLowerCase();

  return products.filter((product) => {
    const matchesCategory = activeCategory === "All" || product.category === activeCategory;
    const matchesSearch = product.name.toLowerCase().includes(query);
    return matchesCategory && matchesSearch;
  });
}

function productTemplate(product) {
  const safeImage = getSafeImageUrl(product.image);
  return `
    <article class="product-card">
      <div class="product-image-wrap">
        <img src="${safeImage}" alt="${product.name}" loading="lazy" onerror="this.onerror=null;this.src='${FALLBACK_IMAGE_URL}'" />
      </div>
      <div class="product-body">
        <div class="product-meta">
          <span class="badge">${product.category}</span>
          <span class="rating">${product.rating.toFixed(1)} / 5</span>
        </div>
        <h3>${product.name}</h3>
        <p>${product.description}</p>
        <div class="product-footer">
          <span class="price">${formatPrice(product.price)}</span>
          <button class="add-button" type="button" data-add-to-cart="${product.id}">Add to cart</button>
        </div>
      </div>
    </article>
  `;
}

function loadCart() {
  try {
    const savedCart = JSON.parse(window.localStorage.getItem(CART_STORAGE_KEY));

    if (!Array.isArray(savedCart)) {
      return [];
    }

    return savedCart
      .filter((item) => products.some((product) => product.id === item.id))
      .map((item) => ({
        id: item.id,
        quantity: Number.isInteger(item.quantity) && item.quantity > 0 ? item.quantity : 1,
      }));
  } catch (error) {
    return [];
  }
}

function saveCart() {
  try {
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cartItems));
  } catch (error) {
    return;
  }
}

function getCartQuantity() {
  return cartItems.reduce((total, item) => total + item.quantity, 0);
}

function getCartSubtotal() {
  return cartItems.reduce((total, item) => {
    const product = products.find((entry) => entry.id === item.id);
    return product ? total + product.price * item.quantity : total;
  }, 0);
}

function renderCart() {
  const quantity = getCartQuantity();
  const subtotal = getCartSubtotal();

  cartPanelCount.textContent = quantity;
  cartSubtotal.textContent = formatPrice(subtotal);
  clearCartButton.disabled = quantity === 0;
  checkoutButton.disabled = quantity === 0;

  if (quantity === 0) {
    cartItemsContainer.innerHTML = `
      <div class="cart-empty">
        Your cart is empty. Add products from the marketplace grid to continue to checkout.
      </div>
    `;
    return;
  }

  cartItemsContainer.innerHTML = cartItems
    .map((item) => {
      const product = products.find((entry) => entry.id === item.id);

      if (!product) {
        return "";
      }

      return `
        <div class="cart-line">
          <img src="${getSafeImageUrl(product.image)}" alt="${product.name}" loading="lazy" onerror="this.onerror=null;this.src='${FALLBACK_IMAGE_URL}'" />
          <div>
            <strong>${product.name}</strong>
            <span class="line-price">${formatPrice(product.price)} each</span>
            <div class="quantity-controls" aria-label="Quantity controls for ${product.name}">
              <button type="button" data-cart-decrease="${product.id}" aria-label="Decrease ${product.name} quantity">-</button>
              <span>Qty ${item.quantity}</span>
              <button type="button" data-cart-increase="${product.id}" aria-label="Increase ${product.name} quantity">+</button>
              <button class="remove-line" type="button" data-cart-remove="${product.id}">Remove</button>
            </div>
          </div>
        </div>
      `;
    })
    .join("");
}

function renderProducts() {
  const filteredProducts = getFilteredProducts();

  resultSummary.textContent = `${filteredProducts.length} of ${products.length} products shown`;

  if (filteredProducts.length === 0) {
    productGrid.innerHTML = `
      <div class="empty-state">
        No products matched your search. Try a different product name or category.
      </div>
    `;
    return;
  }

  productGrid.innerHTML = filteredProducts.map(productTemplate).join("");
}

function updateCategoryButtons() {
  document.querySelectorAll("[data-category]").forEach((button) => {
    button.classList.toggle("active", button.dataset.category === activeCategory);
  });
}

function setActiveCategory(category) {
  activeCategory = category;
  updateCategoryButtons();
  renderProducts();
  document.querySelector("#products").scrollIntoView({ behavior: "smooth", block: "start" });
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add("show");

  toastTimer = window.setTimeout(() => {
    toast.classList.remove("show");
  }, 2600);
}

function updateCartCount() {
  const quantity = getCartQuantity();
  cartCount.textContent = quantity;
  cartButton.setAttribute("aria-label", `Cart with ${quantity} items`);
  renderCart();
}

function addToCart(productId) {
  const product = products.find((item) => item.id === productId);

  if (!product) {
    return;
  }

  const existingCartItem = cartItems.find((item) => item.id === productId);

  if (existingCartItem) {
    existingCartItem.quantity += 1;
  } else {
    cartItems.push({ id: productId, quantity: 1 });
  }

  saveCart();
  updateCartCount();
  showToast(`${product.name} added to your cart.`);
}

function changeCartQuantity(productId, amount) {
  const existingCartItem = cartItems.find((item) => item.id === productId);

  if (!existingCartItem) {
    return;
  }

  existingCartItem.quantity += amount;

  if (existingCartItem.quantity <= 0) {
    cartItems = cartItems.filter((item) => item.id !== productId);
  }

  saveCart();
  updateCartCount();
}

function removeFromCart(productId) {
  cartItems = cartItems.filter((item) => item.id !== productId);
  saveCart();
  updateCartCount();
}

function loadSignupProfile() {
  try {
    const rawProfile = window.localStorage.getItem(SIGNUP_STORAGE_KEY);

    if (!rawProfile) {
      return {};
    }

    const parsedProfile = JSON.parse(rawProfile);

    if (!parsedProfile || typeof parsedProfile !== "object") {
      return {};
    }

    return parsedProfile;
  } catch (error) {
    return {};
  }
}

function truncateNote(value) {
  return String(value || "").slice(0, 240);
}

function getCartItemsSummary() {
  return cartItems
    .map((item) => {
      const product = products.find((entry) => entry.id === item.id);
      return product ? `${product.name} x ${item.quantity} (${formatPrice(product.price * item.quantity)})` : "";
    })
    .filter(Boolean)
    .join(", ");
}

function getDeliveryAddress(profile) {
  return [
    profile.houseNumber,
    profile.village,
    profile.mandal,
    profile.area,
    profile.district,
    profile.state,
  ]
    .filter(Boolean)
    .join(", ");
}

function isCheckoutProfileComplete(profile) {
  return Boolean(profile.name && profile.email && profile.phone && getDeliveryAddress(profile));
}

function startRazorpayCheckout() {
  const amount = getCartSubtotal();

  if (amount <= 0) {
    showToast("Add at least one product before checkout.");
    return;
  }

  if (typeof window.Razorpay !== "function") {
    showToast("Razorpay checkout could not load. Please try again.");
    return;
  }

  const signupProfile = loadSignupProfile();

  if (!isCheckoutProfileComplete(signupProfile)) {
    showToast("Add your name, email, phone, and delivery address before checkout.");
    openAccountPanel();
    return;
  }

  console.info("[Checkout] Starting Razorpay checkout", {
    cartQty: getCartQuantity(),
    amount,
    buyer: {
      name: signupProfile.name,
      email: signupProfile.email,
      phone: signupProfile.phone,
      address: getDeliveryAddress(signupProfile),
    },
  });

  const amountInPaise = Math.round(amount * 100);

  const checkout = new window.Razorpay({
    key: RAZORPAY_KEY_ID,
    amount: amountInPaise,
    currency: "INR",
    name: RAZORPAY_BUSINESS_NAME,
    description: `Cart checkout - ${getCartQuantity()} item${getCartQuantity() === 1 ? "" : "s"}`,
    prefill: {
      name: signupProfile.name || "",
      email: signupProfile.email || "",
      contact: signupProfile.phone || "",
    },
    notes: {
      // Keep Razorpay notes non-sensitive.
      source: "aaruni-tech.github.io",
    },
    theme: {
      color: "#c51d63",
    },
    handler(response) {
      console.info("[Razorpay] Success handler invoked", { response });
      const paymentId = response && response.razorpay_payment_id ? response.razorpay_payment_id : "";
      console.info("[Razorpay] Payment ID", { paymentId });
      const orderDraft = window.AaruniOrders
        ? window.AaruniOrders.createOrder({
            cartItems: cartItems.map((item) => ({ ...item })),
            products,
            buyerProfile: signupProfile,
            paymentId,
            supportEmail: RAZORPAY_SUPPORT_EMAIL,
          })
        : null;

      console.info("[Checkout] Order draft created", {
        hasOrderDraft: Boolean(orderDraft),
        orderId: orderDraft && orderDraft.id,
        items: orderDraft && orderDraft.items ? orderDraft.items.length : 0,
        totalAmount: orderDraft && orderDraft.totalAmount,
      });

      const finalizeOrder = async () => {
        if (!orderDraft || !window.AaruniOrders) {
          showToast(paymentId ? `Payment received. Payment ID: ${paymentId}` : "Payment received.");
          return;
        }

        if (
          window.AaruniSupabaseBackend &&
          window.AaruniSupabaseBackend.isConfigured &&
          window.AaruniSupabaseBackend.isConfigured()
        ) {
          console.info("[Supabase] Attempting to save order after payment", {
            configured: true,
            paymentId,
            draftId: orderDraft.id,
          });
          try {
            const result = await window.AaruniSupabaseBackend.saveOrderAfterPayment({
              paymentId,
              orderDraft,
            });

            console.info("[Supabase] saveOrderAfterPayment result", result);

            if (result && result.ok && result.order) {
              window.AaruniOrders.saveOrder(result.order);
              showToast(`Order placed: ${result.order.id}`);

              if (window.AaruniSupabaseBackend && window.AaruniSupabaseBackend.sendOrderNotificationEmail) {
                try {
                  console.info("[OrderEmail] Sending admin order notification", { orderId: result.order.id });
                  const emailResult = await window.AaruniSupabaseBackend.sendOrderNotificationEmail(result.order);
                  console.info("[OrderEmail] sendOrderNotificationEmail result", emailResult);

                  if (emailResult && emailResult.ok) {
                    console.info("[OrderEmail] Admin notification accepted", {
                      orderId: result.order.id,
                      duplicate: Boolean(emailResult.duplicate),
                      skipped: Boolean(emailResult.skipped),
                    });
                  } else if (emailResult && emailResult.skipped) {
                    console.info("[OrderEmail] Admin notification skipped", emailResult);
                  } else {
                    console.warn("[OrderEmail] Admin notification failed or skipped", emailResult);
                  }
                } catch (error) {
                  console.warn("[OrderEmail] Admin notification threw", error);
                }
              } else {
                console.warn("[OrderEmail] Supabase notification helper is unavailable.");
              }

              return;
            }

            console.warn("Supabase order save failed.", result);
            window.AaruniOrders.saveOrder(orderDraft);
            showToast(`Payment received, but order could not be saved to the server. ${result && result.error ? String(result.error).slice(0, 140) : ""}`);
            return;
          } catch (error) {
            console.warn("Supabase order save failed.", error);
            window.AaruniOrders.saveOrder(orderDraft);
            const message = error && error.message ? String(error.message) : "Supabase save failed.";
            showToast(`Payment received, but order could not be saved to the server. ${message.slice(0, 140)}`);
            return;
          }
        } else {
          console.warn("[Supabase] Not configured or backend missing", {
            hasBackend: Boolean(window.AaruniSupabaseBackend),
            configured:
              Boolean(window.AaruniSupabaseBackend && window.AaruniSupabaseBackend.isConfigured && window.AaruniSupabaseBackend.isConfigured()),
            supabaseUrl: window.SUPABASE_URL || "",
            anonKeyPresent: Boolean(window.SUPABASE_ANON_KEY),
          });
        }

        if (window.AaruniBackend && window.AaruniBackend.isConfigured && window.AaruniBackend.isConfigured()) {
          try {
            const result = await window.AaruniBackend.createOrderAfterPayment({
              paymentId,
              orderDraft,
            });

            if (result && result.ok && result.order) {
              window.AaruniOrders.saveOrder(result.order);
              showToast(`Order confirmed: ${result.order.id}`);
              return;
            }

            console.warn("Order verification failed or was skipped.", result);
            showToast("Payment received. Order verification pending. Please contact support.");
            window.AaruniOrders.saveOrder(orderDraft);
            return;
          } catch (error) {
            console.warn("Order verification failed.", error);
            showToast("Payment received. Order verification pending. Please contact support.");
            window.AaruniOrders.saveOrder(orderDraft);
            return;
          }
        }

        // Static-only fallback: keep a local copy, but do not send order email without a successful DB save.
        window.AaruniOrders.saveOrder(orderDraft);
        showToast(`Order placed: ${orderDraft.id}`);
      };

      cartItems = [];
      saveCart();
      updateCartCount();
      closeCart();

      finalizeOrder();
    },
    modal: {
      ondismiss() {
        showToast("Razorpay checkout closed.");
      },
    },
  });

  checkout.open();
}

function openOverlay() {
  pageOverlay.hidden = false;
}

function closeOverlayIfIdle() {
  if (!document.body.classList.contains("cart-open") && !document.body.classList.contains("modal-open")) {
    pageOverlay.hidden = true;
  }
}

function openCart() {
  openOverlay();
  document.body.classList.add("cart-open");
  cartDrawer.setAttribute("aria-hidden", "false");
}

function closeCart() {
  document.body.classList.remove("cart-open");
  cartDrawer.setAttribute("aria-hidden", "true");
  closeOverlayIfIdle();
}

function openAccountPanel() {
  openOverlay();
  document.body.classList.add("modal-open");
  accountModal.hidden = false;
}

function closeAccountPanel() {
  document.body.classList.remove("modal-open");
  accountModal.hidden = true;
  closeOverlayIfIdle();
}

searchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  renderProducts();
});

searchInput.addEventListener("input", renderProducts);

document.querySelectorAll("[data-category]").forEach((button) => {
  button.addEventListener("click", () => {
    setActiveCategory(button.dataset.category);
  });
});

document.querySelectorAll("[data-category-card]").forEach((button) => {
  button.addEventListener("click", () => {
    setActiveCategory(button.dataset.categoryCard);
  });
});

document.addEventListener("click", (event) => {
  const addButton = event.target.closest("[data-add-to-cart]");
  const increaseButton = event.target.closest("[data-cart-increase]");
  const decreaseButton = event.target.closest("[data-cart-decrease]");
  const removeButton = event.target.closest("[data-cart-remove]");

  if (addButton) {
    addToCart(addButton.dataset.addToCart);
  }

  if (increaseButton) {
    changeCartQuantity(increaseButton.dataset.cartIncrease, 1);
  }

  if (decreaseButton) {
    changeCartQuantity(decreaseButton.dataset.cartDecrease, -1);
  }

  if (removeButton) {
    removeFromCart(removeButton.dataset.cartRemove);
  }
});

accountButton.addEventListener("click", () => {
  openAccountPanel();
});

cartButton.addEventListener("click", () => {
  openCart();
});

closeCartButton.addEventListener("click", closeCart);

closeAccountButton.addEventListener("click", closeAccountPanel);

pageOverlay.addEventListener("click", () => {
  closeCart();
  closeAccountPanel();
});

clearCartButton.addEventListener("click", () => {
  cartItems = [];
  saveCart();
  updateCartCount();
  showToast("Cart cleared.");
});

accountSignupForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const signupData = Object.fromEntries(new FormData(accountSignupForm).entries());

  try {
    window.localStorage.setItem(SIGNUP_STORAGE_KEY, JSON.stringify(signupData));
  } catch (error) {
    return;
  }

  showToast(`Thanks ${signupData.name}, your sign-up details were saved.`);
  closeAccountPanel();
});

checkoutButton.addEventListener("click", startRazorpayCheckout);

try {
  const params = new URLSearchParams(window.location.search);
  const shouldOpenCart = params.get("open_cart") === "1";
  const shouldOpenAccount = params.get("open_account") === "1";

  if (shouldOpenCart) {
    openCart();
  } else if (shouldOpenAccount) {
    openAccountPanel();
  }

  if (shouldOpenCart || shouldOpenAccount) {
    params.delete("open_cart");
    params.delete("open_account");
    const cleaned = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}${window.location.hash || ""}`;
    window.history.replaceState({}, "", cleaned);
  }
} catch (error) {
  // Ignore URL parsing failures.
}

// Safety: never keep broken localhost images in production.
document.addEventListener(
  "error",
  (event) => {
    const target = event.target;
    if (target && target.tagName === "IMG") {
      onProductImageError(event);
    }
  },
  true
);

// Global protection: if any code (including stale cached assets) injects localhost PNGs, swap them.
try {
  sanitizeAllImages();
  const observer = new MutationObserver(() => sanitizeAllImages());
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["src", "srcset"] });
} catch (error) {
  // ignore
}

renderProducts();
updateCartCount();
