// netlify/functions/rates.js
// 這個檔案要放在 repo 裡的路徑：netlify/functions/rates.js

export default async () => {
  const results = {
    bot: { usdSell: null, thbSell: null, error: null },
    superRichThailand: { twd: null, usd: null, error: null },
    superRich1965: { twd: null, usd: null, error: null },
  };

  // ---- 1. 台灣銀行 CSV ----
  try {
    const res = await fetch('https://rate.bot.com.tw/xrt/flcsv/0/day');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const csv = await res.text();
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
    const res = await fetch('https://r.jina.ai/' + url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const text = await res.text();
    if (!text || text.length < 20) throw new Error('empty response');
    return text;
  }

  try {
    const text = await fetchSuperRich('https://www.superrichthailand.com/#!/en/exchange');
    const twdVals = extractFromRow(text, ['TWD', 'Taiwan'], 0.75, 1.35);
    const usdVals = extractFromRow(text, ['USD', 'United States'], 20, 50);
    results.superRichThailand.twd = median(twdVals);
    results.superRichThailand.usd = median(usdVals);
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
