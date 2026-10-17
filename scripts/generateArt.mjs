// Generate pre-rendered art with Google (Gemini image, default) or OpenAI (gpt-image-1). Pure Node 18+, no deps.
//
// Google (Vertex AI, service account):
//   VERTEXAI_PROJECT=... VERTEX_CREDENTIALS_FILE=./vertex.json node scripts/generateArt.mjs --dog-photo my-dog.jpg
//   Optional: VERTEXAI_LOCATION (default "global").
// Google (Gemini Developer API, used when VERTEX_CREDENTIALS_FILE is unset):
//   GOOGLE_API_KEY=... node scripts/generateArt.mjs --dog-photo my-dog.jpg
// OpenAI:
//   OPENAI_API_KEY=sk-... node scripts/generateArt.mjs --provider openai [--dog-photo me-and-dog.jpg]
//
// Flags:
//   --provider <p>       google (default) | openai
//   --model <name>       override model (google default gemini-2.5-flash-image; openai gpt-image-1)
//   --only <substr>      filter by file name (repeatable or comma list)
//   --group <name>       den | icons | backdrops | buddy
//   --force              regenerate files that already exist
//   --dry-run            print provider, endpoint host and prompts, no API calls (no credentials needed)
//   --dog-photo <path>   jpg/png/webp reference for buddy parts
//   --keep-bg            google only: skip magenta chroma keying (debugging)
//   --quality <q>        openai only: low | medium (default) | high
//   --fidelity <f>       openai only: low | high (default) input_fidelity for /images/edits (dog likeness)
//   --concurrency <n>    parallel requests (default 2)
//
// Google models return opaque images, so every Google prompt asks for a flat magenta (#FF00FF) background and
// this script keys it out (scripts/png.mjs). Output is PNG only; a JPEG response fails with a clear message.
// Output size follows the model (about 1024x1024 for 1:1), not the manifest size; only the aspect ratio is requested.
//
// After generating: add require() lines for the new PNGs to src/art/artAssets.ts.
// assets/buddy parts are wired through the image skin, not the art registry.
// NEVER commit API keys or the service-account JSON (vertex.json is in .gitignore).
//
// Field-name uncertainty (not verified against live docs): OpenAI `quality` values and `input_fidelity` on edits;
// Gemini `generationConfig.imageConfig.aspectRatio` ("1:1", "3:2") and `responseModalities: ['IMAGE']`
// (some model versions may require ['TEXT','IMAGE']); response part key `inlineData` (camelCase) with `mimeType`/`data`;
// Vertex "global" location host `aiplatform.googleapis.com`.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { createSign } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join, basename, extname } from 'node:path';
import { ASSETS } from './artManifest.mjs';
import { decodePng, encodePng, chromaKeyMagenta } from './png.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OPENAI_API = 'https://api.openai.com/v1/images';
const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
const COST = { low: 0.01, medium: 0.04, high: 0.17 }; // approx $/img at 1024x1024 (openai)
const GOOGLE_MODEL = 'gemini-2.5-flash-image';
const MAGENTA_SUFFIX =
  'on a perfectly flat, solid, pure magenta (#FF00FF) background, no shadow on the background, nothing touching the frame edges';

function fail(msg) {
  console.error(`Error: ${msg}`);
  process.exit(1);
}

