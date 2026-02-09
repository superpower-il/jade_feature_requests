# Feature Requests Management System

Hebrew (RTL) web app for tracking feature requests from customers, with Fireberry CRM integration.

## Architecture

Single-page app (`index.html`) hosted on **GitHub Pages**, backed by **Google Apps Script** + **Google Sheets** as database.

```
Browser (GitHub Pages)
  |
  |-- fetchGoogleScript() --> Google Apps Script (Web App)
  |                               |
  |                               |-- Google Sheets (data storage)
  |                               |-- Fireberry API (customer sync, server-side)
  |
  |-- localStorage (offline cache)
  |-- sessionStorage (auth state)
```

## Files

| File | Purpose |
|------|---------|
| `index.html` | Entire frontend: HTML + CSS + JS (single file) |
| `google-apps-script.js` | Backend code deployed in Google Apps Script |
| `.github/workflows/static.yml` | GitHub Pages deployment |

## Google Sheets Structure

4 sheets (tabs) required:

| Sheet | Columns |
|-------|---------|
| `customers` | id, powerlinkId, name, phone, email, accountNumber, source |
| `features` | id, name, description, status, category, createdAt |
| `requests` | id, customerId, featureId, priority, notes, date |
| `users` | mail, password |

## Key Constants

### index.html
```
GOOGLE_SCRIPT_URL  - Google Apps Script deployment URL
GOOGLE_CORS_PROXY  - 'https://api.codetabs.com/v1/proxy?quest=' (fallback for CORS)
```

### google-apps-script.js
```
Fireberry Token  - 'd7e7dda4-c054-4545-b951-1a3d5a393c07'
Fireberry API    - 'https://api.powerlink.co.il/api/query'
Version          - '3.0'
```

### localStorage keys
```
pl_customers, pl_features, pl_requests
```

## API Endpoints (Google Apps Script)

### GET
| Action | URL Params | Returns |
|--------|-----------|---------|
| Load all data | (none) | `{ success, data: { customers, features, requests, lastSync } }` |
| Version check | `?action=version` | `{ version: '3.0' }` |
| Login | `?action=login&mail=X&password=Y` | `{ success, error? }` |
| Sync Fireberry | `?action=syncPowerlink` | `{ success, data: [accounts] }` |

### POST
| Action | Body | Effect |
|--------|------|--------|
| saveCustomers | `{ action, data, lastSync }` | Writes customers sheet |
| saveFeatures | `{ action, data }` | Writes features sheet |
| saveRequests | `{ action, data }` | Writes requests sheet |
| saveAll | `{ action, customers, features, requests, lastSync }` | Writes all sheets |

POST uses `Content-Type: text/plain;charset=utf-8` to avoid CORS preflight.

## CORS Strategy

Direct `fetch()` to Google Apps Script can fail in browsers due to cross-origin redirects. Solution:

1. **Try direct fetch first** (works from HTTPS origins)
2. **Fallback to CORS proxy** (`api.codetabs.com`) if direct fails
3. **Fireberry API** is called server-side from Google Apps Script (no CORS)

`corsproxy.io` is blocked (403) - do NOT use it.

## Data Flow

### Loading
1. Load from localStorage (instant display)
2. Fetch from Google Sheets in background
3. Update localStorage cache + re-render

### Saving
1. Save to localStorage (immediate)
2. POST to Google Sheets (async, fire-and-forget with retry via proxy)

### Customer Sync
1. Frontend calls `?action=syncPowerlink` on Google Apps Script
2. Google Apps Script calls Fireberry API server-side (paginated, 500/page)
3. Returns flat array of account records
4. Frontend merges by `powerlinkId` (update existing or add new)

## ID Format
- Features: `f_` + timestamp
- Customers: `c_` + timestamp + `_` + random
- Requests: `r_` + timestamp (or + `_` + random)

## Feature Statuses
`idea` | `review` | `development` | `done` | `rejected`

## Feature Categories
`ux` | `integrations` | `reports` | `automation` | `other`

## Customer Sources
`powerlink` (synced from Fireberry) | `manual` (added manually)

UI displays both as "Fireberry" (visual rename, data field unchanged).

## Deployment

### GitHub Pages
Push to `main` branch -> auto-deploys via GitHub Actions.
URL: `https://superpower-il.github.io/jade_feature_requests/`

### Google Apps Script
1. Open Google Sheet -> Extensions -> Apps Script
2. Paste code from `google-apps-script.js`
3. Deploy > Manage deployments > Edit > **New version** > Deploy
4. Verify: `?action=version` should return current version number

**Important:** After ANY code change in Apps Script, you MUST create a new deployment version. Just saving is not enough.

## Development Notes

- All UI text is in Hebrew (RTL)
- The app is a single HTML file with inline CSS and JS
- No build tools, no npm, no frameworks
- Date formatting uses `he-IL` locale
- Priority scale: 1 (low) to 5 (critical)
- Authentication: simple email+password checked against `users` sheet
- Session stored in `sessionStorage` (lost on tab close)
