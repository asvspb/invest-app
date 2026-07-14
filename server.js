/**
 * @fileoverview Server setup for the Investment Calculator application.
 * Serves static files and handles the root route to serve the main HTML file.
 */

const express = require("express");
const path = require("path");
const app = express();
const port = 3000;

/**
 * Middleware to serve static files from the 'public' directory.
 */
app.use(express.static(path.join(__dirname, "public")));

/**
 * Proxy endpoint for the current CBR key rate.
 * Fetches from CBR official XML API and returns JSON.
 * @name get/api/cbr-key-rate
 * @function
 */
app.get("/api/cbr-key-rate", async (req, res) => {
  try {
    const cbrRes = await fetch(
      "https://www.cbr.ru/hd_base/KeyRate/",
      { headers: { "User-Agent": "Mozilla/5.0" } }
    );
    if (!cbrRes.ok) {
      return res.status(502).json({ error: "CBR API unavailable" });
    }
    const html = await cbrRes.text();
    const match = html.match(/<td>\d{2},\d{2}<\/td>/);
    if (!match) {
      return res.status(502).json({ error: "Failed to parse CBR response" });
    }
    const rate = parseFloat(match[0].replace(/[^\d.,]/g, "").replace(",", "."));
    res.json({ rate });
  } catch (err) {
    console.error("CBR proxy error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * Route to serve the main HTML file.
 * @name get/
 * @function
 * @memberof module:server
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 */
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

/**
 * Starts the server and listens on the specified port.
 * @function
 * @memberof module:server
 * @param {number} port - The port number to listen on.
 */
app.listen(port, () => {
  console.log(`Investment calculator running at http://localhost:${port}`);
});
