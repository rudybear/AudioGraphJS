// Run all graphs in examples/graphs and compare traces and optional md5 checksums
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import child_process from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const graphsDir = path.join(__dirname, 'graphs');
const expectedDir = path.join(__dirname, 'expected');

function run(cmd, args) {
  return child_process.spawnSync(cmd, args, { stdio: 'inherit' });
}

function read(p) { return fs.readFileSync(p, 'utf-8').replace(/\r\n/g, '\n'); }

async function main() {
  if (!fs.existsSync(expectedDir)) fs.mkdirSync(expectedDir);
  const files = fs.readdirSync(graphsDir).filter((f) => f.endsWith('.json'));
  let failed = false;
  for (const f of files) {
    const full = path.join(graphsDir, f);
    const baseKey = f.replace(/\W+/g, '_').replace(/_json$/, '');
    const outTrace = path.join(__dirname, `trace-${baseKey}.txt`);
    const outWav = path.join(__dirname, `output-${baseKey}.wav`);
    const expTrace = path.join(expectedDir, `trace-${baseKey}.txt`);
    const expMd5 = path.join(expectedDir, `checksum-${baseKey}.md5`);

    const r = run('node', [path.join(__dirname, 'run-graph.mjs'), full]);
    if (r.status !== 0) { failed = true; continue; }

    if (fs.existsSync(expTrace)) {
      const got = read(outTrace);
      const exp = read(expTrace);
      if (got !== exp) { console.error(`DIFF trace for ${f}`); failed = true; }
    } else {
      // Establish baseline
      fs.copyFileSync(outTrace, expTrace);
      console.log(`WROTE baseline trace: ${path.basename(expTrace)}`);
    }

    if (fs.existsSync(expMd5)) {
      const gotMd5 = (await import('node:crypto')).createHash('md5').update(fs.readFileSync(outWav)).digest('hex');
      const expMd5Str = read(expMd5).trim();
      if (gotMd5 !== expMd5Str) console.warn(`WARN checksum mismatch for ${f} (non-fatal)`);
    } else {
      const sum = (await import('node:crypto')).createHash('md5').update(fs.readFileSync(outWav)).digest('hex');
      fs.writeFileSync(expMd5, sum + '\n');
      console.log(`WROTE baseline checksum: ${path.basename(expMd5)}`);
    }
  }
  if (failed) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
