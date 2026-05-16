const products = [
  {
    id: "nova-phone-lite",
    name: "Nova Phone Lite 5G",
    category: "Mobiles",
    price: 12999,
    rating: 4.4,
    description: "A balanced 5G phone with smooth display and all-day battery life.",
    image: "https://placehold.co/600x460/f2faf6/143b36?text=Nova+Phone+Lite",
  },
  {
    id: "spark-phone-max",
    name: "Spark Phone Max",
    category: "Mobiles",
    price: 17999,
    rating: 4.5,
    description: "Large screen, fast charging, and dependable cameras for daily use.",
    image: "https://placehold.co/600x460/eef7fb/173847?text=Spark+Phone+Max",
  },
  {
    id: "airbuds-prime",
    name: "AirBuds Prime ANC",
    category: "Audio",
    price: 2499,
    rating: 4.6,
    description: "Noise control earbuds with clear calls and pocket-friendly charging.",
    image: "https://placehold.co/600x460/fbf4f7/451d31?text=AirBuds+Prime",
  },
  {
    id: "soundbar-mini",
    name: "SoundBar Mini 60W",
    category: "Audio",
    price: 3999,
    rating: 4.3,
    description: "Compact TV audio upgrade for bedrooms, hostels, and small apartments.",
    image: "https://placehold.co/600x460/f8f5ea/3e3418?text=SoundBar+Mini",
  },
  {
    id: "workmate-laptop",
    name: "WorkMate Laptop 14",
    category: "Computing",
    price: 38999,
    rating: 4.4,
    description: "Lightweight laptop for study, office work, browsing, and video calls.",
    image: "https://placehold.co/600x460/f7faf8/103f3f?text=WorkMate+Laptop",
  },
  {
    id: "usb-c-hub",
    name: "6-in-1 USB-C Hub",
    category: "Computing",
    price: 1599,
    rating: 4.2,
    description: "Connect display, storage, and cards with one slim travel adapter.",
    image: "https://placehold.co/600x460/f2faf6/143b36?text=USB-C+Hub",
  },
  {
    id: "smart-bulb-pack",
    name: "Smart Bulb Duo Pack",
    category: "Smart Home",
    price: 1199,
    rating: 4.1,
    description: "Warm and cool lighting presets for living rooms and study spaces.",
    image: "https://placehold.co/600x460/eef7fb/173847?text=Smart+Bulb+Duo",
  },
  {
    id: "security-camera",
    name: "HomeGuard Wi-Fi Camera",
    category: "Smart Home",
    price: 2199,
    rating: 4.5,
    description: "Indoor security camera with motion alerts and night visibility.",
    image: "https://placehold.co/600x460/fbf4f7/451d31?text=HomeGuard+Camera",
  },
  {
    id: "power-bank-pro",
    name: "Aaruni Power Bank Pro",
    category: "Accessories",
    price: 1799,
    rating: 4.7,
    description: "20,000 mAh backup power with dual USB output and slim carry design.",
    image: "https://placehold.co/600x460/f8f5ea/3e3418?text=Power+Bank+Pro",
  },
  {
    id: "fast-charger",
    name: "RapidCharge 65W Adapter",
    category: "Accessories",
    price: 1499,
    rating: 4.3,
    description: "Fast wall charger for compatible phones, tablets, and laptops.",
    image: "https://placehold.co/600x460/f7faf8/103f3f?text=RapidCharge+65W",
  },
  {
    id: "keyboard-mouse",
    name: "QuietKey Keyboard Mouse Set",
    category: "Computing",
    price: 1299,
    rating: 4.2,
    description: "Wireless desk combo with soft keys and precise everyday tracking.",
    image: "https://placehold.co/600x460/f2faf6/143b36?text=Keyboard+Mouse",
  },
  {
    id: "neckband-sport",
    name: "Pulse Neckband Sport",
    category: "Audio",
    price: 999,
    rating: 4.1,
    description: "Lightweight neckband for calls, workouts, and long commute playlists.",
    image: "https://placehold.co/600x460/eef7fb/173847?text=Pulse+Neckband",
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
  return `
    <article class="product-card">
      <div class="product-image-wrap">
        <img src="${product.image}" alt="${product.name}" loading="lazy" />
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
          <img src="${product.image}" alt="${product.name}" loading="lazy" />
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
      cart_items: truncateNote(getCartItemsSummary()),
      cart_quantity: truncateNote(getCartQuantity()),
      cart_total: truncateNote(formatPrice(amount)),
      delivery_name: truncateNote(signupProfile.name),
      delivery_email: truncateNote(signupProfile.email),
      delivery_phone: truncateNote(signupProfile.phone),
      delivery_address: truncateNote(getDeliveryAddress(signupProfile)),
      support_email: RAZORPAY_SUPPORT_EMAIL,
      source: "aaruni-tech.github.io",
    },
    theme: {
      color: "#c51d63",
    },
    handler(response) {
      const paymentId = response && response.razorpay_payment_id ? response.razorpay_payment_id : "";
      const order = window.AaruniOrders
        ? window.AaruniOrders.createOrder({
            cartItems: cartItems.map((item) => ({ ...item })),
            products,
            buyerProfile: signupProfile,
            paymentId,
            supportEmail: RAZORPAY_SUPPORT_EMAIL,
          })
        : null;

      if (order && window.AaruniOrders) {
        window.AaruniOrders.saveOrder(order);
      }
      cartItems = [];
      saveCart();
      updateCartCount();
      closeCart();
      showToast(order ? `Order placed: ${order.id}` : paymentId ? `Order placed. Payment ID: ${paymentId}` : "Order placed.");

      if (order && window.AaruniEmail) {
        window.AaruniEmail.sendOrderEmails(order).then((result) => {
          if (result && result.skipped) {
            return;
          }

          const failedEmail = result.results && result.results.some((entry) => !entry.ok && !entry.skipped);

          if (failedEmail) {
            console.warn("Order was saved, but one or more EmailJS notifications failed.", result.results);
          }
        }).catch((error) => {
          console.warn("Order was saved, but EmailJS notification failed.", error);
        });
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

renderProducts();
updateCartCount();