function parseArgs(argv) {
  const o = {
    provider: 'google', model: null, only: [], group: null, force: false, dryRun: false, dogPhoto: null,
    keepBg: false, quality: 'medium', fidelity: 'high', concurrency: 2,
  };
  const val = (i, name) => {
    if (i + 1 >= argv.length) fail(`Missing value for ${name}`);
    return argv[i + 1];
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--provider') o.provider = val(i++, a);
    else if (a === '--model') o.model = val(i++, a);
    else if (a === '--only') o.only.push(...val(i++, a).split(',').filter(Boolean));
    else if (a === '--group') o.group = val(i++, a);
    else if (a === '--force') o.force = true;
    else if (a === '--dry-run') o.dryRun = true;
    else if (a === '--keep-bg') o.keepBg = true;
    else if (a === '--dog-photo') o.dogPhoto = val(i++, a);
    else if (a === '--quality') o.quality = val(i++, a);
    else if (a === '--fidelity') o.fidelity = val(i++, a);
    else if (a === '--concurrency') o.concurrency = Number(val(i++, a));
    else fail(`Unknown flag: ${a}`);
  }
  if (o.provider !== 'google' && o.provider !== 'openai') fail('--provider must be google or openai');
  if (!COST[o.quality]) fail('--quality must be low, medium or high');
  if (o.fidelity !== 'low' && o.fidelity !== 'high') fail('--fidelity must be low or high');
  if (!Number.isInteger(o.concurrency) || o.concurrency < 1) fail('--concurrency must be a positive integer');
  o.model ??= o.provider === 'google' ? GOOGLE_MODEL : 'gpt-image-1';
  return o;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// fetch with 3 retries (backoff 2s, 4s, 8s) on 429/5xx and network errors. Returns parsed JSON.
async function request(makeInit, url) {
  let lastErr;
  for (let attempt = 0; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, makeInit());
      if (res.ok) return await res.json();
      const text = await res.text();
      lastErr = new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
      if (res.status !== 429 && res.status < 500) throw Object.assign(lastErr, { fatal: true });
    } catch (e) {
      if (e.fatal) throw e;
      lastErr = e;
    }
    if (attempt < 3) await sleep(2000 * 2 ** attempt);
  }
  throw lastErr;
}

// ---- Google auth + endpoint ------------------------------------------------

const b64url = (buf) => Buffer.from(buf).toString('base64url');

// Service-account OAuth2 flow. Token cached (promise) for the whole run.
let tokenPromise = null;
function getVertexToken(credsFile) {
  tokenPromise ??= (async () => {
    const creds = JSON.parse(readFileSync(credsFile, 'utf8'));
    if (!creds.client_email || !creds.private_key) fail(`${credsFile} is not a service-account JSON (missing client_email/private_key)`);
    const tokenUri = creds.token_uri ?? 'https://oauth2.googleapis.com/token';
    const now = Math.floor(Date.now() / 1000);
    const claims = {
      iss: creds.client_email,
      scope: 'https://www.googleapis.com/auth/cloud-platform',
      aud: tokenUri,
      iat: now,
      exp: now + 3600,
    };
    const unsigned = `${b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64url(JSON.stringify(claims))}`;
    const signature = createSign('RSA-SHA256').update(unsigned).sign(creds.private_key);
    const assertion = `${unsigned}.${b64url(signature)}`;
    const json = await request(() => ({
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }).toString(),
    }), tokenUri);
    if (!json.access_token) throw new Error('Token response had no access_token');
    return json.access_token;
  })();
  return tokenPromise;
}

