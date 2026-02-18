const express = require("express");
const dotenv = require("dotenv");
const { google } = require("googleapis");

dotenv.config();

const app = express();
app.use(express.json());

const SHEETS_SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];

const getEnvVar = (key) => {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required env var: ${key}`);
  }
  return value;
};

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

const formatDateForSheet = (rawDate) => {
  if (/^\d{4}-\d{2}-\d{2}/.test(rawDate)) {
    const [year, month, day] = rawDate.split("-").map(Number);
    if (year && month && day) {
      return `${month}/${day}/${year}`;
    }
  }

  const normalized = rawDate.replace(" at ", " ");
  const parsed = new Date(normalized);

  if (!Number.isNaN(parsed.getTime())) {
    const month = parsed.getMonth() + 1;
    const day = parsed.getDate();
    const year = parsed.getFullYear();
    return `${month}/${day}/${year}`;
  }

  return rawDate;
};

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

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

app.post(
  ["/api/shortcuts/write", "/api/shortcuts/write/"],
  authenticate,
  handleShortcutsWrite,
);

app.post("/api/sheets/budget", authenticate, async (req, res) => {
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

    const monthNamesRow = headerRows[0] ?? [];
    const datesRow = headerRows[1] ?? [];

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

    // Find column index for current month
    let columnIndex = -1;

    // First try to match by month name in row 1
    for (let i = 0; i < monthNamesRow.length; i++) {
      const cellValue = String(monthNamesRow[i] || "")
        .trim()
        .toUpperCase();
      if (cellValue === currentMonthName) {
        columnIndex = i;
        break;
      }
    }

    // If not found, try to match by date in row 2
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
      return res.status(404).json({
        error: `Could not find column for current month: ${currentMonthName}`,
      });
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

    // Read column A rows 30-38 for category labels
    const categoriesResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!A30:A38`,
    });

    const categoriesData = categoriesResponse.data.values ?? [];
    const categories = categoriesData.map((row) => String(row[0] || "").trim());

    // Read the month column rows 30-38 for amounts
    const amountsResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!${monthColumnLetter}30:${monthColumnLetter}38`,
    });

    const amountsData = amountsResponse.data.values ?? [];
    const amounts = amountsData.map((row) => String(row[0] || "").trim());

    // Combine categories and amounts
    const data = [];
    for (let i = 0; i < categories.length; i++) {
      const category = categories[i];
      const amount = amounts[i] || "";
      if (category) {
        data.push({
          category,
          amount,
        });
      }
    }

    console.log("[sheets/budget] Successfully read budget data:", data);

    return res.json({
      month: currentMonthName,
      data,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected server error.";
    console.error("[sheets/budget] Error", message);
    return res.status(500).json({ error: message });
  }
});

const port = Number(process.env.PORT) || 3002;
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
