/**
 * Expense Proxy Server
 * 
 * A Node.js/Express backend that proxies Google Sheets API operations,
 * providing endpoints for reading, writing, and displaying budget data
 * from Apple Shortcuts and other clients.
 */

const express = require("express");
const dotenv = require("dotenv");
const { google } = require("googleapis");

dotenv.config();

const app = express();
app.use(express.json());

const SHEETS_SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];

/**
 * Retrieves an environment variable or throws an error if not found.
 * 
 * @param {string} key - The environment variable name
 * @returns {string} The environment variable value
 * @throws {Error} If the environment variable is not set
 */
const getEnvVar = (key) => {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required env var: ${key}`);
  }
  return value;
};

/**
 * Express middleware that validates Bearer token authentication.
 * 
 * Checks the Authorization header for a Bearer token matching the
 * SHORTCUTS_API_TOKEN environment variable. This protects all API
 * endpoints (except /health) from unauthorized access.
 * 
 * @param {express.Request} req - Express request object
 * @param {express.Response} res - Express response object
 * @param {express.NextFunction} next - Express next middleware function
 * @returns {express.Response|void} 401 if unauthorized, 500 if misconfigured, or calls next()
 */
const authenticate = (req, res, next) => {
  const expectedToken = process.env.SHORTCUTS_API_TOKEN;
  if (!expectedToken) {
    return res
      .status(500)
      .json({ error: "Server misconfigured: missing SHORTCUTS_API_TOKEN." });
  }
  const authHeader = req.headers.authorization || "";
  if (authHeader !== `Bearer ${expectedToken}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  return next();
};

/**
 * Creates and returns an authenticated Google Sheets API client.
 * 
 * Initializes a JWT authentication client using service account credentials
 * from environment variables and returns a configured Sheets API v4 client.
 * 
 * @returns {object} Authenticated Google Sheets API client instance
 * @throws {Error} If required environment variables are missing
 */
const getSheetsClient = () => {
  const clientEmail = getEnvVar("GOOGLE_SHEETS_CLIENT_EMAIL");
  const privateKey = getEnvVar("GOOGLE_SHEETS_PRIVATE_KEY").replace(
    /\\n/g,
    "\n",
  );

  const auth = new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: SHEETS_SCOPES,
  });

  return google.sheets({ version: "v4", auth });
};

/**
 * Converts various date formats to M/D/YYYY format for Google Sheets.
 * 
 * Handles ISO 8601 dates (YYYY-MM-DD), natural language dates, and other
 * formats that JavaScript's Date parser can understand. Returns the original
 * string if parsing fails.
 * 
 * @param {string} rawDate - The date string to format
 * @returns {string} Date in M/D/YYYY format, or original string if parsing fails
 * 
 * @example
 * formatDateForSheet('2026-02-18') // Returns '2/18/2026'
 * formatDateForSheet('February 18, 2026') // Returns '2/18/2026'
 */
const formatDateForSheet = (rawDate) => {
  // Handle ISO 8601 format (YYYY-MM-DD) directly for precision
  if (/^\d{4}-\d{2}-\d{2}/.test(rawDate)) {
    const [year, month, day] = rawDate.split("-").map(Number);
    if (year && month && day) {
      return `${month}/${day}/${year}`;
    }
  }

  // Normalize common date formats (e.g., "Feb 18, 2026 at 3:00 PM" -> "Feb 18, 2026 3:00 PM")
  const normalized = rawDate.replace(" at ", " ");
  const parsed = new Date(normalized);

  if (!Number.isNaN(parsed.getTime())) {
    const month = parsed.getMonth() + 1;
    const day = parsed.getDate();
    const year = parsed.getFullYear();
    return `${month}/${day}/${year}`;
  }

  // Return original string if all parsing attempts fail
  return rawDate;
};

