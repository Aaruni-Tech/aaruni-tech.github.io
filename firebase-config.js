// Firebase config (public). Replace these placeholders with your Firebase Web App config.
// This file is safe to commit (it does not contain private keys), but keep your Razorpay secret
// and EmailJS private key ONLY in Firebase Functions config/secrets.
window.AARUNI_FIREBASE_CONFIG = {
  apiKey: "YOUR_FIREBASE_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID",
};

// Optional: email address that should be treated as admin in the client UI (security is enforced via rules/claims).
window.AARUNI_ADMIN_EMAIL = "tech.aaruni@gmail.com";

