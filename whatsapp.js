const WHATSAPP_SUPPORT_NUMBER = "917842097003";
const WHATSAPP_STORAGE_KEY = "aaruniTechWhatsappContact";

function createWhatsAppWidget() {
  if (document.querySelector("#whatsappWidget")) {
    return;
  }

  const widget = document.createElement("section");
  widget.className = "whatsapp-widget";
  widget.id = "whatsappWidget";
  widget.innerHTML = `
    <button class="whatsapp-fab" type="button" aria-expanded="false" aria-controls="whatsappPanel" aria-label="Open WhatsApp support">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12.04 2.75a9.12 9.12 0 0 0-7.75 13.94L3.3 21.25l4.67-1.07a9.1 9.1 0 0 0 4.07.97h.01a9.2 9.2 0 0 0 9.15-9.2 9.17 9.17 0 0 0-9.16-9.2Zm5.34 13.02c-.22.62-1.28 1.16-1.78 1.22-.46.07-1.04.1-1.68-.1-.39-.12-.9-.29-1.54-.56-2.7-1.17-4.47-3.89-4.6-4.07-.13-.18-1.1-1.46-1.1-2.79s.7-1.98.95-2.25c.25-.27.54-.34.72-.34h.52c.16.01.39-.06.6.46.22.53.75 1.83.81 1.96.07.14.11.3.02.48-.09.18-.13.29-.27.45-.13.16-.29.35-.41.47-.14.14-.28.29-.12.56.16.27.69 1.14 1.49 1.85 1.02.91 1.88 1.2 2.15 1.34.27.13.43.11.58-.07.16-.18.67-.78.85-1.04.18-.27.36-.22.61-.13.25.09 1.6.76 1.87.9.27.13.45.2.52.31.07.11.07.65-.16 1.28Z" />
      </svg>
      <span class="sr-only">WhatsApp</span>
    </button>

    <div class="whatsapp-panel" id="whatsappPanel" hidden>
      <div class="whatsapp-panel-header">
        <div>
          <strong>WhatsApp Support</strong>
          <span>Ask Aaruni Tech a question.</span>
        </div>
        <button type="button" data-whatsapp-close aria-label="Close WhatsApp support">&times;</button>
      </div>

      <form class="whatsapp-form" id="whatsappForm">
        <label>
          <span>Name</span>
          <input type="text" name="name" autocomplete="name" required />
        </label>

        <label>
          <span>Mobile Number</span>
          <input
            type="tel"
            name="phone"
            inputmode="numeric"
            autocomplete="tel"
            pattern="[0-9]{10}"
            placeholder="10 digit mobile number"
            required
          />
        </label>

        <label>
          <span>Question</span>
          <textarea name="question" rows="4" placeholder="Type your question here" required></textarea>
        </label>

        <p class="whatsapp-error" data-whatsapp-error role="alert"></p>
        <button class="whatsapp-submit" type="submit">Send WhatsApp</button>
      </form>
    </div>
  `;

  document.body.appendChild(widget);
  hydrateWhatsAppContact(widget);

  const toggleButton = widget.querySelector(".whatsapp-fab");
  const closeButton = widget.querySelector("[data-whatsapp-close]");
  const form = widget.querySelector("#whatsappForm");

  toggleButton.addEventListener("click", () => {
    const isOpen = widget.classList.toggle("open");
    toggleButton.setAttribute("aria-expanded", String(isOpen));
    widget.querySelector("#whatsappPanel").hidden = !isOpen;

    if (isOpen) {
      widget.querySelector("input[name='name']").focus();
    }
  });

  closeButton.addEventListener("click", () => {
    closeWhatsAppWidget(widget);
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    sendWhatsAppMessage(widget, form);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeWhatsAppWidget(widget);
    }
  });
}

function closeWhatsAppWidget(widget) {
  widget.classList.remove("open");
  widget.querySelector(".whatsapp-fab").setAttribute("aria-expanded", "false");
  widget.querySelector("#whatsappPanel").hidden = true;
}

function hydrateWhatsAppContact(widget) {
  try {
    const savedContact = JSON.parse(window.localStorage.getItem(WHATSAPP_STORAGE_KEY));

    if (!savedContact || typeof savedContact !== "object") {
      return;
    }

    if (savedContact.name) {
      widget.querySelector("input[name='name']").value = savedContact.name;
    }

    if (savedContact.phone) {
      widget.querySelector("input[name='phone']").value = savedContact.phone;
    }
  } catch (error) {
    return;
  }
}

function saveWhatsAppContact(name, phone) {
  try {
    window.localStorage.setItem(WHATSAPP_STORAGE_KEY, JSON.stringify({ name, phone }));
  } catch (error) {
    return;
  }
}

function sendWhatsAppMessage(widget, form) {
  const formData = new FormData(form);
  const name = String(formData.get("name") || "").trim();
  const phone = String(formData.get("phone") || "").replace(/\D/g, "");
  const question = String(formData.get("question") || "").trim();
  const errorElement = widget.querySelector("[data-whatsapp-error]");

  errorElement.textContent = "";

  if (!name || phone.length !== 10 || !question) {
    errorElement.textContent = "Enter your name, 10 digit mobile number, and question.";
    return;
  }

  saveWhatsAppContact(name, phone);

  const message = [
    "Hello Aaruni Tech, I have a question.",
    "",
    `Name: ${name}`,
    `Mobile: ${phone}`,
    `Question: ${question}`,
    `Page: ${document.title}`,
    `Link: ${window.location.href}`,
  ].join("\n");
  const whatsappUrl = `https://wa.me/${WHATSAPP_SUPPORT_NUMBER}?text=${encodeURIComponent(message)}`;

  window.open(whatsappUrl, "_blank", "noopener,noreferrer");
  closeWhatsAppWidget(widget);
}

document.addEventListener("DOMContentLoaded", createWhatsAppWidget);
