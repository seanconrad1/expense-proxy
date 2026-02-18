# Expense Proxy

A Node.js/Express backend that acts as a proxy to Google Sheets. It authenticates with a Google Service Account and provides endpoints for reading data, appending rows, and logging expense transactions from Apple Shortcuts — all secured with Bearer token authentication.

## Table of Contents

- [Features](#features)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Configuration](#configuration)
- [Usage](#usage)
- [API Endpoints](#api-endpoints)
  - [GET /health](#get-health)
  - [POST /api/sheets/read](#post-apisheetsread)
  - [POST /api/sheets/write](#post-apisheetswrite)
  - [POST /api/shortcuts/write](#post-apishortcutswrite)
  - [GET /api/sheets/budget](#get-apisheetsbudget)
- [Deployment](#deployment)
- [Security Best Practices](#security-best-practices)
- [Troubleshooting](#troubleshooting)
- [License](#license)

## Features

- **Google Sheets Integration** — Read and write data to any Google Sheet via the Sheets API v4.
- **Apple Shortcuts Support** — Dedicated endpoint to log transactions (description, category, amount, date) directly from an Apple Shortcut.
- **Budget Display** — View current month's budget categories and amounts in a stylized HTML table with preserved sheet formatting.
- **Bearer Token Auth** — All API endpoints (except health check) require a `Bearer` token via the `Authorization` header.
- **Date Formatting** — Automatically converts dates (ISO 8601 or natural language) to `M/D/YYYY` format for your sheet.

## Prerequisites

Before installing and running this application, ensure you have:

- **Node.js** v16 or higher ([download here](https://nodejs.org/))
- **npm** (comes with Node.js)
- **A Google Cloud Service Account** with Sheets API enabled
  - Visit the [Google Cloud Console](https://console.cloud.google.com/)
  - Create or select a project
  - Enable the Google Sheets API
  - Create a service account and download the JSON key file
  - Share your Google Sheet with the service account email address
- **A secure Bearer token** for API authentication (generate a random string, e.g., using `openssl rand -hex 32`)

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/seanconrad1/expense-proxy.git
   cd expense-proxy
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file in the project root with your credentials:
   ```env
   GOOGLE_SHEETS_CLIENT_EMAIL=your-service-account@project.iam.gserviceaccount.com
   GOOGLE_SHEETS_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
   SHORTCUTS_API_TOKEN=your-secret-bearer-token
   PORT=3002
   ```

   > **Note:** The `GOOGLE_SHEETS_PRIVATE_KEY` should include the full private key from your service account JSON file, including the `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----` markers. Keep the `\n` characters as shown.

## Configuration

### Environment Variables

| Variable                     | Required | Description                                                                 |
|------------------------------|----------|-----------------------------------------------------------------------------|
| `GOOGLE_SHEETS_CLIENT_EMAIL` | Yes      | Email address of your Google Cloud service account                         |
| `GOOGLE_SHEETS_PRIVATE_KEY`  | Yes      | Private key from service account JSON (include `\n` line breaks as shown)  |
| `SHORTCUTS_API_TOKEN`        | Yes      | Secret token for Bearer authentication (generate a secure random string)   |
| `PORT`                       | No       | Port number for the server (default: 3002)                                 |

### Google Sheets Setup

1. **Create a Google Sheet** for your expenses or use an existing one
2. **Share the sheet** with your service account email (found in `GOOGLE_SHEETS_CLIENT_EMAIL`)
3. **Grant Editor access** to the service account
4. **Note the Spreadsheet ID** from the URL (e.g., `https://docs.google.com/spreadsheets/d/{SPREADSHEET_ID}/edit`)

## Usage

### Start the Server

```bash
npm run dev
# or
npm start
```

The server will start on `http://localhost:3002` (or the port specified in your `.env`).

> **Tip:** Use `npm run dev` during development for a descriptive name. Both commands run the same server.

---

## API Endpoints

All endpoints (except `/health`) require the following header:

```http
Authorization: Bearer <your-SHORTCUTS_API_TOKEN>
```

---

### GET /health

Health check endpoint — no authentication required.

**Description:** Returns a simple status message to verify the server is running.

**Request:**
```bash
curl http://localhost:3002/health
```

**Response:**
```json
{
  "status": "ok"
}
```

**Status Codes:**
- `200` - Server is healthy

---

### POST /api/sheets/read

Read a range of values from a Google Sheet.

**Description:** Retrieves data from a specified range in any Google Spreadsheet that your service account has access to.

**Request Body:**

| Field           | Type   | Required | Description                                  |
|-----------------|--------|----------|----------------------------------------------|
| `spreadsheetId` | string | Yes      | The ID of the Google Spreadsheet             |
| `range`         | string | Yes      | The A1 notation range to read (e.g., "Sheet1!A1:D10") |

**Example:**
```bash
curl -X POST http://localhost:3002/api/sheets/read \
  -H "Authorization: Bearer <your-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "spreadsheetId": "1PRbVPgAe_EIfxTcJH71T0NJeIugfwf99L8cUWxe1gFI",
    "range": "Sheet1!A1:D10"
  }'
```

**Response:**
```json
{
  "values": [
    ["Date", "Description", "Category", "Amount"],
    ["2/1/2026", "Coffee", "Food", "5.00"],
    ["2/2/2026", "Bus fare", "Transport", "2.50"]
  ]
}
```

**Status Codes:**
- `200` - Success, returns data
- `400` - Missing required fields (`spreadsheetId` or `range`)
- `401` - Unauthorized (invalid or missing Bearer token)
- `500` - Server error (e.g., Google Sheets API error, invalid credentials)

---

### POST /api/sheets/write

Append rows to a Google Sheet.

**Description:** Adds new rows to the end of a specified range in a Google Spreadsheet. Uses `INSERT_ROWS` mode to automatically add new rows.

**Request Body:**

| Field           | Type          | Required | Description                                              |
|-----------------|---------------|----------|----------------------------------------------------------|
| `spreadsheetId` | string        | No       | The ID of the Google Spreadsheet (uses default if omitted) |
| `range`         | string        | Yes      | The A1 notation range to append to (e.g., "Sheet1!A:D") |
| `values`        | Array<Array>  | Yes      | A non-empty 2D array of values to append                 |

**Example:**
```bash
curl -X POST http://localhost:3002/api/sheets/write \
  -H "Authorization: Bearer <your-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "range": "Sheet1!A:D",
    "values": [
      ["2/18/2026", "Lunch", "Food", "12.50"],
      ["2/18/2026", "Coffee", "Food", "4.00"]
    ]
  }'
```

**Response:**
```json
{
  "updatedRange": "Sheet1!A2:D3",
  "updatedCells": 8,
  "updatedRows": 2,
  "updatedColumns": 4
}
```

**Status Codes:**
- `200` - Success, rows appended
- `400` - Missing or invalid required fields
- `401` - Unauthorized (invalid or missing Bearer token)
- `500` - Server error (e.g., Google Sheets API error)

---

### POST /api/shortcuts/write

Log a transaction from Apple Shortcuts.

**Description:** Specialized endpoint for Apple Shortcuts that accepts transaction data and automatically formats dates to `M/D/YYYY` before appending to the "Transactions-2026" sheet.

**Request Body:**

| Field         | Type   | Required | Description                                        |
|---------------|--------|----------|----------------------------------------------------|
| `description` | string | Yes      | Description of the transaction (e.g., "Grocery shopping") |
| `category`    | string | Yes      | Category (e.g., "Food", "Transport", "Entertainment") |
| `amount`      | string | Yes      | Dollar amount of the transaction (e.g., "45.00")   |
| `date`        | string | Yes      | Date in any format (automatically converted to M/D/YYYY) |

**Supported Date Formats:**
- ISO 8601: `2026-02-18` or `2026-02-18T14:30:00`
- Natural language: `February 18, 2026`
- Various other formats parseable by JavaScript `Date` constructor

**Example:**
```bash
curl -X POST http://localhost:3002/api/shortcuts/write \
  -H "Authorization: Bearer <your-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "description": "Grocery run",
    "category": "Food",
    "amount": "45.00",
    "date": "2026-02-18"
  }'
```

**Response:**
```json
{
  "updatedRange": "Transactions-2026!A2:D2",
  "updatedCells": 4,
  "updatedRows": 1,
  "updatedColumns": 4
}
```

**Status Codes:**
- `200` - Success, transaction logged
- `400` - Missing required fields (description, category, amount, or date)
- `401` - Unauthorized (invalid or missing Bearer token)
- `500` - Server error (e.g., Google Sheets API error)

**Apple Shortcuts Setup:**
1. Create a new Shortcut in the Shortcuts app
2. Add a "Get Contents of URL" action
3. Set Method to `POST`
4. Set URL to your server endpoint: `https://your-domain.com/api/shortcuts/write`
5. Add Headers:
   - `Authorization: Bearer YOUR_TOKEN`
   - `Content-Type: application/json`
6. Set Request Body to JSON with your transaction data

---

### GET /api/sheets/budget

Display current month's budget data as a styled HTML table.

**Description:** Automatically detects the current month, fetches budget data from rows 30-38 of the "2026" sheet, and renders it as a styled HTML page with preserved formatting from Google Sheets.

**Request:**

No request body required. The endpoint automatically:
- Detects the current month (e.g., FEB for February)
- Finds the corresponding column in the sheet
- Reads category labels from column A, rows 30-38
- Reads budget amounts from the current month's column, rows 30-38

**Example:**
```bash
curl -X POST http://localhost:3002/api/sheets/budget \
  -H "Authorization: Bearer <your-token>" \
  -H "Content-Type: application/json"
```

**Response:**

Returns an HTML page with a styled table showing budget categories and amounts. The table includes:
- Background and text colors from the original sheet
- Font families, sizes, bold, and italic styling
- Text alignment (left, center, right)
- Responsive design with hover effects
- Dark theme styling

**Features:**
- **Automatic Month Detection** - No configuration needed, always shows current month
- **Format Preservation** - Maintains all cell formatting from Google Sheets
- **XSS Protection** - All user content is HTML-escaped
- **Responsive Design** - Works on desktop and mobile devices

**Status Codes:**
- `200` - Success, returns HTML page
- `401` - Unauthorized (invalid or missing Bearer token)
- `404` - Current month column not found in spreadsheet
- `500` - Server error or unable to read from spreadsheet

**Sheet Structure Requirements:**
- Row 1: Month names (JAN, FEB, MAR, etc.)
- Row 2: Dates (e.g., "2/1/2026", "3/1/2026", etc.)
- Rows 30-38, Column A: Budget category labels
- Rows 30-38, Current month column: Budget amounts

---

## Deployment

This application can be deployed to any Node.js hosting platform. Here are setup instructions for common providers:

### General Requirements

- Set all environment variables on your hosting platform:
  - `GOOGLE_SHEETS_CLIENT_EMAIL`
  - `GOOGLE_SHEETS_PRIVATE_KEY`
  - `SHORTCUTS_API_TOKEN`
  - `PORT` (if required by your platform)
- Ensure your hosting platform supports Node.js v16+
- Configure the start command: `npm start` or `node server.js`

### Popular Hosting Options

- **[Render](https://render.com/)** - Free tier available, easy setup
- **[Railway](https://railway.app/)** - Simple deployment with GitHub integration
- **[Heroku](https://www.heroku.com/)** - Traditional PaaS with good documentation
- **[AWS Elastic Beanstalk](https://aws.amazon.com/elasticbeanstalk/)** - Scalable enterprise option
- **[DigitalOcean App Platform](https://www.digitalocean.com/products/app-platform)** - Straightforward managed hosting

> **Security Note:** Never commit your `.env` file or credentials to version control. Always set environment variables through your hosting platform's dashboard or CLI.

---

## Security Best Practices

1. **Generate a Strong Bearer Token**
   ```bash
   # Generate a secure random token (32 bytes)
   openssl rand -hex 32
   ```

2. **Rotate Credentials Regularly**
   - Change your `SHORTCUTS_API_TOKEN` periodically
   - Rotate Google service account keys according to your security policy

3. **Use HTTPS in Production**
   - Always deploy behind HTTPS to protect your Bearer tokens in transit
   - Most hosting platforms provide free SSL/TLS certificates

4. **Limit Service Account Permissions**
   - Only share necessary Google Sheets with your service account
   - Use Google Drive's "Can edit" permission (never "Owner")

5. **Monitor API Usage**
   - Check server logs regularly for unusual activity
   - Set up monitoring/alerting for unauthorized access attempts

6. **Environment Variables**
   - Never commit `.env` files to version control
   - Use `.gitignore` to exclude sensitive files (already configured in this repo)

---

## Troubleshooting

### Authentication Errors

**Problem:** `401 Unauthorized` response

**Solutions:**
- Verify your `SHORTCUTS_API_TOKEN` matches in both `.env` and your API client
- Ensure the `Authorization` header is formatted correctly: `Bearer YOUR_TOKEN`
- Check for extra whitespace in your token

---

**Problem:** `Server misconfigured: missing SHORTCUTS_API_TOKEN`

**Solutions:**
- Verify your `.env` file exists in the project root
- Check that `SHORTCUTS_API_TOKEN` is set in `.env`
- Restart the server after modifying `.env`

---

### Google Sheets Errors

**Problem:** `Unable to read from spreadsheet` or `403 Forbidden`

**Solutions:**
- Verify the service account email has access to the sheet
- Ensure the sheet is shared with "Editor" permissions
- Check that the `spreadsheetId` is correct
- Verify the `GOOGLE_SHEETS_PRIVATE_KEY` includes all line breaks (`\n`)

---

**Problem:** `Missing required env var: GOOGLE_SHEETS_CLIENT_EMAIL`

**Solutions:**
- Check that all required environment variables are set in `.env`
- Verify there are no typos in variable names
- Ensure the `.env` file is in the project root directory

---

### Date Formatting Issues

**Problem:** Dates not formatting correctly

**Solutions:**
- Verify date is in a parseable format (ISO 8601 recommended: `YYYY-MM-DD`)
- Check server logs for date parsing errors
- Test with a simple date like `2026-02-18` first

---

### Server Won't Start

**Problem:** `Port already in use` or `EADDRINUSE`

**Solutions:**
- Change the `PORT` value in your `.env` file
- Check for other processes using the port: `lsof -i :3002` (macOS/Linux)
- Kill the conflicting process or choose a different port

---

**Problem:** `Cannot find module` errors

**Solutions:**
- Run `npm install` to install dependencies
- Delete `node_modules` and `package-lock.json`, then run `npm install` again
- Ensure you're using Node.js v16 or higher: `node --version`

---

## License

This project is unlicensed and provided as-is without any warranty. You are free to use, modify, and distribute this code for any purpose, but the author provides no guarantees or support.
