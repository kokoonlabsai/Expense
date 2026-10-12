# Tally

*Money, beautifully kept.* A personal expense tracker with phone-number accounts, an API your iPhone or Android automations can post to, a spending dashboard, filterable transactions, and Splitwise-style groups.

## Features

- **Accounts**: sign up and log in with a phone number and password. Each person's data is private to them.
- **Automation API**: create API keys in Settings. iOS Shortcuts, Tasker, MacroDroid, HTTP Shortcuts or a script can then post `amount`, `date`, `name` and `category`. Dates, amounts and category names are parsed leniently. You can also send a batch of up to 200.
- **Dashboard**:
  - month total compared with last month, plus your budget and projected month-end spend
  - income and net
  - cumulative spending compared with last month's pace
  - category donut chart and six-month trend
  - top merchants, money you've lent out, group balances, and plain-language insights
- **Transactions**: search and filter by category (pick several), type, preset period, month, custom date range or amount range. You can sort, edit and delete, and export what you've filtered to CSV.
- **Splits**:
  - make groups of people, either registered users matched by phone number or people with just a name
  - split an expense equally, by exact amounts, by percentage or by shares
  - see each person's balance, with debts simplified to the fewest payments
  - record settle-up payments
  - optionally copy your own share into your personal transactions
- **Lending tracker**: add a person to a Lending transaction, then mark it as returned from the dashboard.
- **Budgets and categories**: set an overall monthly budget and per-category budgets. Add custom categories with your own colour and icon.
- **Settings**: change your currency (INR, USD, EUR, GBP, AED, SGD, AUD, CAD, JPY) or password, manage API keys, and delete your account.

## Run it locally

```bash
npm install            # installs server + client
npm run build          # builds the web app
JWT_SECRET=change-me npm start   # http://localhost:4000  (serves the app + API, data in a local SQLite file)
```

To load demo data, run `npm run seed:demo`, then log in with phone **+91 00000 00000** and password **demo1234**.

For development, run `npm run dev:server` (API on :4000) and `npm run dev:client` (Vite on :5173, which proxies `/api`). Run the API tests with `npm test`.

## Hosting (cheap setup)

| Piece | Where | Cost |
|---|---|---|
| Database | [Turso](https://turso.tech), hosted SQLite | Free tier |
| Backend (`server/`, Dockerfile included) | DigitalOcean App Platform | ~$5/month |
| Frontend (`client/`) | DigitalOcean static site **or** Vercel | Free |

The backend keeps no files of its own; all data lives in Turso. That means it can run on any container host and survive redeploys.

### 1. Database: Turso
1. Sign up at turso.tech and create a database (pick the region closest to your backend).
2. Copy the **database URL** (`libsql://….turso.io`) and create an **auth token**.

The tables are created automatically on first start.

### 2a. Backend + frontend on DigitalOcean (recommended: one domain)
`.do/app.yaml` defines a free static site for the frontend and a ~$5 container for the API, served on the same domain (`/api` goes to the backend). You don't need any cross-site settings.

1. Merge this code into `main`, or edit `branch:` in `.do/app.yaml`.
2. In DigitalOcean go to **Apps → Create App → GitHub** and pick this repo. It detects `.do/app.yaml`. Or run `doctl apps create --spec .do/app.yaml`.
3. Under the **api** component's environment variables, set `JWT_SECRET`, `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`.
4. Deploy. Your automation endpoint is `https://<your-app>.ondigitalocean.app/api/v1/transactions`.

### 2b. Frontend on Vercel instead
1. Deploy only the backend on DigitalOcean (delete the `static_sites` and `ingress` blocks from `.do/app.yaml`). Set `CORS_ORIGIN=https://your-app.vercel.app` on it.
2. In Vercel, import the repo and set **Root Directory** to `client`. Add the environment variable `VITE_API_URL=https://<your-backend>.ondigitalocean.app`. `client/vercel.json` already handles page routing.

### Backend environment variables

| Env var | Default | |
|---|---|---|
| `JWT_SECRET` | dev value | **Required in production.** Keep it stable or everyone is logged out |
| `TURSO_DATABASE_URL` | — | Turso database URL. If unset, a local SQLite file is used |
| `TURSO_AUTH_TOKEN` | — | Turso auth token |
| `CORS_ORIGIN` | allow all | Comma-separated frontend URLs (only needed when the frontend is on another domain) |
| `PORT` | `4000` (`8080` in Docker) | |
| `DB_PATH` | `server/data/tally.db` | Local SQLite file when not using Turso |

To load the demo account into Turso, run `TURSO_DATABASE_URL=… TURSO_AUTH_TOKEN=… npm run seed:demo`.

## Automation API

To authenticate, send `Authorization: Bearer tly_…` or `X-API-Key: tly_…`. Create keys under **Settings → Phone automation API**.

```http
POST /api/v1/transactions
Content-Type: application/json

{ "amount": 450, "date": "2026-10-12", "name": "Blue Tokai Coffee", "category": "food" }
```

| Field | Notes |
|---|---|
| `amount` | Required. Number or string: `450`, `"₹1,250.50"` |
| `name` | Required. Aliases: `title`, `merchant`, `description` |
| `category` | Category slug or name, case-insensitive. Common words like `bill`, `uber`, `swiggy`, `lent` and `salary` are mapped. Anything unknown goes to `other` and the response includes a warning. |
| `date` | Optional, defaults to today. Accepts `YYYY-MM-DD`, ISO timestamps, `DD/MM/YYYY`, `12 Oct 2026`, `Oct 12, 2026 at 10:30 PM`, unix time, `today`, `yesterday` |
| `type` | `expense` (default) or `income` (`credit`/`debit` also work) |
| `note`, `person` | Optional. `person` records who you lent to |

The API also has these endpoints:
- Send an array, or `{ "transactions": [...] }`, to add several at once. If any item is invalid, none are saved.
- `GET /api/v1/add?amount=…&name=…&category=…&api_key=…` is for apps that can only open a URL. It's less secure because the key ends up in the URL.
- `GET /api/v1/summary` returns this month's spend, income and budget, so a Shortcut can read it out.
- `GET /api/v1/categories` lists your category slugs.
- `GET /api/v1/ping` checks that your key works.

### iPhone (Shortcuts)

1. Add actions in this order: **Ask for Input** for the amount and the name, then **Choose from Menu** for the category, then **Get Contents of URL**.
2. Set the URL to `https://your-host/api/v1/transactions`, the method to POST, and add the header `Authorization: Bearer tly_…`.
3. Set the JSON body to `amount`, `name` and `category`, plus `date` (Current Date in ISO 8601 format).
4. To log Apple Pay purchases automatically, run the shortcut from a **Transaction** automation in the Shortcuts app.

### Android (HTTP Shortcuts / MacroDroid / Tasker)

Send an HTTP POST to the same URL with the same header and a JSON body. Trigger it from a home-screen button, or from a notification or SMS rule that pulls the amount out of a bank alert.

## Stack

- Node, Express 5 and SQLite via libSQL (Turso in production, a local file in development)
- bcrypt passwords, JWT sessions, and API keys stored as SHA-256 hashes
- React 19, Vite, React Router, Recharts and Lucide icons
- Instrument Serif and Plus Jakarta Sans fonts
