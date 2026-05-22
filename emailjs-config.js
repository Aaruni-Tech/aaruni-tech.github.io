// Public EmailJS config.
// Values come from aaruni-config.js so development can use testing templates
// while production uses real order emails through Supabase Edge Functions.
// Do not store private API keys or mail-provider secrets in frontend files.
(function () {
  const config = window.AARUNI_CONFIG || {};
  const emailConfig = config.email || {};

  window.EMAILJS_PUBLIC_KEY = emailConfig.publicKey || "";
  window.EMAILJS_SERVICE_ID = emailConfig.serviceId || "";
  window.EMAILJS_BUYER_TEMPLATE_ID = emailConfig.buyerTemplateId || "";
  window.EMAILJS_SELLER_TEMPLATE_ID = emailConfig.sellerTemplateId || "";
})();
