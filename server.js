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

const htmlError = (res, status, message) =>
  res
    .status(status)
    .type("html")
    .send(`<!DOCTYPE html><html><body><h1>Error ${status}</h1><p>${message}</p></body></html>`);

const authenticate = (req, res, next) => {
  const expectedToken = process.env.SHORTCUTS_API_TOKEN;
  if (!expectedToken) {
    return htmlError(res, 500, "Server misconfigured: missing SHORTCUTS_API_TOKEN.");
  }
  const authHeader = req.headers.authorization || "";
  if (authHeader !== `Bearer ${expectedToken}`) {
    return htmlError(res, 401, "Unauthorized");
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
      return htmlError(res, 400, "spreadsheetId and range are required.");
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
    return htmlError(res, 500, message);
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
      return htmlError(res, 400, "spreadsheetId and range are required.");
    }

    if (!Array.isArray(values) || values.length === 0) {
      return htmlError(res, 400, "values must be a non-empty 2D array.");
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
    return htmlError(res, 500, message);
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
      return htmlError(res, 400, "description, category, amount, and date are required.");
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
    return htmlError(res, 500, message);
  }
};

app.post(
  ["/api/shortcuts/write", "/api/shortcuts/write/"],
  authenticate,
  handleShortcutsWrite,
);

const port = Number(process.env.PORT) || 3002;
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
