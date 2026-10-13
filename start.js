'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const { spawn } = require('child_process');

const RELEASE_PUBLIC_KEY = 'MCowBQYDK2VwAyEAuS8WHN70G5zPB+uptAXRoxmupdFqT3efGASZ5qhW3l4=';
const RELEASES_BASE = (process.env.TH_RELEASES_BASE || 'https://github.com/Abs0lw3nt/TrilogyHub-Releases/releases').replace(/\/+$/, '');
const DEFAULT_API = 'https://trilogy-hub.com/_mp-api';
const PLATFORMS = {
  win32: { binary: 'TrilogyHubServer.exe', channel: 'exe' },
  linux: { binary: 'TrilogyHubServer', channel: 'linux' },
};
const DIR = __dirname;
const MAX_MANIFEST_BYTES = 64 * 1024;
const MAX_PACKAGE_BYTES = 200 * 1024 * 1024;
const NAME_RE = /^[A-Za-z0-9._-]{1,128}$/;
const MAGIC = Buffer.from('THPKG1\n');

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

function log(text) {
  console.log(`[start] ${text}`);
}

// adres API jest wbudowany - server-config.json go nie zmienia (TH_RELEASES_API tylko dla testow; wydania i tak sa podpisane)
function apiBase() {
  return (process.env.TH_RELEASES_API || DEFAULT_API).replace(/\/+$/, '');
}

function signedPayload(m) {
  return Buffer.from([
    'THRUNTIME1', String(m.version), String(m.channel || 'stable'), String(m.file),
    String(m.sha256), String(m.size), String(m.min_node || ''),
  ].join('\n'), 'utf8');
}

function verify(m, channel) {
  if (!m || typeof m !== 'object' || Array.isArray(m)) return 'brak manifestu';
  if (!/^[0-9]{1,6}(\.[0-9]{1,6}){1,3}$/.test(String(m.version))) return 'zla wersja';
  if (!/^[0-9a-f]{64}$/.test(String(m.sha256))) return 'zly sha256';
  if (!Number.isInteger(m.size) || m.size <= 0 || m.size > MAX_PACKAGE_BYTES) return 'zly rozmiar';
  if (!NAME_RE.test(String(m.file))) return 'zla nazwa pliku';
  const key = crypto.createPublicKey({ key: Buffer.from(RELEASE_PUBLIC_KEY, 'base64'), format: 'der', type: 'spki' });
  let ok = false;
  try { ok = crypto.verify(null, signedPayload(m), key, Buffer.from(String(m.signature || ''), 'base64')); } catch (_) { ok = false; }
  if (!ok) return 'PODPIS NIEPRAWIDLOWY';
  if (String(m.channel) !== channel) return `wydanie z kanalu "${m.channel}", a potrzebny "${channel}"`;
  return null;
}

async function readLimited(res, limit) {
  const declared = Number(res.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > limit) throw new Error('odpowiedz za duza');
  const chunks = [];
  let total = 0;
  if (res.body) {
    for await (const chunk of res.body) {
      total += chunk.length;
      if (total > limit) throw new Error('odpowiedz za duza');
      chunks.push(Buffer.from(chunk));
    }
  }
  return Buffer.concat(chunks, total);
}

async function getJson(url) {
  const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(20000) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return JSON.parse((await readLimited(res, MAX_MANIFEST_BYTES)).toString('utf8'));
}

async function sources(channel) {
  const out = [];
  const errors = [];
  try {
    const m = await getJson(`${RELEASES_BASE}/latest/download/latest-${channel}.json`);
    if (m && /^[A-Za-z0-9._-]{1,64}$/.test(String(m.tag || ''))) {
      out.push({ manifest: m, url: `${RELEASES_BASE}/download/${encodeURIComponent(m.tag)}/${encodeURIComponent(m.file)}`, from: 'GitHub' });
    } else {
      errors.push('GitHub: brak wydania');
    }
  } catch (err) {
    errors.push(`GitHub: ${err.message}`);
  }
  const api = apiBase();
  try {
    const data = await getJson(`${api}/endpoints/runtime/latest.php?channel=${encodeURIComponent(channel)}`);
    if (data && data.release) {
      out.push({ manifest: data.release, url: `${api}/endpoints/runtime/download.php?version=${encodeURIComponent(data.release.version)}&channel=${encodeURIComponent(channel)}`, from: 'API' });
    }
  } catch (err) {
    errors.push(`API: ${err.message}`);
  }
  return { out, errors };
}