/**
 * Escapes HTML special characters to prevent XSS attacks.
 * 
 * Converts potentially dangerous characters (&, <, >, ", ') to their
 * HTML entity equivalents for safe display in HTML contexts.
 * 
 * @param {string|number} text - The text to escape
 * @returns {string} HTML-safe string
 */
const escapeHtml = (text) => {
  const map = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return String(text).replace(/[&<>"']/g, (char) => map[char]);
};

/**
 * Health check endpoint - no authentication required.
 * 
 * @route GET /health
 * @returns {object} 200 - Status object with "ok" status
 */
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

/**
 * Read data from a Google Sheets range.
 * 
 * @route POST /api/sheets/read
 * @security Bearer token required
 * @param {string} req.body.spreadsheetId - Google Spreadsheet ID
 * @param {string} req.body.range - A1 notation range (e.g., "Sheet1!A1:D10")
 * @returns {object} 200 - Object containing values array
 * @returns {object} 400 - Missing required fields
 * @returns {object} 401 - Unauthorized
 * @returns {object} 500 - Server error
 */
app.post("/api/sheets/read", authenticate, async (req, res) => {
  try {
    const spreadsheetId = String(req.body?.spreadsheetId || "").trim();
    const range = String(req.body?.range || "").trim();

    if (!spreadsheetId || !range) {
      return res
        .status(400)
        .json({ error: "spreadsheetId and range are required." });
    }

    const sheets = getSheetsClient();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
    });

    return res.json({ values: response.data.values ?? [] });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected server error.";
    return res.status(500).json({ error: message });
  }
});

/**
 * Append rows to a Google Sheet.
 * 
 * @route POST /api/sheets/write
 * @security Bearer token required
 * @param {string} req.body.spreadsheetId - Google Spreadsheet ID (optional, uses default if omitted)
 * @param {string} req.body.range - A1 notation range to append to (e.g., "Sheet1!A:D")
 * @param {Array<Array>} req.body.values - 2D array of values to append
 * @returns {object} 200 - Update details (updatedRange, updatedCells, updatedRows, updatedColumns)
 * @returns {object} 400 - Missing or invalid required fields
 * @returns {object} 401 - Unauthorized
 * @returns {object} 500 - Server error
 */
