# 🚀 GrowthMachine Studio — Cloudflare Worker + D1

Your Studio admin panel syncs through a Cloudflare Worker with **D1** (shared database), instead of browser-only `localStorage`. This configuration does not use R2 and does not require enabling R2 billing.

## What changed

| Before | After |
|--------|-------|
| `store.js` → `localStorage` (browser-only) | Worker API → D1 (shared, persists across devices) |
| Admin PIN in `localStorage` | `ADMIN_PASSWORD` as a **Worker secret** |
| Photo uploads to R2 | Public HTTPS image URL stored in D1 |
| Admin edits stay in one browser | Admin edits sync to D1 — public site reads live |

## API endpoints

**Public (no auth):**
- `GET /api/business` — business info + pricing plans
- `GET /api/listings` — all portfolio listings
- `GET /api/listings/:id` — single listing

**Admin (Bearer auth, `Authorization: Bearer <password>`):**
- `POST /api/admin/auth` — verify PIN (`{ pin }`)
- `POST /api/admin/business` — update business info
- `POST /api/admin/listings` — create listing
- `PUT /api/admin/listings/:id` — update listing
- `DELETE /api/admin/listings/:id` — delete listing

## Deploy steps

Run from the `GrowthMachine-Studio/` folder.

### 1. Install Wrangler
```bash
npm install -g wrangler
# or use npx
npx wrangler --version
```

### 2. Log in to Cloudflare
```bash
npx wrangler login
```

### 3. Create the D1 database
```bash
npx wrangler d1 create growthmachine-db
```
Copy the `database_id` from the output into `wrangler.toml` (already set to `492e7106-ff4b-452c-a9e7-06153d181cd9` if created via the earlier step — verify it matches).

### 4. Initialize the D1 schema
```bash
npx wrangler d1 execute growthmachine-db --remote --file=schema.sql
```
Or paste `schema.sql` into the D1 console query editor and run it.

### 5. Set admin secrets (never stored in code)
```bash
npx wrangler secret put ADMIN_PASSWORD
# Enter your admin PIN/password when prompted
```

### 6. Deploy
```bash
npx wrangler deploy
```

### 7. Migrate existing profile and portfolio data

The easiest option is to open `/admin.html`, log in, and select **Sync Bundled Data to Cloudflare** in the Cloudflare & GitHub Deployment Tools section. Confirm the sync when prompted. It updates profile and pricing data, updates portfolio items with matching URLs, creates missing bundled items, and leaves unrelated live projects unchanged.

Alternatively, the migration script imports the profile and projects from `data/content.json` into the shared Worker API. It is safe to rerun for the same project IDs. It does not migrate the old `adminPin`; the Worker password must be configured as the `ADMIN_PASSWORD` secret.

In PowerShell, enter the password through a hidden prompt, then run:

```powershell
$secure = Read-Host "Worker admin password" -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
  $env:ADMIN_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  node .\migrate.mjs
} finally {
  Remove-Item Env:ADMIN_PASSWORD -ErrorAction SilentlyContinue
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
}
```

## Google Search setup

The public homepage and the Delhi website-cost guide are listed in `sitemap.xml`; `robots.txt` points crawlers to that sitemap. After deploying:

1. Verify the `growthmachinestudio.com` domain property in Google Search Console.
2. Submit `https://www.growthmachinestudio.com/sitemap.xml` in Search Console.
3. Use URL Inspection to check the homepage and `/resources/website-design-cost-delhi/`, then request indexing if available.
4. Keep the business name, address and phone consistent across your site and business listings. If eligible, claim and complete your Google Business Profile with accurate service areas, hours, photos and categories.
5. Publish genuinely useful project examples and service information over time; ask real customers for honest reviews without incentives.

These steps help Google crawl and understand the site but do not guarantee indexing, rankings or a specific timeline. Search Console requires access to a Google account that owns or can verify the domain.

## Connecting your existing admin panel

`admin.js` now calls the Worker API directly. On unlock, it posts the entered PIN to `POST /api/admin/auth` and stores the Bearer token in memory only. Every create/edit/delete request includes `Authorization: Bearer <token>`, verified against the `ADMIN_PASSWORD` secret.

If you have a separate/custom admin panel elsewhere, point its create/edit/delete fetch calls at these endpoints with the auth header:

```js
fetch('/api/admin/listings', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ' + adminPassword,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(listingData),
});
```

## Local development

```bash
npx wrangler dev
```

Then open `http://localhost:8787/admin.html`, enter your admin PIN, and manage listings. The public site reads from the same API at `/`.

The Workers Free plan includes daily Workers and D1 quotas. Requests that exceed a free-plan quota will fail until the quota resets or the account changes plans. See Cloudflare's current [Workers limits](https://developers.cloudflare.com/workers/platform/limits/) and [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/).

### Project images without R2

The admin panel stores only the image URL in D1. Upload each image to a publicly accessible HTTPS image host first, then paste its direct image URL into the project form. The image host controls the image's availability and any separate limits; this Worker does not upload or store the image.

## File reference

- `src/worker.js` — Worker API (public read + authenticated admin)
- `schema.sql` — D1 tables: `business_info`, `listings`
- `wrangler.toml` — D1 binding + static assets
- `app.js` — Public site: fetches `/api/business`, `/api/listings`
- `admin.js` — Admin panel: auth + CRUD via Worker API
- `admin.html` — Admin UI with public image URL input
