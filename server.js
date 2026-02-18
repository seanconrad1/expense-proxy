/**
 * Expense Proxy Server
 *
 * A Node.js/Express backend that proxies Google Sheets API operations,
 * providing endpoints for reading, writing, and displaying budget data
 * from Apple Shortcuts and other clients.
 */

const express = require("express");
const dotenv = require("dotenv");

dotenv.config();

const app = express();
app.use(express.json());

const healthRoutes = require("./api/health");
const sheetsRoutes = require("./api/sheets");
const shortcutsRoutes = require("./api/shortcuts");

app.use(healthRoutes);
app.use(sheetsRoutes);
app.use(shortcutsRoutes);

const port = Number(process.env.PORT) || 3002;
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
