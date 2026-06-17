let AARUNI_APP_CONFIG = window.AARUNI_CONFIG || {};
let AARUNI_RAZORPAY_CONFIG = AARUNI_APP_CONFIG.razorpay || {};
let AARUNI_EMAIL_ENV_CONFIG = AARUNI_APP_CONFIG.email || {};
let AARUNI_ENVIRONMENT_MODE = AARUNI_APP_CONFIG.mode || window.AARUNI_ENVIRONMENT || "test";
let AARUNI_IS_TEST_MODE = !AARUNI_APP_CONFIG.isProduction;
let products = Array.isArray(AARUNI_APP_CONFIG.products) ? AARUNI_APP_CONFIG.products : [];
const LEGACY_CART_STORAGE_KEY = "aaruniTechCart";
let CART_STORAGE_KEY = `${LEGACY_CART_STORAGE_KEY}:${AARUNI_ENVIRONMENT_MODE}`;
const SIGNUP_STORAGE_KEY = "aaruniTechSignupProfile";
let RAZORPAY_KEY_ID = AARUNI_RAZORPAY_CONFIG.keyId || window.RAZORPAY_KEY_ID || "";
let RAZORPAY_BUSINESS_NAME = AARUNI_RAZORPAY_CONFIG.businessName || window.RAZORPAY_BUSINESS_NAME || "Aaruni Tech";
let RAZORPAY_SUPPORT_EMAIL = AARUNI_RAZORPAY_CONFIG.supportEmail || window.RAZORPAY_SUPPORT_EMAIL || "tech.aaruni@gmail.com";

const productGrid = document.querySelector("#productGrid");
const resultSummary = document.querySelector("#resultSummary");
const searchForm = document.querySelector("#searchForm");
const searchInput = document.querySelector("#searchInput");
const cartCount = document.querySelector("#cartCount");
const cartButton = document.querySelector("#cartButton");
const accountButton = document.querySelector("#accountButton");
const accountButtonText = document.querySelector("#accountButtonText");
const signupButton = document.querySelector("#signupButton");
const logoutButton = document.querySelector("#logoutButton");
const myOrdersButton = document.querySelector("#myOrdersButton");
const testModeBanner = document.querySelector("#testModeBanner");
const environmentModeBadge = document.querySelector("#environmentModeBadge");
const checkoutModeNote = document.querySelector("#checkoutModeNote");
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
const accountModalTitle = document.querySelector("#accountModalTitle");
const accountModalDescription = document.querySelector("#accountModalDescription");
const accountMessage = document.querySelector("#accountMessage");
const authTabs = document.querySelector("#authTabs");
const accountLoginForm = document.querySelector("#accountLoginForm");
const accountSignupForm = document.querySelector("#accountSignupForm");
const forgotPasswordForm = document.querySelector("#forgotPasswordForm");
const resetPasswordForm = document.querySelector("#resetPasswordForm");
const accountProfileForm = document.querySelector("#accountProfileForm");
const accountProfileName = document.querySelector("#accountProfileName");
const accountProfileEmail = document.querySelector("#accountProfileEmail");
const dealProductName = document.querySelector("#dealProductName");
const dealProductDescription = document.querySelector("#dealProductDescription");
const dealProductPrice = document.querySelector("#dealProductPrice");

let activeCategory = "All";
let cartItems = loadCart();
let toastTimer;
let authReady = false;
let currentAccount = { user: null, profile: null };
let pendingCheckoutAfterAuth = false;
let authSubscription = null;

const FALLBACK_IMAGE_URL = "https://via.placeholder.com/400x400?text=No+Image";
const BAD_HOSTS = ["localhost:7071", "localhost:37857"];

function normalizeRuntimeMode(value) {
  const raw = String(value || "").trim().toLowerCase();
  return raw === "production" || raw === "prod" || raw === "live" ? "production" : "test";
}

function getEnvironmentDefaults(mode) {
  const normalizedMode = normalizeRuntimeMode(mode);
  const environments = window.AARUNI_ENVIRONMENTS || {};
  return environments[normalizedMode] || {};
}

function mergeRuntimeConfig(publicConfig) {
  const currentConfig = window.AARUNI_CONFIG || AARUNI_APP_CONFIG || {};
  const mode = normalizeRuntimeMode(publicConfig && publicConfig.mode ? publicConfig.mode : currentConfig.mode);
  const environmentDefaults = getEnvironmentDefaults(mode);
  const isProduction = mode === "production";

  return {
    ...currentConfig,
    mode,
    label: isProduction ? "LIVE MODE" : "TEST MODE",
    isProduction,
    products: Array.isArray(environmentDefaults.products)
      ? environmentDefaults.products.map((product) => ({ ...product }))
      : Array.isArray(currentConfig.products)
        ? currentConfig.products.map((product) => ({ ...product }))
        : [],
    razorpay: {
      ...(currentConfig.razorpay || {}),
      ...((publicConfig && publicConfig.razorpay) || {}),
    },
    email: {
      ...(currentConfig.email || {}),
      ...((publicConfig && publicConfig.email) || {}),
    },
    settings: {
      ...(currentConfig.settings || {}),
      ...((publicConfig && publicConfig.settings) || {}),
      gst: {
        ...((currentConfig.settings && currentConfig.settings.gst) || {}),
        ...((publicConfig && publicConfig.settings && publicConfig.settings.gst) || {}),
      },
    },
    runtimeConfigError: (publicConfig && publicConfig.configError) || "",
  };
}

