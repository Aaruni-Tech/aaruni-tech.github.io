const EMAILJS_ENDPOINT = "https://api.emailjs.com/api/v1.0/email/send";

async function sendEmailJs({ serviceId, templateId, userId, accessToken, templateParams }) {
  if (!serviceId || !templateId || !userId) {
    throw new Error("EmailJS is not configured (missing serviceId/templateId/userId).");
  }

  const response = await fetch(EMAILJS_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      service_id: serviceId,
      template_id: templateId,
      user_id: userId,
      accessToken: accessToken || undefined,
      template_params: templateParams || {},
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`EmailJS send failed: ${response.status} ${text}`.trim());
  }

  return { ok: true };
}

module.exports = { sendEmailJs };

