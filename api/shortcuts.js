const express = require("express");
const {
  authenticate,
  getSheetsClient,
  formatDateForSheet,
} = require("../utils");

const router = express.Router();

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
router.post(
  ["/api/shortcuts/write", "/api/shortcuts/write/"],
  authenticate,
  handleShortcutsWrite,
);

module.exports = router;
