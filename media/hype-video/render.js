// usage: node render.js preview 30,120,...   |   node render.js full out.mp4 music.wav
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const dir = __dirname;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.woff2': 'font/woff2' };
const srv = http.createServer((q, r) => {
  const f = path.join(dir, decodeURIComponent(q.url.split('?')[0]));
  if (!f.startsWith(dir) || !fs.existsSync(f)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r);
});
(async () => {
  await new Promise(ok => srv.listen(8765, ok));
  const browser = await chromium.launch({ args: ['--disable-gpu-vsync'] });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  page.on('console', m => console.log('page:', m.text()));
  page.on('pageerror', e => { console.error('PAGEERROR', e); process.exit(1); });
  await page.goto('http://127.0.0.1:8765/index.html');
  console.log(await page.evaluate(() => window.ready));
  const grab = i => page.evaluate(i => { renderFrame(i); return document.getElementById('c').toDataURL('image/png').slice(22); }, i);
  const mode = process.argv[2];
  if (mode === 'preview') {
    const frames = process.argv[3].split(',').map(Number).sort((a, b) => a - b);
    fs.mkdirSync(path.join(dir, 'prev'), { recursive: true });
    for (const i of frames) fs.writeFileSync(path.join(dir, 'prev', `f${String(i).padStart(4, '0')}.png`), Buffer.from(await grab(i), 'base64'));
  } else {
    const out = process.argv[3], music = process.argv[4];
    const nf = await page.evaluate(() => NF);
    const args = ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', '30', '-c:v', 'png', '-i', '-'];
    if (music) args.push('-i', music);
    args.push('-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', '-movflags', '+faststart');
    if (music) args.push('-c:a', 'aac', '-b:a', '192k', '-shortest');
    args.push(out);
    const ff = spawn('ffmpeg', args, { stdio: ['pipe', 'inherit', 'inherit'] });
    const t0 = Date.now();
    for (let i = 0; i < nf; i++) {
      const buf = Buffer.from(await grab(i), 'base64');
      if (!ff.stdin.write(buf)) await new Promise(ok => ff.stdin.once('drain', ok));
      if (i % 90 === 0) console.log(`frame ${i}/${nf} ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    }
    ff.stdin.end();
    await new Promise(ok => ff.on('close', ok));
  }
  await browser.close(); srv.close();
})();
