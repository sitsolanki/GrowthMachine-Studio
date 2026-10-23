# gbp — set the GrowthMachine Studio business description

This folder contains `set-description.mjs`, a small Node.js script that sets the **business description** of the Google Business Profile (GBP) for **GrowthMachine Studio**. Google renders this field as the "About" / business description on Google Search and Maps results.

The script writes the description through the official Google Business Profile **Business Information API** (`Location.profile.description`). Business facts used throughout:

- Business name: GrowthMachine Studio
- Address: 5b/23, Vishnu Garden, West Delhi 110018, India
- Phone: +91 75575 75514
- Website: https://www.growthmachinestudio.com/
- Services: landing page design, business website development, e-commerce / product catalogue websites, website launch support
- Audience: Delhi NCR professionals and local businesses (advocates, clinics, consultants, real estate, local services, D2C brands)

```text
node gbp/set-description.mjs <command> [options]

Commands:
  auth     Run the OAuth 2.0 loopback flow and save the token to the token file
  list     List the Google accounts and Business Profile locations you can access
  show     Print the current business description of the selected location
  set      Write the business description to the live Business Profile
  verify   Re-read the location and confirm the live description matches
  help     Show this usage text

Options:
  --description-file <path>  File with the description text (default: gbp/description.txt)
  --description "<text>"     Inline description text (overrides the file)
  --location <id|name>       Target location, e.g. 123456789 or locations/123456789
  --account <name>           Target account, e.g. accounts/123456789
  --dry-run                  Validate the change with Google without saving it
  --json                     Print machine-readable JSON
  --help                     Show usage

Environment variables:
  GBP_CLIENT_ID, GBP_CLIENT_SECRET  Google OAuth 2.0 client (Desktop app)
  GBP_REDIRECT_PORT                 default 8976
  GBP_TOKEN_FILE                    default gbp/.tokens.json
  GBP_ACCOUNT_NAME                  optional pinned account
```

A `.env` file in the `gbp/` folder is loaded automatically (see `gbp/.env.example`).

## What you need before you start

- A Google account that is an **OWNER or MANAGER** of the GrowthMachine Studio Business Profile.
- A Google Cloud project dedicated to this tool.
- Node.js 18 or newer.
- Business Profile API access approval for that Cloud project (see Step 1).

## Step 1 — Get Business Profile API access

The Business Profile APIs are not visible in the Cloud console API Library until your Cloud project is approved. Request access here:

https://support.google.com/business/contact/api_default

This is the **GBP API contact form**; in the drop-down select **"Application for Basic API Access"** and provide all the requested information; a follow-up email is sent once the request has been reviewed.

