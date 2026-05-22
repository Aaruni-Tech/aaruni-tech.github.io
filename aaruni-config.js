(function () {
  "use strict";

  // Single environment switch for Aaruni Tech.
  // Use "development" for test orders/payments.
  // Use "production" for real customer orders/live payments.
  const ENV = "development";

  const SUPPORT_EMAIL = "tech.aaruni@gmail.com";

  // Only browser-safe public values belong in this file:
  // - Supabase project URL
  // - Supabase anon/publishable key
  // - Razorpay key_id
  // - EmailJS public IDs
  //
  // Never add Razorpay key_secret, Supabase service_role key, Resend API key,
  // webhook secrets, or any other private server credential to this repository.
  // Supabase DEV project: existing linked project, reused because the Supabase org
  // is at its active free-project limit.
  const DEVELOPMENT_SUPABASE_URL = "https://cnsmgxgkxgbeumnvidpk.supabase.co";
  const DEVELOPMENT_SUPABASE_ANON_KEY = "sb_publishable_pUKXR4zuaQSg9UA5t5Oz9Q_sR4mCiI0";

  // Supabase PROD project: aaruni-tech-prod.
  const PRODUCTION_SUPABASE_URL = "https://fxoofgnhbvquenbfhdec.supabase.co";
  const PRODUCTION_SUPABASE_ANON_KEY = "sb_publishable_ZwgcNuKjDP3wjLbk2PpQ5w_sCoWwNN2";

  const PRODUCTION_PRODUCTS = [
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

  const DEVELOPMENT_PRICES = [100, 150, 50, 75, 250, 25, 20, 35, 30, 25, 20, 15];
  const DEVELOPMENT_PRODUCTS = PRODUCTION_PRODUCTS.map((product, index) => ({
    ...product,
    name: `Test ${product.name}`,
    price: DEVELOPMENT_PRICES[index] || 10,
    description: `Development test product. ${product.description}`,
  }));

  const ENVIRONMENTS = {
    development: {
      mode: "development",
      label: "Development",
      isProduction: false,
      supabase: {
        // Supabase DEV project public URL and anon/publishable key.
        url: DEVELOPMENT_SUPABASE_URL,
        anonKey: DEVELOPMENT_SUPABASE_ANON_KEY,
      },
      razorpay: {
        // Razorpay test key_id only. Do not put key_secret in frontend code.
        keyId: "rzp_test_SpYO2ojU9ZzsNG",
        businessName: "Aaruni Tech DEV",
        supportEmail: SUPPORT_EMAIL,
      },
      email: {
        // Development uses EmailJS testing templates instead of real order emails.
        provider: "emailjs",
        publicKey: "YOUR_EMAILJS_PUBLIC_KEY",
        serviceId: "YOUR_EMAILJS_SERVICE_ID",
        buyerTemplateId: "YOUR_EMAILJS_TESTING_TEMPLATE_ID",
        sellerTemplateId: "YOUR_EMAILJS_TESTING_TEMPLATE_ID",
        sellerEmail: SUPPORT_EMAIL,
        orderNotificationFunctionName: "",
      },
      products: DEVELOPMENT_PRODUCTS,
    },
    production: {
      mode: "production",
      label: "Production",
      isProduction: true,
      supabase: {
        // Supabase PROD project public URL and anon/publishable key.
        url: PRODUCTION_SUPABASE_URL,
        anonKey: PRODUCTION_SUPABASE_ANON_KEY,
      },
      razorpay: {
        // Replace with the Razorpay live key_id before enabling production.
        // Do not put the Razorpay key_secret in this repository.
        keyId: "rzp_live_REPLACE_WITH_PUBLIC_KEY_ID",
        businessName: "Aaruni Tech",
        supportEmail: SUPPORT_EMAIL,
      },
      email: {
        // Production sends real admin order emails through the Supabase Edge Function.
        provider: "supabase-edge-function",
        publicKey: "",
        serviceId: "",
        buyerTemplateId: "",
        sellerTemplateId: "",
        sellerEmail: SUPPORT_EMAIL,
        orderNotificationFunctionName: "send-order-notification",
      },
      products: PRODUCTION_PRODUCTS,
    },
  };

  const activeConfig = ENVIRONMENTS[ENV] || ENVIRONMENTS.development;

  if (!ENVIRONMENTS[ENV]) {
    console.warn(`[Config] Unknown ENV "${ENV}". Falling back to development mode.`);
  }

  console.log(`Running in ${activeConfig.mode.toUpperCase()} mode`);

  window.AARUNI_CONFIG = activeConfig;
  window.AARUNI_ENVIRONMENT = activeConfig.mode;
  window.AARUNI_PRODUCTS = activeConfig.products;

  // Backwards-compatible globals used by existing page scripts.
  window.SUPABASE_URL = activeConfig.supabase.url;
  window.SUPABASE_ANON_KEY = activeConfig.supabase.anonKey;
  window.RAZORPAY_KEY_ID = activeConfig.razorpay.keyId;
  window.RAZORPAY_BUSINESS_NAME = activeConfig.razorpay.businessName;
  window.RAZORPAY_SUPPORT_EMAIL = activeConfig.razorpay.supportEmail;
  window.EMAILJS_PUBLIC_KEY = activeConfig.email.publicKey;
  window.EMAILJS_SERVICE_ID = activeConfig.email.serviceId;
  window.EMAILJS_BUYER_TEMPLATE_ID = activeConfig.email.buyerTemplateId;
  window.EMAILJS_SELLER_TEMPLATE_ID = activeConfig.email.sellerTemplateId;
})();
