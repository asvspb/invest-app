/**
 * @fileoverview Server setup for the Investment Calculator application.
 * Serves built static files (dist/) and proxies CBR endpoints.
 *
 * Logic (endpoints, caches, AbortController, parsers) ported 1:1 from server.js —
 * only TS types added. Verified in prior architecture reviews (tasks №1–№4).
 */

import express, { type Request, type Response } from "express";
import path from "node:path";

const app = express();
const DEFAULT_PORT = 7777;
const port = Number(process.env.PORT) || DEFAULT_PORT;

// Runtime root: server runs from project root (node dist/server.js),
// so process.cwd() resolves to the app root both in dev and prod.
const APP_ROOT = process.cwd();

// --- Named constants (AGENTS.md §6.4) ---
let cachedKeyRate = 21;
interface RateData {
  date: string;
  rates: Record<string, number>;
}
interface MetalData {
  date: string;
  metals: Record<string, number>;
}
let ratesCache: { data: RateData | null; ts: number } = { data: null, ts: 0 };
let metalsCache: { data: MetalData | null; ts: number } = { data: null, ts: 0 };
const RATES_TTL_MS = 60 * 60 * 1000;
const METALS_TTL_MS = 60 * 60 * 1000;
const CBR_TIMEOUT_MS = 5_000;
const CBR_UA = "Mozilla/5.0";
const METAL_CODES: Record<string, string> = { "1": "Au", "2": "Ag", "3": "Pt", "4": "Pd" };

// --- Helpers: today's date as dd.mm.yyyy and dd/mm/yyyy ---
function todayParts(): { dd: string; mm: string; yyyy: string } {
  const today = new Date();
  const dd = String(today.getDate()).padStart(2, "0");
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const yyyy = String(today.getFullYear());
  return { dd, mm, yyyy };
}

/** Fetch with AbortController timeout (AGENTS.md §8.1 — no hanging fetch). */
async function fetchWithTimeout(url: string): Promise<globalThis.Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CBR_TIMEOUT_MS);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": CBR_UA },
    });
  } finally {
    clearTimeout(timer);
  }
}

// --- Pure parsers (string → object, no req/res; AGENTS.md §6.2) ---

function parseCbrKeyRateHtml(html: string): number | null {
  const match = html.match(/<td>\d{2},\d{2}<\/td>/);
  if (!match) return null;
  return parseFloat(match[0].replace(/[^\d.,]/g, "").replace(",", "."));
}

function parseCbrXml(xml: string, dateStr: string): { date: string; rates: Record<string, number> } {
  const charCodeRe = /<CharCode>(\w+)<\/CharCode>/g;
  const valueRe = /<Value>([\d,]+)<\/Value>/g;
  const nominalRe = /<Nominal>(\d+)<\/Nominal>/g;

  const charCodes: string[] = [];
  const values: string[] = [];
  const nominals: number[] = [];
  let m: RegExpExecArray | null;

  while ((m = charCodeRe.exec(xml)) !== null && m[1] !== undefined) charCodes.push(m[1]);
  while ((m = valueRe.exec(xml)) !== null && m[1] !== undefined) values.push(m[1]);
  while ((m = nominalRe.exec(xml)) !== null && m[1] !== undefined) nominals.push(parseInt(m[1], 10));

  const rates: Record<string, number> = {};
  for (let i = 0; i < charCodes.length; i++) {
    const charCode = charCodes[i];
    const valueStr = values[i];
    const nominal = nominals[i];
    if (charCode === undefined || valueStr === undefined) continue;
    const value = parseFloat(valueStr.replace(",", ".")) / (nominal ?? 1);
    rates[charCode] = value;
  }

  return { date: dateStr, rates };
}

function parseCbrMetallXml(xml: string): { date: string | null; metals: Record<string, number> } {
  const regex =
    /<Record Date="([^"]+)"\s+Code="(\d+)">\s*<Buy>([\d,]+)<\/Buy>\s*<Sell>([\d,]+)<\/Sell>/g;
  const metals: Record<string, number> = {};
  let match: RegExpExecArray | null;
  let date: string | null = null;

  while ((match = regex.exec(xml)) !== null) {
    const codeKey = match[2];
    const buyVal = match[3];
    const dateVal = match[1];
    if (codeKey === undefined || buyVal === undefined || dateVal === undefined) continue;
    const code = METAL_CODES[codeKey];
    if (!code) continue;
    const buyPrice = parseFloat(buyVal.replace(",", "."));
    if (date === null) date = dateVal;
    metals[code] = buyPrice;
  }

  return { date, metals };
}

