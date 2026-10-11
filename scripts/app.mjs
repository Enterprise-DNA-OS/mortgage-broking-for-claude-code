// npm run app: reads the database through the CLI's own --json output and opens the read-only app.
//   npm run app                  build app/data.js and open app/index.html in the browser
//   npm run app -- --no-open     build only
//   npm run app -- --out=site    also copy the finished app to a folder you can host (it holds your data)
// The app only shows. Every change is made by asking Claude Code, which runs the CLI.

import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from './lib/db.mjs';

const args = process.argv.slice(2);
const flag = (name) => args.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
const appDir = path.join(REPO_ROOT, 'app');
const { cli, sources } = JSON.parse(readFileSync(path.join(appDir, 'sources.json'), 'utf8'));

function run(cmd) {
  const res = spawnSync(process.execPath, [path.join(REPO_ROOT, cli), ...cmd, '--json'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (res.status !== 0) throw new Error(`${cmd.join(' ')} failed:\n${res.stderr || res.stdout}`);
  const out = res.stdout;
  const start = out.search(/[[{]/);
  if (start < 0) throw new Error(`${cmd.join(' ')} printed no JSON`);
  return JSON.parse(out.slice(start));
}

const data = {};
for (const [key, cmd] of Object.entries(sources)) {
  process.stdout.write(`app: ${key.padEnd(14)}`);
  data[key] = run(cmd);
  console.log(Array.isArray(data[key]) ? `${data[key].length} rows` : 'ok');
}

const brandFile = path.join(REPO_ROOT, 'brand.json');
data.brand = existsSync(brandFile) ? JSON.parse(readFileSync(brandFile, 'utf8')) : {};
const now = new Date();
data.generated_at = now.toISOString();
data.today = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

writeFileSync(path.join(appDir, 'data.js'), `// Written by npm run app. Your records: do not commit or publish.\nwindow.DATA = ${JSON.stringify(data)};\n`);
console.log(`app: wrote app/data.js`);

const out = flag('out');
if (out) {
  const dir = path.resolve(REPO_ROOT, out.split('=')[1] || 'site');
  mkdirSync(dir, { recursive: true });
  for (const f of ['index.html', 'app.css', 'engine.js', 'config.js', 'data.js']) cpSync(path.join(appDir, f), path.join(dir, f));
  console.log(`app: copied to ${dir} (it contains your data)`);
}

const page = path.join(appDir, 'index.html');
if (!flag('no-open')) {
  const opener = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', page]] : process.platform === 'darwin' ? ['open', [page]] : ['xdg-open', [page]];
  spawnSync(opener[0], opener[1], { stdio: 'ignore' });
}
console.log(`app: open ${page}`);