Requirements (see https://developers.google.com/my-business/content/prereqs):

- You must manage a Google Business Profile that is **verified and active for 60+ days**. It can be your own office/headquarters or one of a client's.
- The business must have a **website** listed on the Business Profile.
- Apply with a **Cloud project** in mind, and provide your **project number** (the "Project info" card on the Cloud console dashboard).
- Submit the request using an **email address that is listed as an owner/manager** on that Business Profile.
- The profile should be fully complete and kept up to date with current business information, including the official website, before applying.
- Checking approval: look at the quota for the Business Profile APIs in the Cloud console. **0 QPM = not yet approved; 300 QPM = approved.**
- You also need an Organization account — https://support.google.com/business/answer/7663063.

Approval is on the **Cloud project**, and a personal Cloud project cannot be shared with others — use a dedicated project for this tool.

## Step 2 — Enable the APIs

In the Google Cloud console API Library, enable these seven APIs:

1. Google My Business API
2. My Business Account Management API
3. My Business Lodging API
4. My Business Place Actions API
5. My Business Notifications API
6. My Business Verifications API
7. My Business Business Information API

Billing may be required to enable some APIs. The **Business Information API** is the one that carries the description field (`Location.profile.description`).

https://console.cloud.google.com/apis/library

## Step 3 — Create an OAuth 2.0 client

In the Cloud console, go to **Credentials -> Create credentials -> OAuth client ID**, choose **Desktop app**, and copy the client id and client secret.

- Do NOT use a Service Account — it cannot be the Business Profile owner without domain-wide delegation.
- Do NOT commit the client secret.

For a one-off manual call you can also use the OAuth Playground at https://developers.google.com/oauthplayground. The Playground needs a **Web application** OAuth client with the redirect URI `https://developers.google.com/oauthplayground` added to it, while the script in this folder uses a **Desktop app** client. Use the scope `https://www.googleapis.com/auth/business.manage` for both.

## Step 4 — Save the credentials

Copy `gbp/.env.example` to `gbp/.env` and fill in the values.

PowerShell:
```powershell
Copy-Item gbp\.env.example gbp\.env
notepad gbp\.env
```

bash / macOS:
```bash
cp gbp/.env.example gbp/.env
```

Or set the variables directly in your shell instead of a `.env` file:

```powershell
$env:GBP_CLIENT_ID = "xxxx.apps.googleusercontent.com"
$env:GBP_CLIENT_SECRET = "xxxx"
```

## Step 5 — Authorise (`auth`)

```powershell
node gbp/set-description.mjs auth
```

A browser window opens. Pick the Google account that **OWNs** the GrowthMachine Studio profile, grant consent, and the script prints the authorized account and stores a refresh token in `gbp/.tokens.json`.

`gbp/.tokens.json` is gitignored — delete it if the machine is shared. You only need to run `auth` again if the refresh token is revoked.

## Step 6 — Find the location (`list`)

```powershell
node gbp/set-description.mjs list
```

Representative output:

```text
accounts/112233445566
  locations/778899001122 — GrowthMachine Studio
```

If you have several locations, pass `--location`. A single-location account is auto-selected.

## Step 7 — Preview and write the description

```powershell
node gbp/set-description.mjs show
node gbp/set-description.mjs set --dry-run
node gbp/set-description.mjs set
node gbp/set-description.mjs verify
```

`show` prints the current description. `set --dry-run` (validateOnly) validates the payload with Google without saving it. `set` writes it live, and `verify` re-reads the location to confirm the live description matches.

Description text comes from `gbp/description.txt` by default, or you can pass it inline:

```powershell
node gbp/set-description.mjs set --description "Your description text here"
node gbp/set-description.mjs set --description-file gbp/description.txt --location locations/778899001122 --json
```

`--dry-run` validates the payload with Google without saving.

## Editing the description

The description lives in `gbp/description.txt`. Edit that file and re-run `set`.

Google's rules:
- Maximum 750 characters.
- Write in the business's own voice.
- No URLs.
- No phone numbers or emails.
- No emoji.
- No keyword stuffing or hype ("best in town", "call now", "24/7", discounts).



## Why the copy avoids certain words

- Google lists **lead generation agents and companies as ineligible for a Business Profile** (https://support.google.com/business/answer/13762416#ineligible_businesses). The description therefore describes website building only and never says "lead generation" — and the profile primary category should be a web design / website designer category, never a lead-generation category.
- No URLs, phone numbers, email addresses, emoji, prices or direct calls-to-action ("call now", "best in town", "24/7", discounts). See https://support.google.com/business/answer/3038177#description and https://support.google.com/business/answer/3039617.
- Do not publish the same description text on more than one profile — Google treats that as keyword stuffing (https://support.google.com/business/answer/7400114).
- The maximum is 750 characters.
- Google may review edits before they appear, and a change can take a few days to reach Google Search and Maps.
- The current copy in `gbp/description.txt` is 614 characters.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `403 PERMISSION_DENIED` on every call | Business Profile API access not approved for the Cloud project, or the account used for `auth` is not an owner/manager of the profile, or Google Workspace has Business Profile turned off for that account | Request API access (Step 1), re-run `auth` with an owner/manager account, or check Workspace settings |
| 403 or SERVICE_DISABLED on the very first call, right after approval | The Business Information API is not enabled for the project, or the project is not approved yet (quota still 0 QPM) | Enable the API in the API Library (https://console.cloud.google.com/apis/library) and confirm the quota shows 300 QPM |
| `403` with `ACCESS_TOKEN_SCOPE_INSUFFICIENT` | Token minted without `https://www.googleapis.com/auth/business.manage` | Re-run `auth` and confirm consent |
| `404` on the location | Wrong location id | Re-run `list` |
| `429` / quota | Quota exhausted | Check API quotas in the Cloud console |
| Description saved but not visible on Search/Maps | Propagation delay or Google review | Wait a few days; Google may review edits before they appear |
| `The redirect_uri does not match` | Port changed between authorize and token exchange, or a stale `gbp/.tokens.json` | Delete `gbp/.tokens.json` and re-run `auth` |
| Browser does not open | — | Copy the printed URL and open it manually |

## Doing it without the API

The manual path is a valid fallback for a one-off change: go to business.google.com, open the profile, choose Edit profile, edit the business description field, and Save. It is also useful to confirm what the final copy should read like before running the script.

## File reference

| File | Description |
|---|---|
| `set-description.mjs` | Main script: auth, list, show, set, verify, help |
| `description.txt` | Business description text (edit this, then run `set`) |
| `.env.example` | Credentials template; copy to `.env` and fill in values |
| `.tokens.json` | Holds a live OAuth refresh token and the OAuth client secret; never commit or share it. It is gitignored. |
| `selftest.mjs` | Self-test for the script |
| `README.md` | This setup guide |