// --- Background loader for CBR key rate ---

async function loadCbrKeyRate(): Promise<void> {
  try {
    const cbrRes = await fetchWithTimeout("https://www.cbr.ru/hd_base/KeyRate/");
    if (!cbrRes.ok) return;
    const html = await cbrRes.text();
    const rate = parseCbrKeyRateHtml(html);
    if (rate !== null) {
      cachedKeyRate = rate;
      console.log(`CBR key rate loaded: ${cachedKeyRate}%`);
    }
  } catch (err) {
    console.error("Failed to load CBR key rate:", (err as Error).message);
  }
}

// --- Middleware & endpoints ---

/**
 * Serve built static files from dist/ (production). In dev, Vite serves the client.
 */
app.use(express.static(path.join(APP_ROOT, "dist")));

app.get("/api/cbr-key-rate", async (req: Request, res: Response) => {
  try {
    if (req.query.refresh === "true") {
      await loadCbrKeyRate();
    }
    res.json({ rate: cachedKeyRate });
  } catch (err) {
    console.error("CBR key-rate endpoint error:", (err as Error).message);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/cbr-rates", async (req: Request, res: Response) => {
  try {
    if (req.query.refresh === "true" || Date.now() - ratesCache.ts >= RATES_TTL_MS) {
      const { dd, mm, yyyy } = todayParts();
      const url = `https://www.cbr.ru/scripts/XML_daily.asp?date_req=${dd}/${mm}/${yyyy}`;

      const cbrRes = await fetchWithTimeout(url);
      if (!cbrRes.ok) throw new Error(`HTTP ${cbrRes.status}`);
      const xml = await cbrRes.text();
      const result = parseCbrXml(xml, `${dd}.${mm}.${yyyy}`);
      if (Object.keys(result.rates).length === 0) throw new Error("Empty rates response");
      ratesCache = { data: result, ts: Date.now() };
      return res.json({ ...result, cached: false });
    }

    if (ratesCache.data) {
      res.json({ ...ratesCache.data, cached: true });
    } else {
      res.status(502).json({ error: "CBR rates unavailable" });
    }
  } catch (err) {
    console.error("CBR rates proxy error:", (err as Error).message);
    if (ratesCache.data) {
      res.json({ ...ratesCache.data, cached: true, stale: true });
    } else {
      res.status(502).json({ error: "CBR rates unavailable" });
    }
  }
});

app.get("/api/cbr-metals", async (req: Request, res: Response) => {
  try {
    if (req.query.refresh === "true" || Date.now() - metalsCache.ts >= METALS_TTL_MS) {
      const { dd, mm, yyyy } = todayParts();
      const url = `https://www.cbr.ru/scripts/XML_metall.asp?date_req1=${dd}.${mm}.${yyyy}&date_req2=${dd}.${mm}.${yyyy}`;

      const cbrRes = await fetchWithTimeout(url);
      if (!cbrRes.ok) throw new Error(`HTTP ${cbrRes.status}`);
      const xml = await cbrRes.text();
      const result = parseCbrMetallXml(xml);
      if (!result.date || Object.keys(result.metals).length === 0) {
        throw new Error("Empty metals response");
      }
      // result.date is non-null here (checked above), narrow the type for the cache
      const metalData: MetalData = { date: result.date, metals: result.metals };
      metalsCache = { data: metalData, ts: Date.now() };
      return res.json({ ...metalData, cached: false });
    }

    if (metalsCache.data) {
      res.json({ ...metalsCache.data, cached: true });
    } else {
      res.status(502).json({ error: "CBR metals unavailable" });
    }
  } catch (err) {
    console.error("CBR metals proxy error:", (err as Error).message);
    if (metalsCache.data) {
      res.json({ ...metalsCache.data, cached: true, stale: true });
    } else {
      res.status(502).json({ error: "CBR metals unavailable" });
    }
  }
});

// --- SPA fallback: serve index.html for non-/api, non-static routes ---
app.get("/", (_req: Request, res: Response) => {
  res.sendFile(path.join(APP_ROOT, "dist", "index.html"));
});

app.listen(port, () => {
  // fire-and-forget: do not block startup on CBR availability (AGENTS.md §8.1 fix)
  loadCbrKeyRate();
  console.log(`Investment calculator running at http://localhost:${port}`);
});
