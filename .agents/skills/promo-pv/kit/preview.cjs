// still frames for review: node kit/preview.cjs 1.5,3,7.25 out/pv [url]
const { chromium } = require('playwright');
(async () => {
  const times = process.argv[2].split(',').map(Number), out = process.argv[3] || 'out/pv', url = process.argv[4] || 'http://127.0.0.1:8777/index.html';
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  p.on('pageerror', e => console.log('PAGEERR', e.message)); p.on('console', m => { if (m.type() === 'error') console.log('CONSOLE', m.text().slice(0, 300)); });
  await p.goto(url); await p.evaluate(() => window.ready);
  require('fs').mkdirSync(out, { recursive: true });
  for (const t of times) { await p.evaluate(t => window.renderFrame(t), t); await p.screenshot({ path: `${out}/t${t.toFixed(2).padStart(6, '0')}.jpg`, quality: 70 }); }
  await b.close();
})();
