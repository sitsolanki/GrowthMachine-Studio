# 🚀 GrowthMachine Studio — Deployment & Hosting Guide

Congratulations on building your agency platform! This website is engineered to be **100% serverless, lighting fast, and completely free to host** on Cloudflare Pages and GitHub Pages.

---

## 📁 Project Structure
```
growthmachine-studio/
├── index.html        # High-converting agency homepage
├── admin.html        # Private Studio Admin Management Portal
├── style.css         # Modern dark-mode high-converting styles
├── store.js          # LocalStorage & data sync manager
├── app.js            # Live site binding & dynamic rendering
├── admin.js          # Admin dashboard & PIN auth controller
└── data/
    └── content.json  # Exportable configuration & project store
```

---

## 🌐 How to Host on Cloudflare Pages (Recommended - 0ms Cold Start, 100% Free)

Cloudflare Pages gives you free unlimited bandwidth, 300+ edge datacenter caching, and automated SSL.

### Step 1: Push your project to GitHub
1. Create a new GitHub repository (e.g. `growthmachine-studio`).
2. Upload or commit all files from this folder.

### Step 2: Connect to Cloudflare Pages
1. Go to your [Cloudflare Dashboard](https://dash.cloudflare.com/).
2. In the left menu, click **Compute (Workers) > Pages** or **Workers & Pages**.
3. Click **Create Application** > select **Pages** tab > **Connect to Git**.
4. Select your `growthmachine-studio` repository.
5. In the build settings:
   - **Framework preset**: `None`
   - **Build command**: Leave empty
   - **Build output directory**: Leave empty (root `/`)
6. Click **Save and Deploy**.

Your site will be live immediately at `https://growthmachine-studio.pages.dev`!
Make sure the deployment includes every project file, especially the root-level `store.js`. The homepage and admin portal both depend on it; if it is missing or returns 404, the portfolio and other dynamic sections will not render and admin login will fail.

---

## 🐙 How to Host on GitHub Pages

1. In your GitHub repo, go to **Settings** > **Pages**.
2. Under **Build and deployment** > **Source**, choose **Deploy from a branch**.
3. Select `main` branch and `/ (root)` folder.
4. Click **Save**. Within 60 seconds, your site is live at `https://<username>.github.io/<repo-name>/`.

---

## 🔒 Accessing Your Admin Portal
- Open `admin.html` (e.g. `https://yourdomain.com/admin.html` or locally).
- Enter the default PIN: `1234`
- You can change:
  - Business Email
  - WhatsApp Number & Phone Call number
  - Tagline & Descriptions
  - Add new Client Projects with live links
  - Update Package Prices
  - Change your Admin PIN