function unpackSingle(gz, name) {
  const raw = zlib.gunzipSync(gz, { maxOutputLength: MAX_PACKAGE_BYTES * 4 });
  if (raw.length < MAGIC.length + 4 || !raw.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error('to nie jest paczka serwera');
  const headerLen = raw.readUInt32BE(MAGIC.length);
  let offset = MAGIC.length + 4;
  if (offset + headerLen > raw.length) throw new Error('uszkodzona paczka');
  const header = JSON.parse(raw.subarray(offset, offset + headerLen).toString('utf8'));
  offset += headerLen;
  if (!header || !Array.isArray(header.files) || header.files.length !== 1) throw new Error('paczka nie zawiera jednej binarki');
  const f = header.files[0];
  if (f.path !== name || !Number.isInteger(f.size) || offset + f.size !== raw.length) throw new Error(`paczka nie zawiera ${name}`);
  const body = raw.subarray(offset, offset + f.size);
  if (sha256(body) !== f.sha256) throw new Error('suma kontrolna binarki sie nie zgadza');
  return Buffer.from(body);
}

async function download(platform) {
  const { out, errors } = await sources(platform.channel);
  for (const s of out) {
    const problem = verify(s.manifest, platform.channel);
    if (problem) { errors.push(`${s.from}: ${problem}`); continue; }
    try {
      const res = await fetch(s.url, { redirect: 'follow', signal: AbortSignal.timeout(15 * 60 * 1000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const pkg = await readLimited(res, s.manifest.size);
      if (pkg.length !== s.manifest.size || sha256(pkg) !== s.manifest.sha256) throw new Error('paczka nie zgadza sie z podpisanym manifestem');
      const body = unpackSingle(pkg, platform.binary);
      const target = path.join(DIR, platform.binary);
      const tmp = `${target}.download`;
      fs.writeFileSync(tmp, body, { mode: 0o755 });
      if (process.platform !== 'win32') fs.chmodSync(tmp, 0o755);
      fs.renameSync(tmp, target);
      log(`pobrano serwer ${s.manifest.version} (${s.from}), podpis i suma sprawdzone`);
      return target;
    } catch (err) {
      errors.push(`${s.from}: ${err.message}`);
    }
  }
  throw new Error(`nie udalo sie pobrac serwera - ${errors.join('; ')}`);
}

function run(binary) {
  const child = spawn(binary, process.argv.slice(2), { cwd: DIR, stdio: 'inherit', env: process.env });
  const forward = (sig) => () => { try { child.kill(sig); } catch (_) { } };
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGQUIT']) {
    try { process.on(sig, forward(sig)); } catch (_) { }
  }
  child.on('error', (err) => {
    console.error(`[start] nie mozna uruchomic ${path.basename(binary)}: ${err.message}`);
    console.error('[start] usun ten plik - przy nastepnym starcie zostanie pobrany ponownie.');
    process.exit(1);
  });
  child.on('exit', (code, signal) => {
    if (code !== null) process.exit(code);
    const n = signal && require('os').constants.signals[signal];
    process.exit(n ? 128 + n : 1);
  });
}

// Zmienne z panelu hostingu (np. Pterodactyl) nadpisuja server-config.json przed startem; puste = bez zmian.
const ENV_CONFIG = [['TH_PORT', 'port', true], ['TH_MAX_SLOTS', 'max_slots', true], ['TH_SERVER_KEY', 'server_key', false]];

function applyEnv() {
  const set = {};
  for (const [name, key, numeric] of ENV_CONFIG) {
    const raw = String(process.env[name] || '').trim();
    if (!raw) continue;
    if (numeric) {
      const n = Number(raw);
      if (!Number.isInteger(n) || n < 1 || n > 65535) { log(`pomijam ${name}=${raw} - to nie jest liczba 1-65535`); continue; }
      set[key] = n;
    } else {
      set[key] = raw;
    }
  }
  if (Object.keys(set).length === 0) return;
  const file = path.join(DIR, 'server-config.json');
  let config = { title: 'Trilogy Hub Server', port: 7777, max_slots: 32 };
  if (fs.existsSync(file)) {
    try { config = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (err) { throw new Error(`server-config.json jest uszkodzony: ${err.message}`); }
  }
  const changed = Object.keys(set).filter((k) => config[k] !== set[k]);
  if (changed.length === 0) return;
  for (const k of changed) config[k] = set[k];
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(config, null, 2), 'utf8');
  fs.renameSync(tmp, file);
  log(`server-config.json: z panelu ustawiono ${changed.join(', ')}`);
}

async function main() {
  if (typeof fetch !== 'function' || typeof AbortSignal.timeout !== 'function') throw new Error(`wymagany Node.js 18 lub nowszy (jest ${process.version})`);
  applyEnv();
  const platform = PLATFORMS[process.platform];
  if (!platform || process.arch !== 'x64') throw new Error(`nieobslugiwany system: ${process.platform}/${process.arch} (wymagany Windows albo Linux x64)`);
  const binary = path.join(DIR, platform.binary);
  if (!fs.existsSync(binary)) {
    log(`brak ${platform.binary} - pobieram najnowszy serwer`);
    await download(platform);
  }
  run(binary);
}

main().catch((err) => {
  console.error(`[start] BLAD: ${err.message}`);
  // Bez process.exit(): wyjscie w trakcie zamykania polaczen fetch wywraca Node na Windows (asercja libuv UV_HANDLE_CLOSING).
  process.exitCode = 1;
});
