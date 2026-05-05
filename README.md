# Aaruni Tech Ecommerce Landing Website

Aaruni Tech is a static marketplace-style ecommerce landing website for GitHub Pages. It uses plain HTML, CSS, and JavaScript to present a modern Indian tech storefront with category browsing, product search, a browser-only demo cart, a deal section, trust messaging, and footer links.

The site is designed for `https://aaruni-tech.github.io` and does not include a backend, payment processing, paid APIs, or customer data collection. The cart is saved only in the visitor's browser with `localStorage`; it is not sent to any server.

## How to Run Locally

Open `index.html` directly in your browser, or run a simple local static server from the project folder:

```bash
python3 -m http.server 8000
```

Then visit:

```text
http://localhost:8000
```

## GitHub Pages Deployment

For the repository `aaruni-tech.github.io`, GitHub Pages can serve this site directly from the repository root. Make sure these files are committed to the default branch:

- `index.html`
- `styles.css`
- `script.js`
- `README.md`

Once Pages is enabled, the website should be available at:

```text
https://aaruni-tech.github.io
```

## Future Improvements

- Add real product images and brand photography.
- Add dedicated category pages.
- Add product detail pages.
- Add real customer accounts with authentication.
- Add an admin dashboard for product uploads and order management.
- Add a seller portal for third-party sellers.
- Add secure checkout, payments, invoices, shipping, and refunds.
- Add accessibility testing and browser compatibility checks.
- Connect a backend or ecommerce platform only when real orders are needed.