function applyRuntimeConfig(nextConfig) {
  AARUNI_APP_CONFIG = nextConfig || window.AARUNI_CONFIG || {};
  AARUNI_RAZORPAY_CONFIG = AARUNI_APP_CONFIG.razorpay || {};
  AARUNI_EMAIL_ENV_CONFIG = AARUNI_APP_CONFIG.email || {};
  AARUNI_ENVIRONMENT_MODE = normalizeRuntimeMode(AARUNI_APP_CONFIG.mode || window.AARUNI_ENVIRONMENT || "test");
  AARUNI_IS_TEST_MODE = !AARUNI_APP_CONFIG.isProduction;
  products = Array.isArray(AARUNI_APP_CONFIG.products) ? AARUNI_APP_CONFIG.products : [];
  CART_STORAGE_KEY = `${LEGACY_CART_STORAGE_KEY}:${AARUNI_ENVIRONMENT_MODE}`;
  RAZORPAY_KEY_ID = AARUNI_RAZORPAY_CONFIG.keyId || "";
  RAZORPAY_BUSINESS_NAME = AARUNI_RAZORPAY_CONFIG.businessName || "Aaruni Tech";
  RAZORPAY_SUPPORT_EMAIL = AARUNI_RAZORPAY_CONFIG.supportEmail || "tech.aaruni@gmail.com";

  window.AARUNI_CONFIG = AARUNI_APP_CONFIG;
  window.AARUNI_ENVIRONMENT = AARUNI_ENVIRONMENT_MODE;
  window.AARUNI_PRODUCTS = products;
  window.RAZORPAY_KEY_ID = RAZORPAY_KEY_ID;
  window.RAZORPAY_BUSINESS_NAME = RAZORPAY_BUSINESS_NAME;
  window.RAZORPAY_SUPPORT_EMAIL = RAZORPAY_SUPPORT_EMAIL;
}

