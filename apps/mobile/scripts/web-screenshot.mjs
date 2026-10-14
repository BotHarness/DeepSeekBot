import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';

const [url, out, scheme = 'light'] = process.argv.slice(2);
if (url === undefined || out === undefined) {
  console.error('usage: web-screenshot.mjs <url> <out.png> [light|dark]');
  process.exit(2);
}

const globalRoot = execSync('npm root -g', { encoding: 'utf8' }).trim();
const { chromium } = createRequire(import.meta.url)(
  createRequire(import.meta.url).resolve('playwright', {
    paths: [process.cwd(), globalRoot],
  }),
);

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  colorScheme: scheme,
});
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(1000);
await page.screenshot({ path: out });
await browser.close();
console.log(`${page.url()} -> ${out}`);
for (const error of errors) console.error(`page error: ${error}`);
