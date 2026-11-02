import { createRequire } from 'node:module';
import { readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pnpm = resolve(root, 'node_modules/.pnpm');
const puppeteerDir = readdirSync(pnpm).find((entry) => entry.startsWith('puppeteer@'));
if (!puppeteerDir) throw new Error('Puppeteer is unavailable');
const puppeteer = createRequire(resolve(pnpm, puppeteerDir, 'node_modules/'))('puppeteer');
const token = process.env.BH_E2E_TOKEN;
if (!token) throw new Error('Set BH_E2E_TOKEN');
const origin = process.env.BH_E2E_ORIGIN ?? 'http://127.0.0.1:3102';
const nonce = Date.now();
const name = `ImageReader-${nonce}`;
const prompt =
  '请先用 channel_read 找到本消息的图片，再用 channel_read_image 直接查看，不要搜索文件系统。如果图片含有 Z9、一个红色方块和一个蓝色圆形，请只用 bot_send_message 回复 IMAGE-Z9。';
const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

try {
  const page = await browser.newPage();
  await page.goto(`${origin}/?token=${encodeURIComponent(token)}`, {
    waitUntil: 'networkidle2',
    timeout: 60000,
  });
  const rpc = (method, args) =>
    page.evaluate(
      async ({ method, args }) => {
        const response = await fetch(`/api/botharness/${method}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            type: 'client-request',
            rpcId: `image-read-${Math.random()}`,
            method: `botharness/${method}`,
            payload: { args },
          }),
        });
        const envelope = await response.json();
        if (envelope.result?.ok !== true) throw new Error(JSON.stringify(envelope.result));
        return envelope.result.value;
      },
      { method, args },
    );

  const bot = (await rpc('create', { displayName: name })).bot;
  const channel = (await rpc('channelDm', { slug: bot.slug, displayName: bot.displayName }))
    .channel;
  const uploaded = await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 180;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('canvas unavailable');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#ef4444';
    context.fillRect(25, 50, 70, 70);
    context.fillStyle = '#2563eb';
    context.beginPath();
    context.arc(250, 85, 38, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#111827';
    context.font = 'bold 54px sans-serif';
    context.fillText('Z9', 125, 105);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('png encoding failed');
    const response = await fetch('/api/botharness/attachment/upload?name=visual-z9.png', {
      method: 'POST',
      headers: { 'content-type': 'application/octet-stream' },
      body: blob,
    });
    if (!response.ok) throw new Error(`upload failed: ${response.status}`);
    return response.json();
  });
  const ref = uploaded.attachment;
  await rpc('channelSend', { channelId: channel.id, body: prompt, attachments: [ref] });

  const deadline = Date.now() + 90000;
  let messages = [];
  while (Date.now() < deadline) {
    const timeline = await rpc('channelTimeline', { channelId: channel.id });
    messages = timeline.page.entries;
    if (
      messages.some((message) => message.author.kind === 'bot' && message.body.includes('IMAGE-Z9'))
    ) {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 1200));
  }
  const botMessages = messages.filter((message) => message.author.kind === 'bot');
  const passed = botMessages.some((message) => message.body.includes('IMAGE-Z9'));
  console.log(
    JSON.stringify({
      verdict: passed ? 'PASS' : 'FAIL',
      botReplies: botMessages.map((message) => message.body),
      channelId: channel.id,
      imageHash: ref.hash,
    }),
  );
  if (!passed) process.exitCode = 1;
} catch (error) {
  console.error(String(error?.stack ?? error).replace(/token=[^&\s]+/g, 'token=<REDACTED>'));
  process.exitCode = 1;
} finally {
  await browser.close();
}
