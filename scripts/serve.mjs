import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat, realpath } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, relative, extname, isAbsolute, sep } from 'node:path';

const root = await realpath(fileURLToPath(new URL('../', import.meta.url)));
const port = Number(process.env.PORT || 5173);
const types = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.svg':'image/svg+xml', '.webp':'image/webp', '.png':'image/png', '.mp4':'video/mp4', '.ttf':'font/ttf', '.woff2':'font/woff2', '.md':'text/plain; charset=utf-8', '.txt':'text/plain; charset=utf-8', '.json':'application/json' };
const server = createServer(async (request, response) => {
  const fail = (status, message) => { response.writeHead(status, { 'Content-Type':'text/plain; charset=utf-8' }); response.end(message); };
  try {
    if (!['GET','HEAD'].includes(request.method)) return fail(405, 'Method not allowed');
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (pathname.includes('\\') || pathname.split('/').some(part => part.startsWith('.'))) return fail(403, 'Forbidden');
    let file = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    file = await realpath(file);
    const rel = relative(root, file);
    if (rel.startsWith('..' + sep) || rel === '..' || isAbsolute(rel)) return fail(403, 'Forbidden');
    let info = await stat(file);
    if (!info.isFile()) return fail(404, 'Not found');
    let start = 0, end = info.size - 1, status = 200;
    const headers = { 'Content-Type':types[extname(file)] || 'application/octet-stream', 'Accept-Ranges':'bytes', 'Cache-Control':'no-cache', 'X-Content-Type-Options':'nosniff' };
    if (request.headers.range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range);
      if (!match || (!match[1] && !match[2])) { response.writeHead(416, { 'Content-Range':`bytes */${info.size}` }); return response.end(); }
      if (match[1]) { start = Number(match[1]); end = match[2] ? Math.min(Number(match[2]), end) : end; }
      else { start = Math.max(0, info.size - Number(match[2])); }
      if (start > end || start >= info.size) { response.writeHead(416, { 'Content-Range':`bytes */${info.size}` }); return response.end(); }
      status = 206; headers['Content-Range'] = `bytes ${start}-${end}/${info.size}`;
    }
    headers['Content-Length'] = end - start + 1;
    response.writeHead(status, headers);
    if (request.method === 'HEAD') return response.end();
    const stream = createReadStream(file, { start, end });
    stream.on('error', () => response.destroy());
    response.on('close', () => stream.destroy());
    stream.pipe(response);
  } catch (error) { if (!response.headersSent) fail(error instanceof URIError ? 400 : 404, 'Not found'); }
});
server.listen(port, '127.0.0.1', () => console.log(`Steadmorrow: http://127.0.0.1:${port}`));
