const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Cache-Control": "no-store",
};

type SettingsRow = {
  environment_mode?: string;
  razorpay_test_key_id?: string;
  razorpay_live_key_id?: string;
  notification_email?: string;
  shipping_fee?: number;
  gst_enabled?: boolean;
  gst_percent?: number;
  resend_from_email?: string;
};

const DEFAULT_SETTINGS: Required<SettingsRow> = {
  environment_mode: "test",
  razorpay_test_key_id: "rzp_test_SpYO2ojU9ZzsNG",
  razorpay_live_key_id: "",
  notification_email: "tech.aaruni@gmail.com",
  shipping_fee: 0,
  gst_enabled: false,
  gst_percent: 0,
  resend_from_email: "",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function getServiceHeaders(serviceRoleKey: string) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
  };
}

function cleanText(value: unknown, fallback = "") {
  return String(value || fallback).trim();
}

function cleanNumber(value: unknown, fallback = 0) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function normalizeMode(value: unknown) {
  const raw = cleanText(value).toLowerCase();
  if (raw === "prod" || raw === "live" || raw === "production") {
    return "production";
  }
  return "test";
}

async function fetchSettings(supabaseUrl: string, serviceRoleKey: string): Promise<{ settings: Required<SettingsRow>; source: string }> {
  const url = new URL(`${supabaseUrl}/rest/v1/app_settings`);
  url.searchParams.set(
    "select",
    [
      "environment_mode",
      "razorpay_test_key_id",
      "razorpay_live_key_id",
      "notification_email",
      "shipping_fee",
      "gst_enabled",
      "gst_percent",
      "resend_from_email",
    ].join(","),
  );
  url.searchParams.set("id", "eq.global");
  url.searchParams.set("limit", "1");

  const response = await fetch(url, { headers: getServiceHeaders(serviceRoleKey) });
  const text = await response.text();

  if (!response.ok) {
    console.warn("[PublicConfig] app_settings unavailable; using safe test fallback", {
      status: response.status,
      body: text.slice(0, 500),
    });
    return { settings: DEFAULT_SETTINGS, source: "fallback" };
  }

  const rows = text ? JSON.parse(text) : [];
  const row = Array.isArray(rows) && rows[0] ? rows[0] as SettingsRow : {};

  return {
    settings: {
      environment_mode: normalizeMode(row.environment_mode || DEFAULT_SETTINGS.environment_mode),
      razorpay_test_key_id: cleanText(row.razorpay_test_key_id, DEFAULT_SETTINGS.razorpay_test_key_id),
      razorpay_live_key_id: cleanText(row.razorpay_live_key_id),
      notification_email: cleanText(row.notification_email, DEFAULT_SETTINGS.notification_email),
      shipping_fee: Math.max(0, cleanNumber(row.shipping_fee, DEFAULT_SETTINGS.shipping_fee)),
      gst_enabled: Boolean(row.gst_enabled),
      gst_percent: Math.max(0, cleanNumber(row.gst_percent, DEFAULT_SETTINGS.gst_percent)),
      resend_from_email: cleanText(row.resend_from_email),
    },
    source: "app_settings",
  };
}

function buildPublicConfig(settings: Required<SettingsRow>, source: string) {
  const mode = normalizeMode(settings.environment_mode);
  const isProduction = mode === "production";
  const keyId = isProduction ? settings.razorpay_live_key_id : settings.razorpay_test_key_id;
  const expectedPrefix = isProduction ? "rzp_live_" : "rzp_test_";
  const keyValid = cleanText(keyId).startsWith(expectedPrefix);
  const configError = keyValid ? "" : `${isProduction ? "Live" : "Test"} Razorpay key_id is not configured.`;

  return {
    ok: true,
    source,
    mode,
    label: isProduction ? "LIVE MODE" : "TEST MODE",
    isProduction,
    configError,
    razorpay: {
      keyId: keyValid ? keyId : "",
      businessName: isProduction ? "Aaruni Tech" : "Aaruni Tech TEST",
      supportEmail: settings.notification_email || DEFAULT_SETTINGS.notification_email,
    },
    email: {
      provider: "supabase-edge-function",
      sellerEmail: settings.notification_email || DEFAULT_SETTINGS.notification_email,
      orderNotificationFunctionName: "send-order-notification",
    },
    settings: {
      notificationEmail: settings.notification_email || DEFAULT_SETTINGS.notification_email,
      shippingFee: settings.shipping_fee,
      gst: {
        enabled: settings.gst_enabled,
        percent: settings.gst_percent,
      },
      resendFromEmailConfigured: Boolean(settings.resend_from_email),
    },
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "GET" && req.method !== "POST") {
    return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);
  }

  try {
    const supabaseUrl = cleanText(Deno.env.get("SUPABASE_URL")).replace(/\/+$/, "");
    const serviceRoleKey = cleanText(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse(buildPublicConfig(DEFAULT_SETTINGS, "fallback"));
    }

    const { settings, source } = await fetchSettings(supabaseUrl, serviceRoleKey);
    return jsonResponse(buildPublicConfig(settings, source));
  } catch (error) {
    console.error("[PublicConfig] failed", error instanceof Error ? error.message : String(error));
    return jsonResponse(buildPublicConfig(DEFAULT_SETTINGS, "fallback"));
  }
});
