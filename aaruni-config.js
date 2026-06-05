(function () {
  "use strict";

  // Safe fallback mode. Runtime mode is loaded from Supabase app_settings
  // through the public-config Edge Function when available.
  const ENV = "test";

  const SUPPORT_EMAIL = "tech.aaruni@gmail.com";

  // Only browser-safe public values belong in this file:
  // - Supabase project URL
  // - Supabase anon/publishable key
  // - Razorpay key_id
  // - EmailJS public IDs
  //
  // Never add Razorpay key_secret, Supabase service_role key, Resend API key,
  // webhook secrets, or any other private server credential to this repository.
  // Supabase PROD project: aaruni-tech-prod. Both TEST and LIVE runtime modes
  // use this project; mode controls whether checkout writes to test_orders or
  // orders and which Razorpay key_id is exposed.
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
    isTestProduct: true,
    name: `Test ${product.name}`,
    price: DEVELOPMENT_PRICES[index] || 10,
    description: `Development test product. ${product.description}`,
  }));

  const ENVIRONMENTS = {
    test: {
      mode: "test",
      label: "TEST MODE",
      isProduction: false,
      supabase: {
        // Use the production Supabase project in TEST mode so admin settings,
        // email logs, and test_orders live beside the protected production data.
        url: PRODUCTION_SUPABASE_URL,
        anonKey: PRODUCTION_SUPABASE_ANON_KEY,
      },
      razorpay: {
        // Razorpay test key_id only. Do not put key_secret in frontend code.
        keyId: "rzp_test_SpYO2ojU9ZzsNG",
        businessName: "Aaruni Tech DEV",
        supportEmail: SUPPORT_EMAIL,
      },
      email: {
        // TEST/development uses the same Edge Function path as production so
        // order status fields, Resend retries, and idempotency are validated.
        provider: "supabase-edge-function",
        publicKey: "",
        serviceId: "",
        buyerTemplateId: "",
        sellerTemplateId: "",
        sellerEmail: SUPPORT_EMAIL,
        orderNotificationFunctionName: "send-order-notification",
      },
      settings: {
        shippingFee: 0,
        gst: {
          enabled: false,
          percent: 0,
        },
      },
      products: DEVELOPMENT_PRODUCTS,
    },
    production: {
      mode: "production",
      label: "LIVE MODE",
      isProduction: true,
      supabase: {
        // Supabase PROD project public URL and anon/publishable key.
        url: PRODUCTION_SUPABASE_URL,
        anonKey: PRODUCTION_SUPABASE_ANON_KEY,
      },
      razorpay: {
        // Loaded at runtime from Supabase app_settings/public-config.
        // Do not put the Razorpay key_secret in this repository.
        keyId: "",
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
      settings: {
        shippingFee: 0,
        gst: {
          enabled: false,
          percent: 0,
        },
      },
      products: PRODUCTION_PRODUCTS,
    },
  };

  function normalizeEnvironment(value) {
    const raw = String(value || "").trim().toLowerCase();

    if (raw === "dev" || raw === "development" || raw === "test" || raw === "testing") {
      return "test";
    }

    if (raw === "prod" || raw === "live") {
      return "production";
    }

    return ENVIRONMENTS[raw] ? raw : "";
  }

  function getProductsForEnvironment(config) {
    const environmentProducts = Array.isArray(config.products) ? config.products : [];

    if (!config.isProduction) {
      return environmentProducts.map((product) => ({ ...product }));
    }

    return environmentProducts
      .filter((product) => !product.isTestProduct && !/^test\s+/i.test(String(product.name || "")))
      .map((product) => ({ ...product, isTestProduct: false }));
  }

  function hasTestProductMarker(products) {
    return (Array.isArray(products) ? products : []).some(
      (product) => product.isTestProduct || /^test\s+/i.test(String(product.name || ""))
    );
  }

  function assertSafePublicConfig(config, rawProducts) {
    const keyId = String(config.razorpay && config.razorpay.keyId ? config.razorpay.keyId : "").trim();
    const supabaseUrl = String(config.supabase && config.supabase.url ? config.supabase.url : "").trim();
    const anonKey = String(config.supabase && config.supabase.anonKey ? config.supabase.anonKey : "").trim();

    if (config.isProduction && keyId.startsWith("rzp_test_")) {
      throw new Error("[Config] Refusing production mode with a Razorpay test key_id.");
    }

    if (!config.isProduction && keyId.startsWith("rzp_live_")) {
      throw new Error("[Config] Refusing development mode with a Razorpay live key_id.");
    }

    if (config.isProduction && hasTestProductMarker(rawProducts)) {
      throw new Error("[Config] Refusing production mode with test products.");
    }

    if (!supabaseUrl.includes("fxoofgnhbvquenbfhdec.supabase.co")) {
      throw new Error("[Config] Refusing to run against a non-production Supabase project.");
    }

    if (/service[_-]?role|sb_secret_/i.test(anonKey)) {
      throw new Error("[Config] Refusing to expose a Supabase service role/secret key in browser config.");
    }
  }

  const requestedEnv = normalizeEnvironment(ENV);
  const selectedEnv = requestedEnv || "test";
  const environmentConfig = ENVIRONMENTS[selectedEnv] || ENVIRONMENTS.test;
  const activeConfig = {
    ...environmentConfig,
    supabase: { ...environmentConfig.supabase },
    razorpay: { ...environmentConfig.razorpay },
    email: { ...environmentConfig.email },
    settings: {
      ...environmentConfig.settings,
      gst: { ...(environmentConfig.settings && environmentConfig.settings.gst ? environmentConfig.settings.gst : {}) },
    },
  };

  activeConfig.products = getProductsForEnvironment(activeConfig);
  activeConfig.launchSafety = {
    realPaymentsActive: Boolean(activeConfig.isProduction),
    testModeBadge: !activeConfig.isProduction,
    sourceOfTruth: "Supabase app_settings via public-config with aaruni-config fallback",
  };

  assertSafePublicConfig(activeConfig, environmentConfig.products);

  if (!requestedEnv) {
    console.warn(`[Config] Unknown ENV "${ENV}". Falling back to development mode.`);
  }

  console.log(`Running in ${activeConfig.mode.toUpperCase()} mode`);

  window.AARUNI_CONFIG = activeConfig;
  window.AARUNI_ENVIRONMENT = activeConfig.mode;
  window.AARUNI_PRODUCTS = activeConfig.products;
  window.AARUNI_ENVIRONMENTS = Object.fromEntries(
    Object.entries(ENVIRONMENTS).map(([key, value]) => [
      key,
      {
        ...value,
        supabase: { ...value.supabase },
        razorpay: { ...value.razorpay },
        email: { ...value.email },
        settings: {
          ...value.settings,
          gst: { ...(value.settings && value.settings.gst ? value.settings.gst : {}) },
        },
        products: getProductsForEnvironment(value),
      },
    ])
  );

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
