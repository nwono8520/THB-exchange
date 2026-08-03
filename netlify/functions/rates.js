// netlify/functions/rates.js
// 這個檔案要放在 repo 裡的路徑：netlify/functions/rates.js

async function fetchWithTimeout(url, options = {}, timeoutMs = 9000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export default async () => {
  const results = {
    bot: { usdSell: null, thbSell: null, error: null, debug: null },
    superRichThailand: { twd: null, usd: null, error: null, debug: null },
    superRich1965: { twd: null, usd: null, error: null, debug: null },
  };

  // ---- 1. 台灣銀行 CSV ----
  try {
    const res = await fetchWithTimeout('https://rate.bot.com.tw/xrt/flcsv/0/day', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/csv,text/plain,*/*',
      },
    });
    const csv = await res.text();
    results.bot.debug = { status: res.status, length: csv.length, snippet: csv.slice(0, 200) };
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const lines = csv.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    for (const line of lines) {
      const parts = line.split(',');
      const code = parts[0].replace(/^\uFEFF/, '').trim();
      if (code === 'USD' && parts.length > 12) {
        const v = parseFloat(parts[12]);
        if (isFinite(v) && v > 0) results.bot.usdSell = v;
      }
      if (code === 'THB' && parts.length > 12) {
        const v = parseFloat(parts[12]);
        if (isFinite(v) && v > 0) results.bot.thbSell = v;
      }
    }
    if (!results.bot.usdSell || !results.bot.thbSell) {
      results.bot.error = 'parse failed';
    }
  } catch (e) {
    results.bot.error = e.message;
  }

  // ---- 2 & 3. Super Rich 兩家 ----
  function extractFromRow(text, keywords, min, max, maxCount = 8) {
    const out = [];
    const rows = text.split(/\n{1,2}|\s\|\s/).map(r => r.trim()).filter(Boolean);
    for (const row of rows) {
      if (out.length >= maxCount) break;
      const hit = keywords.some(k => new RegExp(k, 'i').test(row));
      if (!hit) continue;
      const nums = row.match(/\d{1,3}\.\d{1,4}/g) || [];
      for (const n of nums) {
        const v = parseFloat(n);
        if (isFinite(v) && v > min && v < max) out.push(v);
      }
    }
    return out;
  }
  function median(arr) {
    if (!arr.length) return null;
    const s = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  }

  async function fetchSuperRich(url) {
    const res = await fetchWithTimeout('https://r.jina.ai/' + url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      },
    }, 15000);
    const text = await res.text();
    if (!res.ok) throw new Error('HTTP ' + res.status + ' | ' + text.slice(0, 150));
    if (!text || text.length < 20) throw new Error('empty response');
    return text;
  }

  try {
    const text = await fetchSuperRich('https://www.superrichthailand.com/#!/en/exchange');
    const twdVals = extractFromRow(text, ['TWD', 'Taiwan'], 0.75, 1.35);
    const usdVals = extractFromRow(text, ['USD', 'United States'], 20, 50);
    results.superRichThailand.twd = median(twdVals);
    results.superRichThailand.usd = median(usdVals);
    results.superRichThailand.debug = { length: text.length, snippet: text.slice(0, 300) };
    if (results.superRichThailand.twd === null && results.superRichThailand.usd === null) {
      results.superRichThailand.error = 'parse failed';
    }
  } catch (e) {
    results.superRichThailand.error = e.message;
  }

  try {
    const text = await fetchSuperRich('https://www.superrich1965.com/en/exchange-rate');
    const twdVals = extractFromRow(text, ['TWD', 'Taiwan'], 0.75, 1.35);
    const usdVals = extractFromRow(text, ['USD', 'United States'], 20, 50);
    results.superRich1965.twd = median(twdVals);
    results.superRich1965.usd = median(usdVals);
    results.superRich1965.debug = { length: text.length, snippet: text.slice(0, 300) };
    if (results.superRich1965.twd === null && results.superRich1965.usd === null) {
      results.superRich1965.error = 'parse failed';
    }
  } catch (e) {
    results.superRich1965.error = e.message;
  }

  return new Response(JSON.stringify(results), {
    headers: { 'Content-Type': 'application/json' },
  });
};