async function fetchPublicRuntimeConfig() {
  const supabaseUrl = String(window.SUPABASE_URL || "").replace(/\/+$/, "");
  const anonKey = String(window.SUPABASE_ANON_KEY || "");

  if (!supabaseUrl || !anonKey) {
    return null;
  }

  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/public-config`, {
      method: "POST",
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    const data = await response.json().catch(() => null);

    if (!response.ok || !data || data.ok === false) {
      console.warn("[Config] Runtime settings unavailable; using safe fallback", data || response.status);
      return null;
    }

    return data;
  } catch (error) {
    console.warn("[Config] Runtime settings fetch failed; using safe fallback", error);
    return null;
  }
}

async function loadRuntimeConfig() {
  const publicConfig = await fetchPublicRuntimeConfig();
  applyRuntimeConfig(mergeRuntimeConfig(publicConfig));
  window.dispatchEvent(new CustomEvent("aaruni:runtime-config-ready", { detail: window.AARUNI_CONFIG }));
}

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

function parseStoredCart(rawCart) {
  if (!rawCart) {
    return [];
  }

  const savedCart = JSON.parse(rawCart);

  if (!Array.isArray(savedCart)) {
    return [];
  }

  return savedCart
    .filter((item) => products.some((product) => product.id === item.id))
    .map((item) => ({
      id: item.id,
      quantity: Number.isInteger(item.quantity) && item.quantity > 0 ? item.quantity : 1,
    }));
}

function loadCart() {
  try {
    const currentModeCart = window.localStorage.getItem(CART_STORAGE_KEY);

    if (currentModeCart !== null) {
      return parseStoredCart(currentModeCart);
    }

    return parseStoredCart(window.localStorage.getItem(LEGACY_CART_STORAGE_KEY));
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

function getCommerceSettings() {
  const settings = AARUNI_APP_CONFIG.settings || {};
  const gst = settings.gst || {};

  return {
    shippingFee: Math.max(0, Number(settings.shippingFee || settings.shipping_fee || 0)),
    gstEnabled: Boolean(gst.enabled || settings.gstEnabled || settings.gst_enabled),
    gstPercent: Math.max(0, Number(gst.percent || settings.gstPercent || settings.gst_percent || 0)),
  };
}

function getCartPricing() {
  const subtotal = getCartSubtotal();
  const commerceSettings = getCommerceSettings();
  const shippingFee = subtotal > 0 ? commerceSettings.shippingFee : 0;
  const gstAmount = commerceSettings.gstEnabled ? Math.round((subtotal * commerceSettings.gstPercent) / 100) : 0;

  return {
    subtotal,
    shippingFee,
    gstAmount,
    total: subtotal + shippingFee + gstAmount,
  };
}

function renderCart() {
  const quantity = getCartQuantity();
  const pricing = getCartPricing();

  cartPanelCount.textContent = quantity;
  cartSubtotal.textContent = formatPrice(pricing.total);
  const shippingLine = document.querySelector("#cartShippingFee");
  const gstLine = document.querySelector("#cartGstAmount");
  if (shippingLine) shippingLine.textContent = formatPrice(pricing.shippingFee);
  if (gstLine) gstLine.textContent = formatPrice(pricing.gstAmount);
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
  const catalogLabel = AARUNI_IS_TEST_MODE ? "Test catalog" : "Live catalog";

  resultSummary.textContent = `${filteredProducts.length} of ${products.length} products shown - ${catalogLabel}`;

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

function renderDeal() {
  const dealProduct = products.find((product) => product.id === "power-bank-pro");

  if (!dealProduct) {
    return;
  }

  if (dealProductName) {
    dealProductName.textContent = dealProduct.name;
  }

  if (dealProductDescription) {
    dealProductDescription.textContent = dealProduct.description;
  }

  if (dealProductPrice) {
    dealProductPrice.textContent = formatPrice(dealProduct.price);
  }
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

function clearCheckoutCart() {
  cartItems = [];
  saveCart();
  updateCartCount();
  closeCart();
}

function applyEmailStatusToOrder(order, emailResult) {
  const emails = Array.isArray(emailResult && emailResult.emails)
    ? emailResult.emails
    : Array.isArray(emailResult && emailResult.results)
      ? emailResult.results
      : [];
  const adminEmailSent = Boolean(
    emailResult &&
      (emailResult.adminEmailSent ||
        emails.some((entry) => entry && (entry.type === "admin" || entry.type === "seller") && (entry.status === "sent" || entry.status === "duplicate" || entry.ok)))
  );
  const customerEmailSent = Boolean(
    emailResult &&
      (emailResult.customerEmailSent ||
        emails.some((entry) => entry && (entry.type === "customer" || entry.type === "buyer") && (entry.status === "sent" || entry.status === "duplicate" || entry.ok)))
  );

  return {
    ...order,
    admin_email_sent: adminEmailSent,
    customer_email_sent: customerEmailSent,
    email_status: {
      ok: Boolean(emailResult && emailResult.ok),
      complete: Boolean(emailResult && emailResult.complete !== false && adminEmailSent && customerEmailSent),
      provider: (emailResult && emailResult.provider) || "",
      emails,
      error: (emailResult && emailResult.error) || "",
      reason: (emailResult && emailResult.reason) || "",
    },
  };
}

async function logCheckoutFailure(step, payload, error) {
  const details = {
    step,
    payload,
    error: error && error.message ? error.message : error,
  };
  console.error("[CheckoutDebug] Failure", details);

  if (window.AaruniSupabaseBackend && window.AaruniSupabaseBackend.logCheckoutDebug) {
    try {
      await window.AaruniSupabaseBackend.logCheckoutDebug({ step, payload, error });
    } catch (debugError) {
      console.warn("[CheckoutDebug] Failed to write debug log", debugError);
    }
  }
}

function updateCheckoutModeUi() {
  if (!checkoutButton) {
    return;
  }

  checkoutButton.textContent = AARUNI_IS_TEST_MODE ? "Pay Test with Razorpay" : "Pay with Razorpay";

  if (checkoutModeNote) {
    checkoutModeNote.hidden = !AARUNI_IS_TEST_MODE;
    checkoutModeNote.textContent = "TEST MODE checkout";
  }
}

function updateTestModeBanner() {
  if (!testModeBanner) {
    return;
  }

  testModeBanner.hidden = !AARUNI_IS_TEST_MODE;
}

function updateEnvironmentBadge() {
  if (!environmentModeBadge) {
    return;
  }

  environmentModeBadge.textContent = AARUNI_IS_TEST_MODE ? "TEST MODE" : "LIVE MODE";
  environmentModeBadge.dataset.mode = AARUNI_IS_TEST_MODE ? "test" : "production";
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

function saveLocalSignupProfile(profile) {
  try {
    window.localStorage.setItem(SIGNUP_STORAGE_KEY, JSON.stringify(profile || {}));
  } catch (error) {
    return;
  }
}

function getFormData(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function getAddressParts(data) {
  return {
    state: String(data.state || "").trim(),
    area: String(data.area || "").trim(),
    district: String(data.district || "").trim(),
    mandal: String(data.mandal || "").trim(),
    village: String(data.village || "").trim(),
    houseNumber: String(data.houseNumber || data.house_number || "").trim(),
  };
}

function normalizeProfileForCheckout(profile) {
  const source = profile || {};
  const addressParts = getAddressParts(source);
  const address = String(source.address || source.shipping_address || getDeliveryAddress(addressParts)).trim();
  const fullName = String(source.full_name || source.fullName || source.name || "").trim();

  return {
    name: fullName,
    fullName,
    email: String(source.email || "").trim(),
    phone: String(source.phone || "").trim(),
    address,
    ...addressParts,
  };
}

function fillFormFromProfile(form, profile) {
  if (!form) return;
  const normalized = normalizeProfileForCheckout(profile || loadSignupProfile());
  const fields = {
    fullName: normalized.fullName || normalized.name,
    name: normalized.name,
    email: normalized.email,
    phone: normalized.phone,
    state: normalized.state,
    area: normalized.area,
    district: normalized.district,
    mandal: normalized.mandal,
    village: normalized.village,
    houseNumber: normalized.houseNumber,
  };

  Object.entries(fields).forEach(([name, value]) => {
    const field = form.elements[name];
    if (field && value && !field.value) {
      field.value = value;
    }
  });
}

function setAccountMessage(message, type = "info") {
  if (!accountMessage) return;

  if (!message) {
    accountMessage.hidden = true;
    accountMessage.textContent = "";
    accountMessage.dataset.type = "";
    return;
  }

  accountMessage.hidden = false;
  accountMessage.textContent = message;
  accountMessage.dataset.type = type;
}

function setAuthLoading(form, isLoading) {
  if (!form) return;
  form.querySelectorAll("button, input, select").forEach((control) => {
    control.disabled = Boolean(isLoading);
  });
}

function setAuthMode(mode, message) {
  const activeMode = mode || (currentAccount.user ? "profile" : "login");
  const content = {
    login: {
      title: "Login",
      description: "Sign in to continue checkout and view your saved orders.",
    },
    signup: {
      title: "Create your account",
      description: "Use email and password so your orders stay linked to you.",
    },
    forgot: {
      title: "Reset password",
      description: "Enter your account email and we will send a password reset link.",
    },
    reset: {
      title: "Set new password",
      description: "Choose a new password for your Aaruni Tech account.",
    },
    profile: {
      title: "Your account",
      description: "Manage saved delivery details and order history.",
    },
  };

  document.querySelectorAll("[data-auth-panel]").forEach((panel) => {
    panel.hidden = panel.dataset.authPanel !== activeMode;
  });

  if (authTabs) {
    authTabs.hidden = currentAccount.user || activeMode === "forgot" || activeMode === "reset";
    authTabs.querySelectorAll("[data-auth-mode]").forEach((button) => {
      button.classList.toggle("active", button.dataset.authMode === activeMode);
    });
  }

  if (accountModalTitle) accountModalTitle.textContent = (content[activeMode] || content.login).title;
  if (accountModalDescription) accountModalDescription.textContent = (content[activeMode] || content.login).description;

  if (message) {
    setAccountMessage(message);
  } else {
    setAccountMessage("");
  }
}

function updateAccountUi() {
  const profile = normalizeProfileForCheckout(currentAccount.profile || {});
  const loggedIn = Boolean(currentAccount.user);
  const displayName = profile.name || (currentAccount.user && currentAccount.user.email) || "Account";

  if (accountButtonText) {
    accountButtonText.textContent = loggedIn ? displayName.split(" ")[0] : "Login";
  }
  if (signupButton) signupButton.hidden = loggedIn;
  if (logoutButton) logoutButton.hidden = !loggedIn;
  if (myOrdersButton) myOrdersButton.hidden = !loggedIn;

  if (accountProfileName) accountProfileName.textContent = displayName;
  if (accountProfileEmail) accountProfileEmail.textContent = profile.email || (currentAccount.user && currentAccount.user.email) || "";

  if (loggedIn) {
    fillFormFromProfile(accountProfileForm, {
      ...loadSignupProfile(),
      ...profile,
    });
  }
}

async function refreshAuthState() {
  if (!window.AaruniSupabaseBackend || !window.AaruniSupabaseBackend.getCurrentAccount) {
    authReady = false;
    currentAccount = { user: null, profile: null };
    updateAccountUi();
    return currentAccount;
  }

  const account = await window.AaruniSupabaseBackend.getCurrentAccount();
  currentAccount = {
    user: account.user || null,
    profile: account.profile || null,
  };
  authReady = true;
  updateAccountUi();
  return currentAccount;
}

function getCheckoutProfile() {
  if (currentAccount.user && currentAccount.profile) {
    return normalizeProfileForCheckout({
      ...loadSignupProfile(),
      ...currentAccount.profile,
    });
  }

  return normalizeProfileForCheckout(loadSignupProfile());
}

async function requireCheckoutAccount() {
  await refreshAuthState();

  if (!currentAccount.user) {
    pendingCheckoutAfterAuth = true;
    showToast("Login or sign up before checkout.");
    openAccountPanel("login");
    return { ok: false, reason: "not_authenticated" };
  }

  const profile = getCheckoutProfile();

  if (!isCheckoutProfileComplete(profile)) {
    pendingCheckoutAfterAuth = true;
    showToast("Complete your delivery details before checkout.");
    openAccountPanel("profile");
    return { ok: false, reason: "profile_incomplete" };
  }

  return { ok: true, profile };
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
  return Boolean(profile.name && profile.email && profile.phone && (profile.address || getDeliveryAddress(profile)));
}

function getRazorpayConfigError() {
  if (AARUNI_APP_CONFIG.runtimeConfigError) {
    return AARUNI_APP_CONFIG.runtimeConfigError;
  }

  const key = String(RAZORPAY_KEY_ID || "").trim();

  if (!key || key.includes("YOUR_") || key.includes("REPLACE_WITH")) {
    return `${AARUNI_APP_CONFIG.label || "Selected"} Razorpay key_id is not configured.`;
  }

  if (AARUNI_APP_CONFIG.isProduction && !key.startsWith("rzp_live_")) {
    return "Live mode must use a Razorpay live key_id.";
  }

  if (!AARUNI_APP_CONFIG.isProduction && !key.startsWith("rzp_test_")) {
    return "Test mode must use a Razorpay test key_id.";
  }

  return "";
}

async function sendConfiguredOrderEmail(order) {
  const provider = String(AARUNI_EMAIL_ENV_CONFIG.provider || "").trim();

  const sendSupabaseOrderEmail = async (reason) => {
    if (window.AaruniSupabaseBackend && window.AaruniSupabaseBackend.sendOrderNotificationEmail) {
      console.info("[OrderEmail] Sending Supabase order notification", {
        orderId: order.id,
        mode: AARUNI_APP_CONFIG.mode || "unknown",
        reason: reason || "configured_provider",
      });
      const emailResult = await window.AaruniSupabaseBackend.sendOrderNotificationEmail(order);
      console.info("[OrderEmail] sendOrderNotificationEmail result", emailResult);
      const emailEntries = Array.isArray(emailResult && emailResult.emails)
        ? emailResult.emails
        : Array.isArray(emailResult && emailResult.results)
          ? emailResult.results
          : [];
      const adminEmailSent = Boolean(
        emailResult &&
          (emailResult.adminEmailSent ||
            emailEntries.some((entry) => entry && (entry.type === "admin" || entry.type === "seller") && (entry.status === "sent" || entry.status === "duplicate" || entry.ok)))
      );
      const customerEmailSent = Boolean(
        emailResult &&
          (emailResult.customerEmailSent ||
            emailEntries.some((entry) => entry && (entry.type === "customer" || entry.type === "buyer") && (entry.status === "sent" || entry.status === "duplicate" || entry.ok)))
      );

      if (emailResult && emailResult.ok && emailResult.complete !== false) {
        console.info("[OrderEmail] Order emails accepted", {
          orderId: order.id,
          duplicate: Boolean(emailResult.duplicate),
          skipped: Boolean(emailResult.skipped),
          emails: emailEntries,
        });
        if (adminEmailSent) {
          console.info("[ADMIN EMAIL SENT]", { orderId: order.id, paymentId: order.payment && order.payment.id });
        }
        if (customerEmailSent) {
          console.info("[CUSTOMER EMAIL SENT]", { orderId: order.id, paymentId: order.payment && order.payment.id });
        }
      } else if (emailResult && emailResult.ok && emailResult.complete === false) {
        console.warn("[OrderEmail] One or more order emails failed or are pending retry", emailResult);
        console.error("[EMAIL FAILED]", { orderId: order.id, paymentId: order.payment && order.payment.id, result: emailResult });
      } else if (emailResult && emailResult.skipped) {
        console.info("[OrderEmail] Order email notification skipped", emailResult);
        console.error("[EMAIL FAILED]", { orderId: order.id, paymentId: order.payment && order.payment.id, result: emailResult });
      } else {
        console.warn("[OrderEmail] Order email notification failed or skipped", emailResult);
        console.error("[EMAIL FAILED]", { orderId: order.id, paymentId: order.payment && order.payment.id, result: emailResult });
      }

      return emailResult;
    }

    console.warn("[OrderEmail] Supabase notification helper is unavailable.");
    console.error("[EMAIL FAILED]", {
      orderId: order.id,
      paymentId: order.payment && order.payment.id,
      reason: "Supabase notification helper is unavailable.",
    });
    return { ok: false, skipped: true, reason: "Supabase notification helper is unavailable." };
  };

  if (provider === "emailjs") {
    if (window.AaruniEmail && window.AaruniEmail.sendOrderEmails) {
      console.info("[OrderEmail] Sending development EmailJS order email", {
        orderId: order.id,
        mode: AARUNI_APP_CONFIG.mode || "unknown",
      });
      const emailResult = await window.AaruniEmail.sendOrderEmails(order);
      console.info("[OrderEmail] EmailJS result", emailResult);

      if (emailResult && emailResult.skipped && window.AaruniSupabaseBackend && window.AaruniSupabaseBackend.sendOrderNotificationEmail) {
        console.warn("[OrderEmail] EmailJS skipped; falling back to Supabase Edge Function", emailResult);
        return sendSupabaseOrderEmail("emailjs_skipped");
      }

      const orderWithEmailStatus = applyEmailStatusToOrder(order, emailResult);
      if (orderWithEmailStatus.admin_email_sent) {
        console.info("[ADMIN EMAIL SENT]", { orderId: order.id, paymentId: order.payment && order.payment.id });
      }
      if (orderWithEmailStatus.customer_email_sent) {
        console.info("[CUSTOMER EMAIL SENT]", { orderId: order.id, paymentId: order.payment && order.payment.id });
      }
      if (!orderWithEmailStatus.email_status.complete) {
        console.error("[EMAIL FAILED]", { orderId: order.id, paymentId: order.payment && order.payment.id, result: emailResult });
      }

      return emailResult;
    }

    console.warn("[OrderEmail] EmailJS provider selected but helper is unavailable.");
    return sendSupabaseOrderEmail("emailjs_helper_unavailable");
  }

  if (provider === "supabase-edge-function") {
    return sendSupabaseOrderEmail("configured_provider");
  }

  console.info("[OrderEmail] No order email provider configured", {
    provider,
    mode: AARUNI_APP_CONFIG.mode || "unknown",
  });
  console.error("[EMAIL FAILED]", {
    orderId: order.id,
    paymentId: order.payment && order.payment.id,
    provider,
    reason: "No order email provider configured.",
  });
  return { ok: false, skipped: true, reason: "No order email provider configured." };
}

async function startRazorpayCheckout() {
  await loadRuntimeConfig();
  updateTestModeBanner();
  updateEnvironmentBadge();
  updateCheckoutModeUi();
  renderCart();
  const pricing = getCartPricing();
  const amount = pricing.total;

  if (amount <= 0) {
    showToast("Add at least one product before checkout.");
    return;
  }

  const razorpayConfigError = getRazorpayConfigError();
  if (razorpayConfigError) {
    showToast(razorpayConfigError);
    return;
  }

  if (typeof window.Razorpay !== "function") {
    showToast("Razorpay checkout could not load. Please try again.");
    return;
  }

  const authCheck = await requireCheckoutAccount();

  if (!authCheck.ok) {
    return;
  }

  const signupProfile = authCheck.profile;

  console.info("[Checkout] Starting Razorpay checkout", {
    mode: AARUNI_ENVIRONMENT_MODE,
    testMode: AARUNI_IS_TEST_MODE,
    cartQty: getCartQuantity(),
    amount,
    pricing,
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
    description: `${AARUNI_IS_TEST_MODE ? "Test cart checkout" : "Cart checkout"} - ${getCartQuantity()} item${getCartQuantity() === 1 ? "" : "s"}`,
    prefill: {
      name: signupProfile.name || "",
      email: signupProfile.email || "",
      contact: signupProfile.phone || "",
    },
    notes: {
      // Keep Razorpay notes non-sensitive.
      source: "aaruni-tech.github.io",
      checkout_mode: AARUNI_IS_TEST_MODE ? "test" : "live",
      environment: AARUNI_ENVIRONMENT_MODE,
    },
    theme: {
      color: "#c51d63",
    },
    async handler(response) {
      try {
      console.log("[STEP 1] Razorpay payment success");
      console.info("[Razorpay] Success handler invoked", { response });
      const paymentId = response && response.razorpay_payment_id ? response.razorpay_payment_id : "";
      console.info("[Razorpay] Payment ID", { paymentId });
      if (!paymentId) {
        const error = new Error("Razorpay success response did not include razorpay_payment_id.");
        await logCheckoutFailure("razorpay_missing_payment_id", { response }, error);
        showToast("Payment confirmation failed. Please contact support before retrying.");
        return;
      }
      console.log("[STEP 2] Payment verified");
      console.info("[Razorpay payment success]", {
        paymentId,
        mode: AARUNI_ENVIRONMENT_MODE,
        testMode: AARUNI_IS_TEST_MODE,
        amount,
        amountInPaise,
      });
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
          await logCheckoutFailure("order_draft_missing", { paymentId, hasAaruniOrders: Boolean(window.AaruniOrders) }, "Order draft could not be created.");
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
            console.log("[STEP 3] Starting saveOrderAfterPayment");
            const result = await window.AaruniSupabaseBackend.saveOrderAfterPayment({
              paymentId,
              orderDraft,
            });

            console.info("[Supabase] saveOrderAfterPayment result", result);

            if (result && result.ok && result.order) {
              window.AaruniOrders.saveOrder(result.order);
              console.info("[ORDER SAVED]", {
                orderId: result.order.id,
                paymentId,
                db_saved: Boolean(result.order.db_saved),
              });
              console.log("[STEP 4] Order inserted into Supabase");
              clearCheckoutCart();
              showToast(`Order placed: ${result.order.id}`);

              try {
                console.log("[STEP 5] Triggering email function");
                const emailResult = await sendConfiguredOrderEmail(result.order);
                const orderWithEmailStatus = applyEmailStatusToOrder(result.order, emailResult);
                window.AaruniOrders.saveOrder(orderWithEmailStatus);

                if (orderWithEmailStatus.admin_email_sent) {
                  console.log("[STEP 6] Admin email sent");
                } else {
                  await logCheckoutFailure("admin_email_not_confirmed", { orderId: result.order.id, paymentId, emailResult }, "Admin email was not confirmed as sent.");
                }

                if (orderWithEmailStatus.customer_email_sent) {
                  console.log("[STEP 7] Customer email sent");
                } else {
                  await logCheckoutFailure("customer_email_not_confirmed", { orderId: result.order.id, paymentId, emailResult }, "Customer email was not confirmed as sent.");
                }

                if (orderWithEmailStatus.email_status.complete) {
                  showToast(`Order confirmed: ${result.order.id}`);
                } else {
                  showToast("Order saved. Email notification is retrying; support has the order details.");
                }
              } catch (error) {
                console.error("[EMAIL FAILED]", {
                  orderId: result.order.id,
                  paymentId,
                  error,
                });
                await logCheckoutFailure("send_configured_order_email_threw", { orderId: result.order.id, paymentId }, error);
                showToast("Order saved. Email notification failed; check console and Edge Function logs.");
              }

              return;
            }

            console.error("[SUPABASE INSERT FAILED]", {
              paymentId,
              draftId: orderDraft.id,
              result,
            });
            await logCheckoutFailure("save_order_after_payment_failed", { paymentId, orderId: orderDraft.id, result }, result && result.error ? result.error : "saveOrderAfterPayment returned failure.");
            showToast(`Payment received, but order could not be saved to the server. ${result && result.error ? String(result.error).slice(0, 140) : ""}`);
            return;
          } catch (error) {
            console.error("[SUPABASE INSERT FAILED]", {
              paymentId,
              draftId: orderDraft.id,
              error,
            });
            await logCheckoutFailure("save_order_after_payment_threw", { paymentId, orderId: orderDraft.id }, error);
            const message = error && error.message ? String(error.message) : "Supabase save failed.";
            showToast(`Payment received, but order could not be saved to the server. ${message.slice(0, 140)}`);
            return;
          }
        } else {
          console.error("[SUPABASE INSERT FAILED]", {
            hasBackend: Boolean(window.AaruniSupabaseBackend),
            configured:
              Boolean(window.AaruniSupabaseBackend && window.AaruniSupabaseBackend.isConfigured && window.AaruniSupabaseBackend.isConfigured()),
            supabaseUrl: window.SUPABASE_URL || "",
            anonKeyPresent: Boolean(window.SUPABASE_ANON_KEY),
          });
          await logCheckoutFailure("supabase_backend_not_configured", {
            paymentId,
            orderId: orderDraft.id,
            hasBackend: Boolean(window.AaruniSupabaseBackend),
            supabaseUrl: window.SUPABASE_URL || "",
            anonKeyPresent: Boolean(window.SUPABASE_ANON_KEY),
          }, "Supabase backend is missing or not configured.");
          showToast("Payment received, but Supabase is not configured. Order was not saved.");
          return;
        }

      };

      await finalizeOrder();
      } catch (error) {
        await logCheckoutFailure("razorpay_success_handler_threw", { response }, error);
        const message = error && error.message ? String(error.message) : "Checkout failed after payment.";
        showToast(message.slice(0, 140));
      }
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

function openAccountPanel(mode) {
  openOverlay();
  document.body.classList.add("modal-open");
  accountModal.hidden = false;
  setAuthMode(mode || (currentAccount.user ? "profile" : "login"));
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
  openAccountPanel(currentAccount.user ? "profile" : "login");
});

if (signupButton) {
  signupButton.addEventListener("click", () => {
    openAccountPanel("signup");
  });
}

if (logoutButton) {
  logoutButton.addEventListener("click", async () => {
    if (!window.AaruniSupabaseBackend || !window.AaruniSupabaseBackend.signOutCustomer) {
      return;
    }

    const result = await window.AaruniSupabaseBackend.signOutCustomer();
    if (!result.ok) {
      showToast(result.error || "Logout failed.");
      return;
    }

    currentAccount = { user: null, profile: null };
    pendingCheckoutAfterAuth = false;
    updateAccountUi();
    showToast("Logged out.");
  });
}

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

document.addEventListener("click", (event) => {
  const authModeButton = event.target.closest("[data-auth-mode]");
  if (!authModeButton) return;
  setAuthMode(authModeButton.dataset.authMode);
});

async function continueCheckoutAfterAuth() {
  await refreshAuthState();

  if (pendingCheckoutAfterAuth && currentAccount.user) {
    pendingCheckoutAfterAuth = false;
    closeAccountPanel();
    await startRazorpayCheckout();
  }
}

accountLoginForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!window.AaruniSupabaseBackend || !window.AaruniSupabaseBackend.signInCustomer) {
    setAccountMessage("Supabase Auth is not available. Please try again.", "error");
    return;
  }

  const loginData = getFormData(accountLoginForm);
  setAuthLoading(accountLoginForm, true);
  setAccountMessage("Logging in...");

  try {
    const result = await window.AaruniSupabaseBackend.signInCustomer(loginData);

    if (!result.ok) {
      setAccountMessage(result.error || "Login failed.", "error");
      return;
    }

    await refreshAuthState();
    fillFormFromProfile(accountProfileForm, currentAccount.profile);
    setAuthMode("profile", "Logged in successfully.");
    showToast("Logged in.");
    await continueCheckoutAfterAuth();
  } finally {
    setAuthLoading(accountLoginForm, false);
  }
});

accountSignupForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const signupData = Object.fromEntries(new FormData(accountSignupForm).entries());
  const profile = normalizeProfileForCheckout(signupData);
  saveLocalSignupProfile(profile);

  if (!window.AaruniSupabaseBackend || !window.AaruniSupabaseBackend.signUpCustomer) {
    setAccountMessage("Supabase Auth is not available. Please try again.", "error");
    return;
  }

  setAuthLoading(accountSignupForm, true);
  setAccountMessage("Creating your account...");

  try {
    const result = await window.AaruniSupabaseBackend.signUpCustomer({
      fullName: profile.fullName || profile.name,
      email: profile.email,
      password: signupData.password,
      phone: profile.phone,
      address: profile.address || getDeliveryAddress(profile),
      addressParts: getAddressParts(profile),
    });

    if (!result.ok) {
      setAccountMessage(result.error || "Sign up failed.", "error");
      return;
    }

    if (result.requiresEmailConfirmation) {
      showToast("Check your email to confirm your account.");
      setAuthMode("login", "Account created. Check your email to confirm your login, then return to checkout.");
      return;
    }

    await refreshAuthState();
    fillFormFromProfile(accountProfileForm, currentAccount.profile || profile);
    setAuthMode("profile", "Account created.");
    showToast(`Welcome ${profile.name || "to Aaruni Tech"}.`);
    await continueCheckoutAfterAuth();
  } finally {
    setAuthLoading(accountSignupForm, false);
  }
});

forgotPasswordForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!window.AaruniSupabaseBackend || !window.AaruniSupabaseBackend.sendPasswordReset) {
    setAccountMessage("Supabase Auth is not available. Please try again.", "error");
    return;
  }

  const resetData = getFormData(forgotPasswordForm);
  setAuthLoading(forgotPasswordForm, true);
  setAccountMessage("Sending reset link...");

  try {
    const result = await window.AaruniSupabaseBackend.sendPasswordReset(resetData.email);

    if (!result.ok) {
      setAccountMessage(result.error || "Could not send reset link.", "error");
      return;
    }

    setAccountMessage("Password reset link sent. Check your email.", "success");
  } finally {
    setAuthLoading(forgotPasswordForm, false);
  }
});

resetPasswordForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!window.AaruniSupabaseBackend || !window.AaruniSupabaseBackend.updatePassword) {
    setAccountMessage("Supabase Auth is not available. Please try again.", "error");
    return;
  }

  const resetData = getFormData(resetPasswordForm);
  setAuthLoading(resetPasswordForm, true);
  setAccountMessage("Updating password...");

  try {
    const result = await window.AaruniSupabaseBackend.updatePassword(resetData.password);

    if (!result.ok) {
      setAccountMessage(result.error || "Could not update password.", "error");
      return;
    }

    setAuthMode("login", "Password updated. Please login with your new password.");
  } finally {
    setAuthLoading(resetPasswordForm, false);
  }
});

accountProfileForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!window.AaruniSupabaseBackend || !window.AaruniSupabaseBackend.upsertCustomerProfile) {
    setAccountMessage("Supabase Auth is not available. Please try again.", "error");
    return;
  }

  const profileData = getFormData(accountProfileForm);
  const profile = normalizeProfileForCheckout({
    ...profileData,
    email: currentAccount.user && currentAccount.user.email,
  });
  saveLocalSignupProfile(profile);
  setAuthLoading(accountProfileForm, true);
  setAccountMessage("Saving account details...");

  try {
    const result = await window.AaruniSupabaseBackend.upsertCustomerProfile({
      full_name: profile.fullName || profile.name,
      email: profile.email,
      phone: profile.phone,
      address: profile.address || getDeliveryAddress(profile),
      ...getAddressParts(profile),
    });

    if (!result.ok) {
      setAccountMessage(result.error || "Could not save account details.", "error");
      return;
    }

    await refreshAuthState();
    setAuthMode("profile", "Account details saved.");
    showToast("Account details saved.");
    await continueCheckoutAfterAuth();
  } finally {
    setAuthLoading(accountProfileForm, false);
  }
});

checkoutButton.addEventListener("click", startRazorpayCheckout);

async function initializeAuthUi() {
  fillFormFromProfile(accountSignupForm, loadSignupProfile());
  fillFormFromProfile(accountProfileForm, loadSignupProfile());

  if (!window.AaruniSupabaseBackend || !window.AaruniSupabaseBackend.getCurrentAccount) {
    updateAccountUi();
    return;
  }

  await refreshAuthState();

  if (!authSubscription && window.AaruniSupabaseBackend.onAuthStateChange) {
    const result = window.AaruniSupabaseBackend.onAuthStateChange(async () => {
      await refreshAuthState();
    });
    authSubscription = result && result.data ? result.data.subscription : null;
  }
}

if (window.AaruniSupabaseBackend) {
  initializeAuthUi();
} else {
  window.addEventListener("aaruni:supabase-ready", initializeAuthUi, { once: true });
}

try {
  const params = new URLSearchParams(window.location.search);
  const shouldOpenCart = params.get("open_cart") === "1";
  const shouldOpenAccount = params.get("open_account") === "1";
  const accountMode = params.get("mode") || "";

  if (shouldOpenCart) {
    openCart();
  } else if (shouldOpenAccount) {
    openAccountPanel(accountMode || "login");
  }

  if (shouldOpenCart || shouldOpenAccount) {
    params.delete("open_cart");
    params.delete("open_account");
    params.delete("mode");
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

async function initializeStorefront() {
  await loadRuntimeConfig();
  cartItems = loadCart();
  updateTestModeBanner();
  updateEnvironmentBadge();
  updateCheckoutModeUi();
  renderDeal();
  renderProducts();
  updateCartCount();
}

initializeStorefront();
