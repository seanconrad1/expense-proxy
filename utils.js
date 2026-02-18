const { google } = require("googleapis");

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

module.exports = {
  getEnvVar,
  authenticate,
  getSheetsClient,
  formatDateForSheet,
  escapeHtml,
};
