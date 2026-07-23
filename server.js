/**
 * @fileoverview Server setup for the Investment Calculator application.
 * Serves static files and handles the root route to serve the main HTML file.
 */

const express = require("express");
const path = require("path");
const app = express();
const DEFAULT_PORT = 7777;
const port = Number(process.env.PORT) || DEFAULT_PORT;

let cachedKeyRate = 21;
let ratesCache = { data: null, ts: 0 };
let metalsCache = { data: null, ts: 0 };
const RATES_TTL_MS = 60 * 60 * 1000;
const METALS_TTL_MS = 60 * 60 * 1000;
const CBR_TIMEOUT_MS = 5_000;
const CBR_UA = 'Mozilla/5.0';
const METAL_CODES = { 1: 'Au', 2: 'Ag', 3: 'Pt', 4: 'Pd' };

function parseCbrKeyRateHtml(html) {
  const match = html.match(/<td>\d{2},\d{2}<\/td>/);
  if (!match) return null;
  return parseFloat(match[0].replace(/[^\d.,]/g, "").replace(",", "."));
}

async function loadCbrKeyRate() {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CBR_TIMEOUT_MS);

    try {
      const cbrRes = await fetch("https://www.cbr.ru/hd_base/KeyRate/", {
        signal: controller.signal,
        headers: { "User-Agent": CBR_UA },
      });
      if (!cbrRes.ok) return;
      const html = await cbrRes.text();
      const rate = parseCbrKeyRateHtml(html);
      if (rate !== null) {
        cachedKeyRate = rate;
        console.log(`CBR key rate loaded: ${cachedKeyRate}%`);
      }
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    console.error("Failed to load CBR key rate:", err.message);
  }
}

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
    if (req.query.refresh === "true") {
      await loadCbrKeyRate();
    }
    res.json({ rate: cachedKeyRate });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

function parseCbrXml(xml, dateStr) {
  const charCodeRe = /<CharCode>(\w+)<\/CharCode>/g;
  const valueRe = /<Value>([\d,]+)<\/Value>/g;
  const nominalRe = /<Nominal>(\d+)<\/Nominal>/g;

  let charCodes = [];
  let values = [];
  let nominals = [];
  let m;

  while ((m = charCodeRe.exec(xml)) !== null) charCodes.push(m[1]);
  while ((m = valueRe.exec(xml)) !== null) values.push(m[1]);
  while ((m = nominalRe.exec(xml)) !== null) nominals.push(parseInt(m[1]));

  const rates = {};
  for (let i = 0; i < charCodes.length; i++) {
    const nominal = nominals[i] || 1;
    const value = parseFloat(values[i].replace(",", ".")) / nominal;
    rates[charCodes[i]] = value;
  }

  return { date: dateStr, rates };
}

app.get("/api/cbr-rates", async (req, res) => {
  try {
    if (req.query.refresh === "true" || Date.now() - ratesCache.ts >= RATES_TTL_MS) {
      const today = new Date();
      const dd = String(today.getDate()).padStart(2, "0");
      const mm = String(today.getMonth() + 1).padStart(2, "0");
      const yyyy = today.getFullYear();
      const url = `https://www.cbr.ru/scripts/XML_daily.asp?date_req=${dd}/${mm}/${yyyy}`;

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), CBR_TIMEOUT_MS);

      try {
        const cbrRes = await fetch(url, {
          signal: controller.signal,
          headers: { "User-Agent": CBR_UA },
        });
        if (!cbrRes.ok) throw new Error(`HTTP ${cbrRes.status}`);
        const xml = await cbrRes.text();
        const result = parseCbrXml(xml, `${dd}.${mm}.${yyyy}`);
        if (Object.keys(result.rates).length === 0) throw new Error("Empty rates response");
        ratesCache = { data: result, ts: Date.now() };
        return res.json({ ...result, cached: false });
      } finally {
        clearTimeout(timer);
      }
    }

    res.json({ ...ratesCache.data, cached: true });
  } catch (err) {
    console.error("CBR rates proxy error:", err.message);
    if (ratesCache.data) {
      res.json({ ...ratesCache.data, cached: true, stale: true });
    } else {
      res.status(502).json({ error: "CBR rates unavailable" });
    }
  }
});

function parseCbrMetallXml(xml) {
  const regex = /<Record Date="([^"]+)"\s+Code="(\d+)">\s*<Buy>([\d,]+)<\/Buy>\s*<Sell>([\d,]+)<\/Sell>/g;
  const metals = {};
  let match;
  let date = null;

  while ((match = regex.exec(xml)) !== null) {
    const code = METAL_CODES[match[2]];
    if (!code) continue;
    const buyPrice = parseFloat(match[3].replace(',', '.'));
    if (date === null) date = match[1];
    metals[code] = buyPrice;
  }

  return { date, metals };
}

app.get('/api/cbr-metals', async (req, res) => {
  try {
    if (req.query.refresh === 'true' || Date.now() - metalsCache.ts >= METALS_TTL_MS) {
      const today = new Date();
      const dd = String(today.getDate()).padStart(2, '0');
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const yyyy = today.getFullYear();
      const url = `https://www.cbr.ru/scripts/XML_metall.asp?date_req1=${dd}.${mm}.${yyyy}&date_req2=${dd}.${mm}.${yyyy}`;

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), CBR_TIMEOUT_MS);

      try {
        const cbrRes = await fetch(url, {
          signal: controller.signal,
          headers: { 'User-Agent': CBR_UA }
        });
        if (!cbrRes.ok) throw new Error(`HTTP ${cbrRes.status}`);
        const xml = await cbrRes.text();
        const result = parseCbrMetallXml(xml);
        if (!result.date || Object.keys(result.metals).length === 0) {
          throw new Error('Empty metals response');
        }
        metalsCache = { data: result, ts: Date.now() };
        return res.json({ ...result, cached: false });
      } finally {
        clearTimeout(timer);
      }
    }

    res.json({ ...metalsCache.data, cached: true });
  } catch (err) {
    console.error('CBR metals proxy error:', err.message);
    if (metalsCache.data) {
      res.json({ ...metalsCache.data, cached: true, stale: true });
    } else {
      res.status(502).json({ error: 'CBR metals unavailable' });
    }
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
  loadCbrKeyRate();
  console.log(`Investment calculator running at http://localhost:${port}`);
});
