# Expense Proxy: A Google Sheets API Integration Backend

This is a Node.js/Express backend that simplifies accessing and manipulating Google Sheets data. It is designed to work with a Google Service Account and features endpoints for reading ranges, appending rows, and logging data via Apple Shortcuts with Bearer token authentication.

## Features
- Authenticates using a Google Service Account (`credentials.json` and `.env` file required).
- Supports the following:
  - **Read Ranges**: Fetch data from specified sheets ranges.
  - **Append Rows**: Add new data rows dynamically.
  - **Apple Shortcuts Support**: Accept transactions and log them directly to Google Sheets.

## Requirements
- Node.js (v16+ recommended)
- Google Service Account JSON credentials
- `.env` file for configuration

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

3. Set up the `.env` file:
   ```env
   SHEETS_ID=<Your Google Sheets ID>
   CLIENT_EMAIL=<Service Account Email>
   PRIVATE_KEY=<Your Private Account Key>
   ```
   *(Visit Google Cloud Console to obtain these credentials).*

## Usage

### Development

Run the development server:
```bash
npm run dev
```

Visit `http://localhost:3000` to access the app.

### Endpoints
| Method | Endpoint          | Description             |
|--------|-------------------|-------------------------|
| GET    | `/read-range`     | Fetch data from Sheets. |
| POST   | `/append-row`     | Add new row to Sheets.  |
| POST   | `/log-shortcut`   | Log Apple Shortcuts data.| 

## Deployment
Use services like Heroku, Vercel, or AWS to host your backend. Ensure environment variables are securely configured on the deployment platform.

## License
This project is not licensed.