app.post("/api/sheets/write", authenticate, async (req, res) => {
  try {
    const range = String(req.body?.range || "").trim();
    const values = req.body?.values;
    const defaultSpreadsheetId = "1PRbVPgAe_EIfxTcJH71T0NJeIugfwf99L8cUWxe1gFI";
    const spreadsheetId =
      String(req.body?.spreadsheetId || "").trim() || defaultSpreadsheetId;

    if (!spreadsheetId || !range) {
      return res
        .status(400)
        .json({ error: "spreadsheetId and range are required." });
    }

    if (!Array.isArray(values) || values.length === 0) {
      return res
        .status(400)
        .json({ error: "values must be a non-empty 2D array." });
    }

    const sheets = getSheetsClient();
    const response = await sheets.spreadsheets.values.append({
      spreadsheetId,
      range,
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: {
        values,
      },
    });

    const updates = response.data.updates;

    return res.json({
      updatedRange: updates?.updatedRange,
      updatedCells: updates?.updatedCells,
      updatedRows: updates?.updatedRows,
      updatedColumns: updates?.updatedColumns,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected server error.";
    return res.status(500).json({ error: message });
  }
});

/**
 * Handles transaction logging from Apple Shortcuts.
 * 
 * Accepts transaction data (description, category, amount, date) from Apple Shortcuts,
 * formats the date to M/D/YYYY, and appends it to the Transactions-2026 sheet.
 * 
 * @param {express.Request} req - Express request object with transaction data
 * @param {express.Response} res - Express response object
 * @returns {Promise<express.Response>} Update details or error
 */
const handleShortcutsWrite = async (req, res) => {
  try {
    const description = String(req.body?.description || "").trim();
    const category = String(req.body?.category || "").trim();
    const amount = String(req.body?.amount || "").trim();
    const dateInput = String(req.body?.date || "").trim();

    console.log("[shortcuts/write] Incoming payload", {
      description,
      category,
      amount,
      dateInput,
    });

    if (!description || !category || !amount || !dateInput) {
      return res.status(400).json({
        error: "description, category, amount, and date are required.",
      });
    }

    const spreadsheetId = "1PRbVPgAe_EIfxTcJH71T0NJeIugfwf99L8cUWxe1gFI";
    const range = "Transactions-2026!A:D";

    const formattedDate = formatDateForSheet(dateInput);
    const values = [[formattedDate, description, category, amount]];

    const sheets = getSheetsClient();
    const response = await sheets.spreadsheets.values.append({
      spreadsheetId,
      range,
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: {
        values,
      },
    });

    const updates = response.data.updates;

    console.log("[shortcuts/write] Sheets append response", {
      updatedRange: updates?.updatedRange,
      updatedCells: updates?.updatedCells,
      updatedRows: updates?.updatedRows,
      updatedColumns: updates?.updatedColumns,
    });

    return res.json({
      updatedRange: updates?.updatedRange,
      updatedCells: updates?.updatedCells,
      updatedRows: updates?.updatedRows,
      updatedColumns: updates?.updatedColumns,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected server error.";
    console.error("[shortcuts/write] Error", message);
    return res.status(500).json({ error: message });
  }
};

/**
 * Log a transaction from Apple Shortcuts.
 * 
 * @route POST /api/shortcuts/write
 * @route POST /api/shortcuts/write/
 * @security Bearer token required
 * @param {string} req.body.description - Transaction description
 * @param {string} req.body.category - Transaction category (e.g., "Food", "Transport")
 * @param {string} req.body.amount - Transaction amount as string
 * @param {string} req.body.date - Transaction date (any format, will be converted to M/D/YYYY)
 * @returns {object} 200 - Update details (updatedRange, updatedCells, updatedRows, updatedColumns)
 * @returns {object} 400 - Missing required fields
 * @returns {object} 401 - Unauthorized
 * @returns {object} 500 - Server error
 */
app.post(
  ["/api/shortcuts/write", "/api/shortcuts/write/"],
  authenticate,
  handleShortcutsWrite,
);

/**
 * Display current month's budget data as a styled HTML table.
 * 
 * Automatically detects the current month, fetches budget categories (rows 30-38)
 * and amounts from the corresponding month column in the "2026" sheet, and renders
 * them as an HTML table with preserved formatting from the Google Sheet.
 * 
 * @route GET /api/sheets/budget
 * @security Bearer token required
 * @returns {string} 200 - HTML page with styled budget table
 * @returns {string} 404 - Current month column not found in spreadsheet
 * @returns {string} 500 - Server error or unable to read spreadsheet
 */
app.get("/api/sheets/budget", authenticate, async (req, res) => {
  try {
    const spreadsheetId = "1PRbVPgAe_EIfxTcJH71T0NJeIugfwf99L8cUWxe1gFI";
    const sheetName = "2026";

    console.log("[sheets/budget] Reading budget data for current month");

    const sheets = getSheetsClient();

    // Read rows 1 and 2 to find the current month column
    const headerResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!A1:Z2`,
    });

    const headerRows = headerResponse.data.values ?? [];
    if (headerRows.length < 2) {
      return res.status(500).json({
        error: "Unable to read header rows from spreadsheet.",
      });
    }

    const monthNamesRow = headerRows[0] ?? []; // Row 1: Month names (JAN, FEB, MAR, etc.)
    const datesRow = headerRows[1] ?? []; // Row 2: Dates (e.g., "2/1/2026")

    // Determine current month
    const now = new Date();
    const currentMonthIndex = now.getMonth(); // 0-11
    const currentYear = now.getFullYear();
    const monthNames = [
      "JAN",
      "FEB",
      "MAR",
      "APR",
      "MAY",
      "JUN",
      "JUL",
      "AUG",
      "SEP",
      "OCT",
      "NOV",
      "DEC",
    ];
    const currentMonthName = monthNames[currentMonthIndex];

    console.log("[sheets/budget] Current month:", currentMonthName);

    // Find column index for current month by searching both rows
    let columnIndex = -1;

    // Strategy 1: Match by month name in row 1 (e.g., "FEB")
    for (let i = 0; i < monthNamesRow.length; i++) {
      const cellValue = String(monthNamesRow[i] || "")
        .trim()
        .toUpperCase();
      if (cellValue === currentMonthName) {
        columnIndex = i;
        break;
      }
    }

    // Strategy 2: If not found, match by date in row 2 (e.g., "2/1/2026")
    if (columnIndex === -1) {
      for (let i = 0; i < datesRow.length; i++) {
        const cellValue = String(datesRow[i] || "").trim();
        // Parse date like "2/1/2026"
        const dateParts = cellValue.split("/");
        if (dateParts.length === 3) {
          const month = parseInt(dateParts[0], 10);
          const year = parseInt(dateParts[2], 10);
          // Check if month matches (month is 1-12 in the date string)
          if (month === currentMonthIndex + 1 && year === currentYear) {
            columnIndex = i;
            break;
          }
        }
      }
    }

    if (columnIndex === -1) {
      return res.status(404).send(`
        <!DOCTYPE html>
        <html>
          <head><title>Budget Data - Error</title></head>
          <body>
            <h1>Error</h1>
            <p>Could not find column for current month: ${escapeHtml(currentMonthName)}</p>
          </body>
        </html>
      `);
    }

    // Convert column index to letter notation (A=0, B=1, etc.)
    const getColumnLetter = (index) => {
      let letter = "";
      while (index >= 0) {
        letter = String.fromCharCode((index % 26) + 65) + letter;
        index = Math.floor(index / 26) - 1;
      }
      return letter;
    };

    const monthColumnLetter = getColumnLetter(columnIndex);

    console.log(
      `[sheets/budget] Found month column at index ${columnIndex} (${monthColumnLetter})`,
    );

    // Get sheet ID for the "2026" sheet (needed for formatting data)
    const spreadsheetMetadata = await sheets.spreadsheets.get({
      spreadsheetId,
    });
    const sheet2026 = spreadsheetMetadata.data.sheets?.find(
      (s) => s.properties?.title === sheetName,
    );
    const sheetId = sheet2026?.properties?.sheetId ?? 0;

    // Read data with formatting from two ranges:
    // 1. Column A rows 30-38: Category labels
    // 2. Current month column rows 30-38: Budget amounts
    const dataResponse = await sheets.spreadsheets.get({
      spreadsheetId,
      ranges: [
        `${sheetName}!A30:A38`,
        `${sheetName}!${monthColumnLetter}30:${monthColumnLetter}38`,
      ],
      includeGridData: true,
    });

    const categoryRows =
      dataResponse.data.sheets?.[0]?.data?.[0]?.rowData ?? [];
    const amountRows = dataResponse.data.sheets?.[0]?.data?.[1]?.rowData ?? [];

    // Helper function to convert RGB color to CSS
    const rgbToCss = (color) => {
      if (!color) return "";
      const r = Math.round((color.red ?? 0) * 255);
      const g = Math.round((color.green ?? 0) * 255);
      const b = Math.round((color.blue ?? 0) * 255);
      return `rgb(${r}, ${g}, ${b})`;
    };

    // Helper function to extract cell styles from Google Sheets formatting
    const getCellStyle = (cell) => {
      const format = cell?.effectiveFormat;
      if (!format) return "";

      const styles = [];

      // Apply background color (with custom dark theme override for white cells)
      if (format.backgroundColor) {
        const bgColor = rgbToCss(format.backgroundColor);
        if (bgColor === "rgb(255, 255, 255)") {
          styles.push(`background-color: #282a36`);
        } else if (bgColor) styles.push(`background-color: #ff5555`);
      }

      // Apply text formatting
      if (format.textFormat) {
        const textFormat = format.textFormat;

        // Apply text color (with custom override for dark theme)
        if (textFormat.foregroundColor) {
          const color = rgbToCss(textFormat.foregroundColor);
          const bgColor = rgbToCss(format.backgroundColor);
          if (bgColor === "rgb(255, 255, 255)") {
            styles.push(`color: #FFFFFF`);
          } else if (color) styles.push(`color: ${color}`);
        }

        if (textFormat.fontSize) {
          styles.push(`font-size: ${textFormat.fontSize}pt`);
        }

        if (textFormat.bold) {
          styles.push("font-weight: bold");
        }

        if (textFormat.italic) {
          styles.push("font-style: italic");
        }

        if (textFormat.fontFamily) {
          styles.push(`font-family: "${textFormat.fontFamily}"`);
        }
      }

      // Apply horizontal alignment
      if (format.horizontalAlignment) {
        const alignment = format.horizontalAlignment.toLowerCase();
        if (alignment !== "left") {
          styles.push(`text-align: ${alignment}`);
        }
      }

      // Apply vertical alignment
      if (format.verticalAlignment) {
        const vAlign = format.verticalAlignment.toLowerCase();
        if (vAlign === "middle") {
          styles.push("vertical-align: middle");
        } else if (vAlign !== "bottom") {
          styles.push(`vertical-align: ${vAlign}`);
        }
      }

      return styles.join("; ");
    };

    // Build HTML table
    let htmlRows = "";
    const maxRows = Math.max(categoryRows.length, amountRows.length);

    for (let i = 0; i < maxRows; i++) {
      const categoryCell = categoryRows[i]?.values?.[0];
      const amountCell = amountRows[i]?.values?.[0];

      const categoryValue = categoryCell?.formattedValue ?? "";
      const amountValue = amountCell?.formattedValue ?? "";

      if (!categoryValue) continue;

      const categoryStyle = getCellStyle(categoryCell);
      const amountStyle = getCellStyle(amountCell);

      htmlRows += `
        <tr>
          <td style="${categoryStyle}">${escapeHtml(categoryValue)}</td>
          <td style="${amountStyle}">${escapeHtml(amountValue)}</td>
        </tr>`;
    }

    console.log("[sheets/budget] Successfully read budget data");

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Budget Data - ${escapeHtml(currentMonthName)}</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              margin: 20px;
              background-color: #282a36;
            }
            .container {
              max-width: 800px;
              margin: 0 auto;
              background-color: #282a36;
              padding: 20px;
              border-radius: 8px;
              box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            }
            h1 {
              color: white;
              margin-top: 0;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 20px;
            }
            td {
              padding: 8px 12px;
              border: 1px solid #ddd;
            }
            tr:hover td {
              filter: brightness(0.95);
            }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>Budget for ${escapeHtml(currentMonthName)}</h1>
            <table>
              <thead>
                <tr>
                  <th style="text-align: left; padding: 8px 12px; border: 1px solid #ddd; background-color: #f0f0f0;">Category</th>
                  <th style="text-align: left; padding: 8px 12px; border: 1px solid #ddd; background-color: #f0f0f0;">Amount</th>
                </tr>
              </thead>
              <tbody>
                ${htmlRows}
              </tbody>
            </table>
          </div>
        </body>
      </html>
    `;

    return res.send(html);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected server error.";
    console.error("[sheets/budget] Error", message);
    return res.status(500).send(`
      <!DOCTYPE html>
      <html>
        <head><title>Budget Data - Error</title></head>
        <body>
          <h1>Error</h1>
          <p>${escapeHtml(message)}</p>
        </body>
      </html>
    `);
  }
});

const port = Number(process.env.PORT) || 3002;
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
