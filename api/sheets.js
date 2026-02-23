const express = require("express");
const { authenticate, getSheetsClient, escapeHtml } = require("../utils");

const router = express.Router();

/**
 * Read data from a Google Sheets range.
 *
 * @route POST /api/sheets/read
 * @security Bearer token required
 * @param {string} spreadsheetId - Google Spreadsheet ID
 * @param {string} req.body.range - A1 notation range (e.g., "Sheet1!A1:D10")
 * @returns {object} 200 - Object containing values array
 * @returns {object} 400 - Missing required fields
 * @returns {object} 401 - Unauthorized
 * @returns {object} 500 - Server error
 */
router.post("/api/sheets/read", authenticate, async (req, res) => {
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
      spreadsheetId: req.body.spreadsheetId,
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
router.post("/api/sheets/write", authenticate, async (req, res) => {
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
 * Display current month's budget data as a styled HTML table.
 *
 * Automatically detects the current month, fetches budget categories (rows 30-38)
 * and amounts from the corresponding month column in the "2026" sheet, and renders
 * them as an HTML table with preserved formatting from the Google Sheet.
 *
 * @route GET /api/sheets/budget
 * @security Bearer token required
 * @param {string} req.body.spreadsheetId - Google Spreadsheet ID,
 * @param {string} req.body.sheetName - Specific sheet name
 * @param {string} req.body.beginningRow - Label and amount beginning row for variable expenses
 * @param {string} req.body.endingRow - Label and amount ending row for variable expenses
 * @returns {string} 200 - HTML page with styled budget table
 * @returns {string} 404 - Current month column not found in spreadsheet
 * @returns {string} 500 - Server error or unable to read spreadsheet
 */
router.post("/api/sheets/budget", authenticate, async (req, res) => {
  const { spreadsheetId, sheetName, beginningRow, endingRow } = req.body;

  try {
    console.log("[sheets/budget] Reading budget data for current month");

    const sheets = getSheetsClient();

    // Read rows 1 and 2 to find the current month column
    const headerResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: spreadsheetId,
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
    // 1. Column A rows 31-39: Category labels
    // 2. Current month column rows 30-38: Budget amounts
    const dataResponse = await sheets.spreadsheets.get({
      spreadsheetId: spreadsheetId,
      ranges: [
        `${sheetName}!A${beginningRow}:A${endingRow}`,

        `${sheetName}!${monthColumnLetter}${beginningRow}:${monthColumnLetter}${endingRow}`,
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

module.exports = router;
