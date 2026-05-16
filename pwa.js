const AARUNI_APP_VERSION = "2026.05.16.2";
const VERSION_STORAGE_KEY = "aaruniTechAppVersion";

let deferredInstallPrompt = null;
let pendingServiceWorker = null;
let reloadingForUpdate = false;

function isAppInstalled() {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

function createPwaPrompt() {
  let prompt = document.querySelector("#pwaPrompt");

  if (prompt) {
    return prompt;
  }

  prompt = document.createElement("section");
  prompt.className = "pwa-prompt";
  prompt.id = "pwaPrompt";
  prompt.setAttribute("aria-live", "polite");
  prompt.innerHTML = `
    <div>
      <strong id="pwaPromptTitle">Install Aaruni Tech</strong>
      <p id="pwaPromptText">Add Aaruni Tech to your phone for faster shopping and checkout.</p>
    </div>
    <div class="pwa-prompt-actions">
      <button class="secondary-button" type="button" data-pwa-dismiss>Later</button>
      <button class="primary-button" type="button" data-pwa-action>Install</button>
    </div>
  `;
  document.body.appendChild(prompt);

  prompt.querySelector("[data-pwa-dismiss]").addEventListener("click", hidePwaPrompt);
  prompt.querySelector("[data-pwa-action]").addEventListener("click", handlePwaAction);

  return prompt;
}

function showPwaPrompt({ title, text, actionText, mode }) {
  const prompt = createPwaPrompt();
  prompt.dataset.mode = mode;
  prompt.querySelector("#pwaPromptTitle").textContent = title;
  prompt.querySelector("#pwaPromptText").textContent = text;
  prompt.querySelector("[data-pwa-action]").textContent = actionText;
  prompt.classList.add("show");
}

function hidePwaPrompt() {
  const prompt = document.querySelector("#pwaPrompt");

  if (prompt) {
    prompt.classList.remove("show");
  }
}

function shouldShowIosInstallGuide() {
  const isIos = /iphone|ipad|ipod/i.test(window.navigator.userAgent);
  const isSafari = /^((?!chrome|android|crios|fxios).)*safari/i.test(window.navigator.userAgent);
  return isIos && isSafari && !isAppInstalled();
}

function handlePwaAction() {
  const prompt = document.querySelector("#pwaPrompt");
  const mode = prompt ? prompt.dataset.mode : "";

  if (mode === "install" && deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    deferredInstallPrompt.userChoice.finally(() => {
      deferredInstallPrompt = null;
      hidePwaPrompt();
    });
    return;
  }

  if (mode === "update") {
    applyAppUpdate();
    return;
  }

  hidePwaPrompt();
}

function applyAppUpdate() {
  if (pendingServiceWorker) {
    pendingServiceWorker.postMessage({ type: "SKIP_WAITING" });
    return;
  }

  window.location.reload();
}

function showInstallPrompt() {
  if (isAppInstalled()) {
    return;
  }

  if (!deferredInstallPrompt && shouldShowIosInstallGuide()) {
    showPwaPrompt({
      title: "Add Aaruni Tech to Home Screen",
      text: "Tap Share in Safari, then choose Add to Home Screen.",
      actionText: "OK",
      mode: "ios-guide",
    });
    return;
  }

  showPwaPrompt({
    title: "Install Aaruni Tech",
    text: "Add Aaruni Tech to your phone for faster shopping and checkout.",
    actionText: deferredInstallPrompt ? "Install" : "OK",
    mode: deferredInstallPrompt ? "install" : "ios-guide",
  });
}

function showUpdatePrompt(message) {
  showPwaPrompt({
    title: "Update Aaruni Tech",
    text: message || "A new version is ready. Update now to get the latest products, policies, and checkout fixes.",
    actionText: "Update",
    mode: "update",
  });
}

function checkVersion() {
  fetch(`version.json?ts=${Date.now()}`, { cache: "no-store" })
    .then((response) => (response.ok ? response.json() : null))
    .then((versionInfo) => {
      if (!versionInfo || !versionInfo.version) {
        return;
      }

      const savedVersion = window.localStorage.getItem(VERSION_STORAGE_KEY);

      if (savedVersion && savedVersion !== versionInfo.version) {
        showUpdatePrompt(versionInfo.message);
      }

      if (!savedVersion || AARUNI_APP_VERSION === versionInfo.version) {
        window.localStorage.setItem(VERSION_STORAGE_KEY, versionInfo.version);
      }
    })
    .catch(() => {
      return;
    });
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  navigator.serviceWorker
    .register("sw.js", { scope: "./", updateViaCache: "none" })
    .then((registration) => {
      registration.update();

      if (registration.waiting && navigator.serviceWorker.controller) {
        pendingServiceWorker = registration.waiting;
        showUpdatePrompt();
      }

      registration.addEventListener("updatefound", () => {
        const newWorker = registration.installing;

        if (!newWorker) {
          return;
        }

        newWorker.addEventListener("statechange", () => {
          if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
            pendingServiceWorker = newWorker;
            showUpdatePrompt();
          }
        });
      });
    })
    .catch(() => {
      return;
    });

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloadingForUpdate) {
      return;
    }

    reloadingForUpdate = true;
    window.location.reload();
  });
}

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  window.setTimeout(showInstallPrompt, 1200);
});

window.addEventListener("appinstalled", () => {
  deferredInstallPrompt = null;
  hidePwaPrompt();
});

document.addEventListener("DOMContentLoaded", () => {
  registerServiceWorker();
  checkVersion();

  if (shouldShowIosInstallGuide()) {
    window.setTimeout(showInstallPrompt, 1200);
  }
});
