import {createHash} from 'node:crypto';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {dirname, extname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const files = new Set([
  'index.html', 'app.css', 'app.js', 'bank.js', 'store.js', 'sw.js', 'manifest.webmanifest',
  'icon-192.png', 'icon-512.png', 'banks/2026.json', 'banks/template.csv',
  'upstream/src/js/00-core.js', 'upstream/src/js/20-types.js', 'upstream/src/js/35-scoring.js',
  'upstream/LICENSE', 'vendor/xlsx.full.min.js', 'vendor/LICENSE', 'README.md', 'NOTICE.md'
]);
const contentTypes = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png',
  '.csv': 'text/csv; charset=utf-8', '.md': 'text/plain; charset=utf-8'
};

if (process.argv.includes('--build')) {
  const assets = new Map();
  const digest = createHash('sha256');
  for (const file of files) {
    const body = await readFile(join(root, file));
    assets.set(file, body);
    digest.update(file + '\0').update(body);
  }
  const version = digest.digest('hex').slice(0, 16);
  const worker = assets.get('sw.js').toString('utf8');
  const marker = "const CACHE_VERSION = 'development-v4';";
  if (!worker.includes(marker)) throw new Error('Missing Service Worker cache version marker');
  assets.set('sw.js', worker.replace(marker, `const CACHE_VERSION = '${version}';`));
  for (const [file, body] of assets) {
    const dest = join(root, 'dist', file);
    await mkdir(dirname(dest), {recursive: true});
    await writeFile(dest, body);
  }
  await writeFile(join(root, 'dist', '.nojekyll'), '');
  console.log('Static PWA built in dist/');
} else {
  const port = Number(process.env.FIRE_DRILL_PORT || 4173);
  const host = process.env.FIRE_DRILL_HOST || '127.0.0.1';
  const base = process.env.FIRE_DRILL_BASE_PATH || '/';
  if (!/^\/(?:[\w.-]+\/)*$/.test(base)) throw new Error('Expected a base path such as /fire-exam/');
  const siteRoot = process.argv.includes('--preview') ? join(root, 'dist') : root;
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (base !== '/' && url.pathname === base.slice(0, -1)) {
        res.writeHead(308, {Location: base + url.search}).end();
        return;
      }
      const file = url.pathname.startsWith(base)
        ? url.pathname.slice(base.length) || 'index.html' : '';
      if (!['GET', 'HEAD'].includes(req.method) || !files.has(file)) {
        res.writeHead(404).end();
        return;
      }
      const body = await readFile(join(siteRoot, file));
      res.writeHead(200, {
        'Content-Type': contentTypes[extname(file)] || 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff'
      });
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch {
      res.writeHead(500).end();
    }
  });
  server.listen(port, host, () => console.log(`http://${host}:${server.address().port}${base}`));
}
