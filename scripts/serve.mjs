import {mkdirSync,writeFileSync,renameSync} from 'node:fs';
import {createRunLedger} from './run-ledger.mjs';
import {createHash} from 'node:crypto';
import {readdir} from 'node:fs/promises';
import {validateScenarioInput} from './scenario-agent.mjs';
import { createFindingsService, handleFindings } from './gloo.mjs';
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { readFile, stat, realpath } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, relative, extname, isAbsolute, sep } from 'node:path';

const publicFiles = new Set(['/', '/index.html', '/app.js', '/styles.css', '/land.js', '/land.css', '/geometry.js', '/findings.js', '/spatial-experience.js', '/site-scene.js', '/scene-geometry.js', '/street-geometry.js', '/findings-session.js', '/spatial.css', '/input-privacy.js']);
const types = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.svg':'image/svg+xml', '.webp':'image/webp', '.png':'image/png', '.mp4':'video/mp4', '.ttf':'font/ttf', '.woff2':'font/woff2', '.json':'application/json' };

async function readAppConfig(root, environment) {
  const local = {};
  try {
    const source = await readFile(resolve(root, '.env.local'), 'utf8');
    for (const line of source.split(/\r?\n/)) {
      const match = /^(?:export\s+)?(GOOGLE_MAPS_API_KEY|GOOGLE_MAPS_KEY_MODE|GLOO_API_KEY|GLOO_MODEL)\s*=\s*(.*)$/.exec(line.trim());
      if (!match) continue;
      let value = match[2].trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      } else {
        value = value.replace(/\s+#.*$/, '').trim();
      }
      local[match[1]] = value;
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const apiKey = String(environment.GOOGLE_MAPS_API_KEY ?? local.GOOGLE_MAPS_API_KEY ?? '').trim();
  const mode = String(environment.GOOGLE_MAPS_KEY_MODE ?? local.GOOGLE_MAPS_KEY_MODE ?? 'standard').trim() || 'standard';
  return {
    maps: { apiKey, mode, configured: Boolean(apiKey) },
    gloo: { apiKey: String(environment.GLOO_API_KEY ?? local.GLOO_API_KEY ?? '').trim(), model: String(environment.GLOO_MODEL ?? local.GLOO_MODEL ?? 'gloo-openai-gpt-5-mini').trim() },
  };
}

export async function createAppServer(directory = fileURLToPath(new URL('../', import.meta.url)), environment = process.env) {
  const root = await realpath(directory);
  // This is a browser API key. Only the two public Maps settings are exposed.
  const config = await readAppConfig(root, environment);
  const mapsConfig = JSON.stringify(config.maps);
  const scriptRoot=fileURLToPath(new URL('./',import.meta.url)),codeHasher=createHash('sha256');for(const file of (await readdir(scriptRoot)).filter(f=>f.endsWith('.mjs')).sort())codeHasher.update(await readFile(resolve(scriptRoot,file)));
  const recoveryPath=resolve(root,'.runtime','session-recovery.json');
  const review = createFindingsService({...config.gloo,onStateChange:records=>{const data=JSON.stringify(records);if(Buffer.byteLength(data)>32000000)return;mkdirSync(resolve(root,'.runtime'),{recursive:true});writeFileSync(recoveryPath+'.next',data,{encoding:'utf8',mode:0o600});renameSync(recoveryPath+'.next',recoveryPath);},codeHash:codeHasher.digest('hex'),ledgerFactory:createRunLedger(resolve(root,'.runtime','decision-traces')), onDiagnostic: event => {if (['agent-completed','scenario-completed','scenario-request','scenario-round','scenario-upstream-error'].includes(event.type)) console.info(JSON.stringify(event)); else if (['invalid-assessment','scenario-tool-error'].includes(event.type)) console.warn('Gloo output check:', event.reason);}});
  try{const info=await stat(recoveryPath);if(info.size<=32000000)review.restore(JSON.parse(await readFile(recoveryPath,'utf8')));}catch{}
  return createServer(async (request, response) => {
    const fail = (status, message) => {
      response.writeHead(status, { 'Content-Type':'text/plain; charset=utf-8', 'X-Content-Type-Options':'nosniff' });
      response.end(request.method === 'HEAD' ? undefined : message);
    };
    try {
      if (request.url.split(/[?#]/, 1)[0] === '/api/scenario') return await handleFindings(request, response, review.scenario, validateScenarioInput);
      if (request.url.split(/[?#]/, 1)[0] === '/api/first-look') return await handleFindings(request, response, review);
      if (request.url.split(/[?#]/, 1)[0] === '/api/property-evidence') return await handleFindings(request, response, review.records);
      if (!['GET', 'HEAD'].includes(request.method)) return fail(405, 'Method not allowed');
      // Inspect before URL normalization so encoded and literal traversal are rejected.
      const pathname = decodeURIComponent(request.url.split(/[?#]/, 1)[0]);
      if (!pathname.startsWith('/')) return fail(400, 'Invalid request');
      if (pathname.includes('\\') || pathname.split('/').some(part => part.startsWith('.'))) return fail(403, 'Forbidden');
      if (pathname === '/api/maps-config') {
        response.writeHead(200, {
          'Content-Type':'application/json; charset=utf-8',
          'Content-Length':Buffer.byteLength(mapsConfig),
          'Cache-Control':'no-store',
          'X-Content-Type-Options':'nosniff'
        });
        return response.end(request.method === 'HEAD' ? undefined : mapsConfig);
      }
      if (!publicFiles.has(pathname) && !pathname.startsWith('/assets/')) return fail(404, 'Not found');
      const file = await realpath(resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname)));
      const rel = relative(root, file);
      if (rel.startsWith('..' + sep) || rel === '..' || isAbsolute(rel)) return fail(403, 'Forbidden');
      const info = await stat(file);
      if (!info.isFile()) return fail(404, 'Not found');
      let start = 0, end = info.size - 1, status = 200;
      const headers = { 'Content-Type':types[extname(file)] || 'application/octet-stream', 'Accept-Ranges':'bytes', 'Cache-Control':'no-cache', 'X-Content-Type-Options':'nosniff' };
      if (request.headers.range) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range);
        if (!match || (!match[1] && !match[2])) { response.writeHead(416, { 'Content-Range':`bytes */${info.size}` }); return response.end(); }
        if (match[1]) { start = Number(match[1]); end = match[2] ? Math.min(Number(match[2]), end) : end; }
        else { start = Math.max(0, info.size - Number(match[2])); }
        if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= info.size) { response.writeHead(416, { 'Content-Range':`bytes */${info.size}` }); return response.end(); }
        status = 206; headers['Content-Range'] = `bytes ${start}-${end}/${info.size}`;
      }
      headers['Content-Length'] = end - start + 1;
      response.writeHead(status, headers);
      if (request.method === 'HEAD' || info.size === 0) return response.end();
      const stream = createReadStream(file, { start, end });
      stream.on('error', () => response.destroy());
      response.on('close', () => stream.destroy());
      stream.pipe(response);
    } catch (error) {
      if (!response.headersSent) fail(error instanceof URIError ? 400 : 404, 'Not found');
    }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 5173);
  const server = await createAppServer();
  server.listen(port, '127.0.0.1', () => console.log(`Steadmorrow: http://127.0.0.1:${port}`));
}
