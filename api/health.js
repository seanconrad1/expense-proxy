const express = require("express");

const router = express.Router();

/**
 * Health check endpoint - no authentication required.
 *
 * @route GET /health
 * @returns {object} 200 - Status object with "ok" status
 */
router.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

module.exports = router;
