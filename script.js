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

const productGrid = document.querySelector("#productGrid");
const resultSummary = document.querySelector("#resultSummary");
const searchForm = document.querySelector("#searchForm");
const searchInput = document.querySelector("#searchInput");
const cartCount = document.querySelector("#cartCount");
const cartButton = document.querySelector("#cartButton");
const accountButton = document.querySelector("#accountButton");
const toast = document.querySelector("#toast");

let activeCategory = "All";
let cartItems = [];
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
  cartCount.textContent = cartItems.length;
  cartButton.setAttribute("aria-label", `Cart with ${cartItems.length} items`);
}

function addToCart(productId) {
  const product = products.find((item) => item.id === productId);

  if (!product) {
    return;
  }

  cartItems.push(product);
  updateCartCount();
  showToast(`${product.name} added to your demo cart.`);
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

  if (addButton) {
    addToCart(addButton.dataset.addToCart);
  }
});

accountButton.addEventListener("click", () => {
  showToast("Account pages are not enabled in this static demo. No customer data is collected.");
});

cartButton.addEventListener("click", () => {
  if (cartItems.length === 0) {
    showToast("Your demo cart is empty.");
    return;
  }

  showToast(`${cartItems.length} demo item${cartItems.length === 1 ? "" : "s"} in cart. Checkout is not connected.`);
});

renderProducts();
updateCartCount();
