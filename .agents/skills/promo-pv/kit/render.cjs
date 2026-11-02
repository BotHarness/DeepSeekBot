// render a slice to H.264 at 30 fps: node kit/render.cjs from to out.mp4 events.json [url]
const { chromium } = require('playwright');
const fs = require('fs'); const { spawn } = require('child_process');
(async () => {
  const [from, to, out, evf, url = 'http://127.0.0.1:8777/index.html'] = process.argv.slice(2); const fps = 30;
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  p.on('pageerror', e => console.log('PAGEERR', e.message));
  await p.goto(url); await p.evaluate(() => window.ready);
  const n0 = Math.round(from * fps), n1 = Math.round(Math.min(to, await p.evaluate(() => window.TOTAL)) * fps);
  const ff = spawn('ffmpeg', ['-y', '-v', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-', '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-pix_fmt', 'yuv420p', out]);
  const t0 = Date.now();
  for (let i = n0; i < n1; i++) {
    await p.evaluate(t => window.renderFrame(t), i / fps);
    const buf = await p.screenshot({ type: 'jpeg', quality: 94 });
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
    if (i % 150 === 0) console.log(`frame ${i}/${n1} ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
  ff.stdin.end(); await new Promise(r => ff.on('close', r));
  fs.writeFileSync(evf, JSON.stringify(await p.evaluate(() => window.EVENTS)));
  await b.close(); console.log('done');
})();
