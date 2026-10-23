# Michael's Recipes (installable web app)

Plain static site, no build step. Open on iPhone in Safari → Share → **Add to Home Screen**.

## Files
- `index.html`, `app.js`, `app.css` – the app
- `recipes.json` – **all recipe data** (sections, filter tag groups, recipes)
- `manifest.webmanifest`, `apple-touch-icon.png`, `icons/` – home-screen install
- `sw.js` – offline cache (network-first for recipes.json, cache-first for the rest)

## Updating recipes
Edit only `recipes.json` and push. The app fetches it fresh whenever the phone is online,
so the next open/refresh shows the change; offline it uses the last copy.
A new `category` that isn't in `sections` automatically gets its own section.

If you change `app.js`, `app.css`, `index.html` or icons, also bump `VERSION` in `sw.js`
(e.g. `"v1"` → `"v2"`) so phones pick up the new app shell.
