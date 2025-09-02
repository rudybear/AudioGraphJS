import fs from 'node:fs';
import path from 'node:path';

function updateKHR(file) {
  const text = fs.readFileSync(file, 'utf-8');
  const json = JSON.parse(text);
  const ext = json.extensions && json.extensions.KHR_audio_graph;
  if (!ext || !Array.isArray(ext.graphs) || ext.graphs.length === 0) return false;
  let changed = false;
  for (const g of ext.graphs) {
    const nodes = g.nodes || [];
    const hasEmitter = nodes.some(n => n.kind === 'emitter');
    const outs = Array.isArray(g.outputs) ? g.outputs : [];
    if (!hasEmitter && outs.length === 1) {
      nodes.push({ label: 'emit', kind: 'emitter', params: { emitterType: 'global', gain: 1 } });
      g.connections = g.connections || [];
      g.connections.push({ from: { node: outs[0] }, to: { node: nodes.length - 1 } });
      delete g.outputs;
      g.nodes = nodes;
      changed = true;
    }
  }
  if (changed) fs.writeFileSync(file, JSON.stringify(json, null, 2));
  return changed;
}

function updateRuntime(file) {
  const text = fs.readFileSync(file, 'utf-8');
  const json = JSON.parse(text);
  if (!Array.isArray(json.nodes)) return false;
  const hasEmitter = json.nodes.some(n => n.kind === 'emitter');
  const outs = Array.isArray(json.outputs) ? json.outputs : [];
  if (!hasEmitter && outs.length === 1) {
    json.nodes.push({ id: 'emit', kind: 'emitter', params: { emitterType: 'global', gain: 1 } });
    json.connections = json.connections || [];
    json.connections.push({ from: { node: outs[0] }, to: { node: 'emit' } });
    delete json.outputs;
    fs.writeFileSync(file, JSON.stringify(json, null, 2));
    return true;
  }
  return false;
}

function main() {
  const khrDir = path.join(process.cwd(), 'examples/graphs-khr');
  const rtDir = path.join(process.cwd(), 'examples/graphs');
  let count = 0;
  for (const dir of [khrDir, rtDir]) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.json')) continue;
      const full = path.join(dir, f);
      const changed = dir.includes('graphs-khr') ? updateKHR(full) : updateRuntime(full);
      if (changed) count++;
    }
  }
  console.log(`Updated ${count} files.`);
}

main();

