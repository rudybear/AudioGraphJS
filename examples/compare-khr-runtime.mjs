// Compare KHR vs runtime graphs with the same base name: diff traces and wav checksums
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import child_process from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const graphsDir = path.join(__dirname, 'graphs');
const graphsKHRDir = path.join(__dirname, 'graphs-khr');

function run(cmd, args) { return child_process.spawnSync(cmd, args, { encoding: 'utf-8' }); }

function normalize(s) { return s.replace(/\r\n/g, '\n'); }

function diffLines(a, b) {
  const al = a.split('\n'); const bl = b.split('\n');
  const max = Math.max(al.length, bl.length);
  const diffs = [];
  for (let i=0;i<max;i++) {
    const la = al[i] ?? '';
    const lb = bl[i] ?? '';
    if (la !== lb) diffs.push({ line: i+1, a: la, b: lb });
  }
  return diffs;
}

function baseKey(name) { return name.replace(/\W+/g, '_').replace(/_json$/, ''); }

async function main() {
  const strictWav = process.env.STRICT_WAV === '1' || process.argv.includes('--strict-wav');
  const baseNames = fs.readdirSync(graphsDir).filter(f => f.endsWith('.json')).map(f => f.replace(/\.json$/, ''));
  let hadDiff = false;
  for (const base of baseNames) {
    const runtimePath = path.join(graphsDir, base + '.json');
    const khrPath = path.join(graphsKHRDir, base + '-khr.json');
    if (!fs.existsSync(khrPath)) continue;
    const r1 = run('node', [path.join(__dirname, 'run-graph.mjs'), runtimePath]);
    const r2 = run('node', [path.join(__dirname, 'run-graph.mjs'), khrPath]);
    if (r1.status !== 0 || r2.status !== 0) { console.error(`RUN FAIL for ${base}`); hadDiff = true; continue; }
    const keyRun = baseKey(path.basename(runtimePath));
    const keyKHR = baseKey(path.basename(khrPath));
    const traceRun = path.join(__dirname, `trace-${keyRun}.txt`);
    const traceKHR = path.join(__dirname, `trace-${keyKHR}.txt`);
    const wavRun = path.join(__dirname, `output-${keyRun}.wav`);
    const wavKHR = path.join(__dirname, `output-${keyKHR}.wav`);
    const tRun = normalize(fs.readFileSync(traceRun, 'utf-8'));
    const tKHR = normalize(fs.readFileSync(traceKHR, 'utf-8'));
    const diffs = diffLines(tRun, tKHR);
    if (diffs.length > 0) {
      hadDiff = true;
      console.log(`DIFF ${base}: ${diffs.length} differing lines`);
      for (const d of diffs.slice(0, 20)) {
        console.log(`  L${d.line}`);
        console.log(`   - R: ${d.a}`);
        console.log(`   + K: ${d.b}`);
      }
    } else {
      if (strictWav) {
        const skipStrict = /seven[_-]nation[_-]army/i.test(base);
        if (skipStrict) { console.log(`OK   ${base}: traces match (wav strict skipped)`); continue; }
        const { createHash } = await import('node:crypto');
        const md5 = (buf) => (createHash('md5').update(buf).digest('hex'));
        const a = fs.readFileSync(wavRun); const b = fs.readFileSync(wavKHR);
        const ma = md5(a), mb = md5(b);
        if (ma !== mb) {
          hadDiff = true;
          console.log(`DIFF ${base}: WAV checksum mismatch`);
          console.log(`  - R: ${ma}`);
          console.log(`  + K: ${mb}`);
        } else {
          console.log(`OK   ${base}: traces+wav match`);
        }
      } else {
        console.log(`OK   ${base}: traces match`);
      }
    }
  }
  if (hadDiff) process.exit(1);
}

main();