// Resolves env into { mode: 'vertex' | 'devapi', ... } and the endpoint (host only is safe to print).
function googleTarget(model, { requireEnv }) {
  const credsFile = process.env.VERTEX_CREDENTIALS_FILE;
  if (credsFile) {
    const project = process.env.VERTEXAI_PROJECT;
    if (requireEnv && !project) fail('VERTEXAI_PROJECT is required when VERTEX_CREDENTIALS_FILE is set');
    if (requireEnv && !existsSync(credsFile)) fail(`VERTEX_CREDENTIALS_FILE not found: ${credsFile}`);
    const location = process.env.VERTEXAI_LOCATION || 'global';
    const host = location === 'global' ? 'aiplatform.googleapis.com' : `${location}-aiplatform.googleapis.com`;
    return {
      mode: 'vertex', credsFile, host,
      url: `https://${host}/v1/projects/${project}/locations/${location}/publishers/google/models/${model}:generateContent`,
    };
  }
  const apiKey = process.env.GOOGLE_API_KEY;
  if (requireEnv && !apiKey) {
    fail('Google credentials missing. Set VERTEX_CREDENTIALS_FILE + VERTEXAI_PROJECT (Vertex AI) or GOOGLE_API_KEY (Gemini Developer API).');
  }
  return {
    mode: 'devapi', apiKey, host: 'generativelanguage.googleapis.com',
    url: `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
  };
}

// Flat-background prompt: the style sentence asks for "transparent"; swap that for magenta so the model is not confused.
function googlePrompt(prompt, keyed = true) {
  if (!keyed) return prompt; // full-frame backdrop: keep the original prompt, no magenta
  const swapped = prompt
    .replace('centered on a transparent background', 'centered')
    .replace('on a 1024x1024 transparent canvas', 'on a 1024x1024 canvas')
    .replace('No baked-in shadows, no ground, no background.', 'No baked-in shadows, no ground.')
    .replace(/\(transparent\)/g, '(plain magenta background)');
  return `${swapped.replace(/\.$/, '')}, ${MAGENTA_SUFFIX}.`;
}

// ---- Generation ------------------------------------------------------------

async function generateOpenAI(asset, opts, photo) {
  const key = process.env.OPENAI_API_KEY;
  const size = asset.size ?? '1024x1024';
  const auth = { Authorization: `Bearer ${key}` };
  let json;
  if (asset.usesDogReference && photo) {
    // FormData is rebuilt per attempt so the body is never reused.
    const makeInit = () => {
      const form = new FormData();
      form.append('model', opts.model);
      form.append('image[]', new Blob([photo.bytes], { type: photo.mime }), photo.name);
      form.append('prompt', asset.prompt);
      form.append('size', size);
      form.append('quality', opts.quality);
      form.append('background', 'transparent');
      form.append('output_format', 'png');
      form.append('input_fidelity', opts.fidelity);
      return { method: 'POST', headers: auth, body: form };
    };
    json = await request(makeInit, `${OPENAI_API}/edits`);
  } else {
    const body = JSON.stringify({
      model: opts.model, prompt: asset.prompt, size, quality: opts.quality,
      background: 'transparent', output_format: 'png', n: 1,
    });
    json = await request(
      () => ({ method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body }),
      `${OPENAI_API}/generations`,
    );
  }
  const b64 = json?.data?.[0]?.b64_json;
  if (!b64) throw new Error('No data[0].b64_json in response');
  return Buffer.from(b64, 'base64');
}

async function generateGoogle(asset, opts, photo) {
  const target = googleTarget(opts.model, { requireEnv: true });
  const parts = [{ text: googlePrompt(asset.prompt, asset.keyed !== false) }];
  if (asset.usesDogReference && photo) {
    parts.push({ inlineData: { mimeType: photo.mime, data: photo.bytes.toString('base64') } });
  }
  const body = JSON.stringify({
    contents: [{ role: 'user', parts }],
    generationConfig: {
      responseModalities: ['IMAGE'],
      imageConfig: { aspectRatio: asset.size === '1536x1024' ? '3:2' : '1:1' },
    },
  });
  const headers = { 'Content-Type': 'application/json' };
  if (target.mode === 'devapi') headers['x-goog-api-key'] = target.apiKey;
  if (target.mode === 'vertex') headers.Authorization = `Bearer ${await getVertexToken(target.credsFile)}`;
  const json = await request(() => ({ method: 'POST', headers, body }), target.url);

  const resParts = json?.candidates?.[0]?.content?.parts ?? [];
  const img = resParts.find((p) => p.inlineData?.data);
  if (!img) {
    const reason = json?.candidates?.[0]?.finishReason ?? json?.promptFeedback?.blockReason ?? 'no image part';
    throw new Error(`No inlineData image in response (${reason})`);
  }
  const mime = img.inlineData.mimeType ?? '';
  if (mime && mime !== 'image/png') {
    throw new Error(`Model returned ${mime}; only PNG can be chroma-keyed. Re-run, or use --provider openai.`);
  }
  const png = Buffer.from(img.inlineData.data, 'base64');
  if (opts.keepBg || asset.keyed === false) return png;
  return encodePng(chromaKeyMagenta(decodePng(png)));
}

async function generate(asset, opts, photo) {
  const png = opts.provider === 'google' ? await generateGoogle(asset, opts, photo) : await generateOpenAI(asset, opts, photo);
  const outDir = join(ROOT, asset.dir);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, asset.file), png);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  let list = ASSETS;
  if (opts.group) list = list.filter((a) => a.group === opts.group);
  if (opts.only.length) list = list.filter((a) => opts.only.some((s) => a.file.includes(s)));
  if (!list.length) fail('No assets match the filters');

  if (opts.dryRun) {
    const host = opts.provider === 'google' ? googleTarget(opts.model, { requireEnv: false }).host : 'api.openai.com';
    console.log(`Provider: ${opts.provider}  Model: ${opts.model}  Endpoint host: ${host}\n`);
    for (const a of list) {
      const ref = a.usesDogReference && opts.dogPhoto;
      const mode = opts.provider === 'openai' ? (ref ? 'edits' : 'generations') : ref ? 'with photo' : 'text only';
      const prompt = opts.provider === 'google' ? googlePrompt(a.prompt, a.keyed !== false) : a.prompt;
      console.log(`--- ${a.dir}/${a.file} [${a.group}, ${a.size ?? '1024x1024'}, ${mode}]\n${prompt}\n`);
    }
    console.log(`Dry run: ${list.length} assets (no API calls).`);
    return;
  }

  if (opts.provider === 'openai') {
    if (!process.env.OPENAI_API_KEY) fail('OPENAI_API_KEY is not set. Run: OPENAI_API_KEY=sk-... node scripts/generateArt.mjs --provider openai');
  } else {
    googleTarget(opts.model, { requireEnv: true }); // fails early with a clear message
  }

  let photo = null;
  if (opts.dogPhoto) {
    const ext = extname(opts.dogPhoto).toLowerCase();
    if (!MIME[ext]) fail('--dog-photo must be .jpg, .jpeg, .png or .webp');
    if (!existsSync(opts.dogPhoto)) fail(`Dog photo not found: ${opts.dogPhoto}`);
    photo = { bytes: readFileSync(opts.dogPhoto), mime: MIME[ext], name: basename(opts.dogPhoto) };
  }
  if (!photo && list.some((a) => a.usesDogReference)) {
    console.warn('Warning: no --dog-photo; buddy parts will not match your dog or each other. Pass --dog-photo for consistent parts.');
  }

  const queue = [];
  let skipped = 0;
  for (const a of list) {
    if (!opts.force && existsSync(join(ROOT, a.dir, a.file))) {
      skipped++;
      console.log(`- ${a.dir}/${a.file} (exists, skipped)`);
    } else queue.push(a);
  }

  let ok = 0;
  let failed = 0;
  const worker = async () => {
    while (queue.length) {
      const a = queue.shift();
      const t0 = Date.now();
      try {
        await generate(a, opts, photo);
        ok++;
        console.log(`✓ ${a.dir}/${a.file} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
      } catch (e) {
        failed++;
        console.log(`✗ ${a.dir}/${a.file} ${e.message}`);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(opts.concurrency, queue.length) }, worker));

  console.log(`\nDone: ${ok} generated, ${skipped} skipped, ${failed} failed.`);
  if (opts.provider === 'openai') {
    console.log(`Rough cost: ~$${(ok * COST[opts.quality]).toFixed(2)} at ${opts.quality} (approximate: medium ~$0.04/img, high ~$0.17/img at 1024x1024; 1536x1024 costs more).`);
  } else {
    console.log('Cost: Google image pricing varies by model and region; check your billing console (not estimated here).');
  }
  if (ok) console.log('Next: add require() lines to src/art/artAssets.ts; assets/buddy goes through the image skin.');
  if (failed) process.exit(1);
}

main().catch((e) => fail(e.message));
