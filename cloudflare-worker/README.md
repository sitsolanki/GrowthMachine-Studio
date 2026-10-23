# ☁️ Cloudflare Worker & KV Universal Sync Guide

This Cloudflare Worker provides **universal, real-time server-side synchronization** for GrowthMachine Studio. Any change you make—such as updating your Admin Password, phone number, pricing, or adding portfolio websites—is stored directly at Cloudflare's Edge (in Cloudflare KV) and reflects instantly across all mobile phones, PCs, and tablets globally.

---

## 🚀 Quick Setup (2 Minutes)

### Method A: Via Cloudflare Web Dashboard (No terminal needed)

1. Log in to your [Cloudflare Dashboard](https://dash.cloudflare.com/).
2. In the left navigation, click **Workers & Pages** > **KV**.
3. Click **Create Namespace**:
   - Name: `GMS_KV`
   - Click **Add**.
4. Now, in the left navigation, click **Workers & Pages** > **Create application** > **Create Worker**:
   - Worker Name: `growthmachine-api` (or any name you like)
   - Click **Deploy**.
5. Click **Edit code**:
   - Delete the default code and paste the entire contents of [`worker.js`](worker.js).
   - Click **Deploy**.
6. Connect the KV storage to your Worker:
   - Go to your Worker's **Settings** tab > **Variables & Bindings** (or **Bindings**).
   - Under **KV Namespace Bindings**, click **Add binding**:
     - Variable name: `GMS_KV` *(must match exactly)*
     - KV namespace: select `GMS_KV`
   - Click **Save and deploy**.
7. Copy your Worker's URL (e.g. `https://growthmachine-api.<your-subdomain>.workers.dev`).
8. Open your Studio Admin Panel (`admin.html`), scroll to **Section 4: Cloudflare Worker & KV Universal Sync**, paste your URL, and click **Save & Test Connection**.

---

### Method B: Via Wrangler CLI (For developers)

1. Open your terminal in this folder:
   ```cmd
   cd E:\Websites\GrowthMachine-Studio-main\GrowthMachine-Studio-main\cloudflare-worker
   ```
2. Create the KV namespace:
   ```cmd
   npx wrangler kv namespace create GMS_KV
   ```
3. Copy the output `id = "..."` into your `wrangler.toml`.
4. Deploy to Cloudflare:
   ```cmd
   npx wrangler deploy
   ```
5. Copy your deployed Worker URL into `admin.html` under Section 4.

---

## ✅ How It Works
- **Universal Password Changes**: Changing your Admin PIN from your phone immediately writes to Cloudflare KV. All other devices will now require the new password.
- **Instant Global Sync**: When clients or you open the website, `app.js` and `admin.js` pull directly from your Cloudflare Edge Worker, so everyone sees your latest portfolio items and contacts without rebuilding the website!
