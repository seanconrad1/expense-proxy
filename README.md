# Expense Proxy

A Node.js/Express backend that acts as a proxy to Google Sheets. It authenticates with a Google Service Account and provides endpoints for reading data, appending rows, and logging expense transactions from Apple Shortcuts — all secured with Bearer token authentication.

## Features

- **Google Sheets Integration** — Read and write data to any Google Sheet via the Sheets API v4.
- **Apple Shortcuts Support** — Dedicated endpoint to log transactions (description, category, amount, date) directly from an Apple Shortcut.
- **Budget Display** — View current month's budget categories and amounts in a stylized HTML table with preserved sheet formatting.
- **Bearer Token Auth** — All API endpoints (except health check) require a `Bearer` token via the `Authorization` header.
- **Date Formatting** — Automatically converts dates (ISO 8601 or natural language) to `M/D/YYYY` format for your sheet.

## Requirements

- Node.js (v16+ recommended)
- A Google Cloud Service Account with Sheets API enabled
- A `.env` file with the required environment variables

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

3. Create a `.env` file in the project root:
   ```env
   GOOGLE_SHEETS_CLIENT_EMAIL=your-service-account@project.iam.gserviceaccount.com
   GOOGLE_SHEETS_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
   SHORTCUTS_API_TOKEN=your-secret-bearer-token
   PORT=3002
   ```

## Usage

### Start the Server

```bash
npm run dev
# or
npm start
```

The server will start on `http://localhost:3002` (or the port specified in your `.env`).

---

## API Endpoints

All endpoints (except `/health`) require the following header:

```
Authorization: Bearer <your SHORTCUTS_API_TOKEN>
```

---

### `GET /health`

Health check — no authentication required.

**Example:**
```bash
curl http://localhost:3002/health
```

**Response:**
```json
{ "status": "ok" }
```

---

### `POST /api/sheets/read`

Read a range of values from a Google Sheet.

**Request Body:**
| Field           | Type   | Required | Description                        |
|-----------------|--------|----------|------------------------------------|
| `spreadsheetId` | string | Yes      | The ID of the Google Spreadsheet.  |
| `range`         | string | Yes      | The A1 notation range to read.     |

**Example:**
```bash
curl -X POST http://localhost:3002/api/sheets/read \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "spreadsheetId": "your-spreadsheet-id",
    "range": "Sheet1!A1:D10"
  }'
```

**Response:**
```json
{
  "values": [
    ["Date", "Description", "Category", "Amount"],
    ["2/1/2026", "Coffee", "Food", "5.00"]
  ]
}
```

---

### `POST /api/sheets/write`

Append rows to a Google Sheet.

**Request Body:**
| Field           | Type     | Required | Description                                              |
|-----------------|----------|----------|----------------------------------------------------------|
| `spreadsheetId` | string   | No       | The ID of the Google Spreadsheet (uses default if omitted). |
| `range`         | string   | Yes      | The A1 notation range to append to.                      |
| `values`        | array[]  | Yes      | A non-empty 2D array of values to append.                |

**Example:**
```bash
curl -X POST http://localhost:3002/api/sheets/write \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "range": "Sheet1!A:D",
    "values": [["2/18/2026", "Lunch", "Food", "12.50"]]
  }'
```

**Response:**
```json
{
  "updatedRange": "Sheet1!A2:D2",
  "updatedCells": 4,
  "updatedRows": 1,
  "updatedColumns": 4
}
```

---

### `POST /api/shortcuts/write`

Log a transaction from Apple Shortcuts. Dates are automatically formatted to `M/D/YYYY`.

**Request Body:**
| Field         | Type   | Required | Description                          |
|---------------|--------|----------|--------------------------------------|
| `description` | string | Yes      | Description of the transaction.      |
| `category`    | string | Yes      | Category (e.g., Food, Transport).    |
| `amount`      | string | Yes      | Dollar amount of the transaction.    |
| `date`        | string | Yes      | Date of the transaction (any format).|

**Example:**
```bash
curl -X POST http://localhost:3002/api/shortcuts/write \
  -H "Authorization: Bearer <token>" \
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

---

### `POST /api/sheets/budget`

Display the current month's budget data in a stylized HTML table with formatting preserved from the Google Sheet.

**Request Body:**
None required. The endpoint automatically determines the current month and fetches budget data from rows 30-38 of the "2026" sheet.

**Example:**
```bash
curl -X POST http://localhost:3002/api/sheets/budget \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json"
```

**Response:**
Returns an HTML page with a styled table showing budget categories and amounts for the current month. The table preserves all formatting from the Google Sheet including:
- Background and text colors
- Font families, sizes, bold, and italic styling
- Text alignment

**Features:**
- Automatically detects current month (e.g., FEB for February)
- Reads category labels from column A, rows 30-38
- Reads budget amounts from the current month's column, rows 30-38
- Applies cell formatting from the original sheet
- Responsive design with hover effects
- XSS protection through HTML escaping

**Error Responses:**
- `404` - Current month column not found in the spreadsheet
- `500` - Server error or unable to read from spreadsheet

---

## Deployment

Deploy to any Node.js hosting platform (Heroku, Render, Railway, AWS, etc.). Make sure to set all required environment variables on your hosting provider.

## License

This project is not licensed.
