import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const HOST = '0.0.0.0';

const CITY_COORDS: Record<string, { zone: string; lat: number; lon: number }> = {
  Nairobi: { zone: 'Central Hub', lat: -1.2921, lon: 36.8219 },
  Mombasa: { zone: 'Coastal Hub', lat: -4.0435, lon: 39.6682 },
  Kisumu: { zone: 'Western Hub', lat: -0.0917, lon: 34.768 },
  Nakuru: { zone: 'Rift Hub', lat: -0.3031, lon: 36.08 },
  Eldoret: { zone: 'North Rift Hub', lat: 0.5143, lon: 35.2698 },
  Chuka: { zone: 'Mt. Kenya East', lat: -0.3333, lon: 37.65 },
  Meru: { zone: 'Mt. Kenya North', lat: 0.0463, lon: 37.6559 },
};

function haversineKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const h =
    sinLat * sinLat +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * sinLon * sinLon;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function calculateQuoteBreakdown(from: string, to: string, weightInput: number, speed: string) {
  const weightKg = Math.max(1, Math.min(50000, Number.isFinite(weightInput) ? weightInput : 10));
  const isExpress = speed === 'Express';
  const fromKey = Object.keys(CITY_COORDS).find((c) => c.toLowerCase() === from.trim().toLowerCase());
  const toKey = Object.keys(CITY_COORDS).find((c) => c.toLowerCase() === to.trim().toLowerCase());

  if (from.includes('China') || from.includes('Dubai') || to.includes('China') || to.includes('Dubai')) {
    const base = 6500;
    const ratePerKg = isExpress ? 1450 : 950;
    const total = Math.round(base + weightKg * ratePerKg);
    return {
      from,
      to,
      weightKg,
      speed: isExpress ? 'Express Air Freight' : 'Standard Cargo',
      estimatedPriceKes: total,
      eta: isExpress ? '4-7 business days' : '12-21 business days (sea/consolidated)',
      corridor: 'International Import/Export Corridor',
    };
  }

  const origin = fromKey ? CITY_COORDS[fromKey] : CITY_COORDS.Nairobi;
  const dest = toKey ? CITY_COORDS[toKey] : CITY_COORDS.Mombasa;
  const sameCity = (fromKey || from) === (toKey || to);
  const distanceKm = sameCity ? 15 : Math.round(haversineKm(origin, dest) * 1.25);

  const baseFee = sameCity ? 250 : distanceKm < 180 ? 450 : 650;
  const perKgRate = sameCity ? 45 : distanceKm < 180 ? 70 : 95;
  const expressMultiplier = isExpress ? 1.35 : 1;
  const estimatedPriceKes = Math.round((baseFee + weightKg * perKgRate) * expressMultiplier);

  let eta = '1-2 business days';
  if (sameCity) {
    eta = isExpress ? 'Same day (2-4 hours)' : 'Same day / Next day';
  } else if (distanceKm < 220) {
    eta = isExpress ? 'Next morning' : '1 business day';
  } else {
    eta = isExpress ? '1 business day (priority)' : '1-3 business days';
  }

  return {
    from: fromKey || from,
    to: toKey || to,
    weightKg,
    speed: isExpress ? 'Express' : 'Standard',
    distanceKm,
    estimatedPriceKes,
    eta,
    corridor: sameCity ? `${fromKey || from} Intra-City` : `${fromKey || from} → ${toKey || to} Corridor`,
  };
}

function cleanStr(value: unknown, maxLen = 200): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLen);
}

app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.post('/api/calculate-quote', (req, res) => {
  const from = cleanStr(req.body?.from, 80) || 'Nairobi';
  const to = cleanStr(req.body?.to, 80) || 'Mombasa';
  const weight = Number(req.body?.weight);
  const speed = cleanStr(req.body?.speed, 30) === 'Express' ? 'Express' : 'Standard';
  res.json(calculateQuoteBreakdown(from, to, weight, speed));
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, HOST, () => {
    console.log(`Nuru Prime Logistics running at http://${HOST}:${PORT}`);
  });
}

void startServer();
