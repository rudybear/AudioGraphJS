import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const specRoot = path.resolve(__dirname, '../../spec-repo/extensions/2.0/Khronos/KHR_audio_graph/schema');

if (!fs.existsSync(specRoot)) {
  console.error(
    `spec-repo schemas not found at ${specRoot}\n` +
    `Fetch them with:\n` +
    `  git clone --depth 1 --branch KHR_audio_graph https://github.com/rudybear/glTF.git spec-repo`,
  );
  process.exit(1);
}

function loadSchemas(dir) {
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.schema.json'));
  const schemas = {};
  for (const f of files) {
    const full = path.join(dir, f);
    const text = fs.readFileSync(full, 'utf-8').trim();
    if (!text) { console.warn(`Skipping empty schema: ${f}`); continue; }
    try {
      const json = JSON.parse(text);
      schemas[f] = json;
    } catch (e) {
      console.warn(`Skipping invalid JSON schema ${f}: ${e.message}`);
    }
  }
  return schemas;
}

function main() {
  const ajv = new Ajv({ allErrors: true, strict: false, validateSchema: false });
  const schemas = loadSchemas(specRoot);
  // Add common glTF base refs if present in this folder or parent
  for (const [name, schema] of Object.entries(schemas)) {
    ajv.addSchema(schema, name);
  }
  // Provide permissive stubs for base glTF refs if not present
  if (!ajv.getSchema('glTFProperty.schema.json')) {
    ajv.addSchema({ "$id": "glTFProperty.schema.json", "type": "object", "additionalProperties": true }, 'glTFProperty.schema.json');
  }
  if (!ajv.getSchema('glTFid.schema.json')) {
    ajv.addSchema({ "$id": "glTFid.schema.json", "type": "integer", "minimum": 0 }, 'glTFid.schema.json');
  }

  // Example param instances to validate against the per-kind schemas
  // (current layered model: seconds, string enums, no source/emitter/reverb kinds).
  const examples = [
    { file: 'gain.example.json', schema: 'KHR_audio_graph.gain.schema.json', data: { gain: 0.5, interpolation: 'linear', duration: 0.1 } },
    { file: 'delay.example.json', schema: 'KHR_audio_graph.delay.schema.json', data: { delayTime: 0.12, maxDelayTime: 1.0 } },
    { file: 'oscillator.example.json', schema: 'KHR_audio_graph.oscillator.schema.json', data: { type: 'square', frequency: 440, pulseWidth: 0.25 } },
    { file: 'lowpass.example.json', schema: 'KHR_audio_graph.lowpass.schema.json', data: { frequency: 800, qualityFactor: 0.707 } },
    { file: 'waveshaper.example.json', schema: 'KHR_audio_graph.waveshaper.schema.json', data: { amount: 0.7, oversample: '2x' } },
    { file: 'splitter.example.json', schema: 'KHR_audio_graph.splitter.schema.json', data: { channelInterpretation: 'discrete' } }
  ];
  let ok = true;
  // Graph-level extension instance + linter
  const graphSchemaName = 'glTF.KHR_audio_graph.schema.json';
  const graphSchemaText = fs.readFileSync(path.join(specRoot, graphSchemaName), 'utf-8').trim();
  if (graphSchemaText) {
    const graphSchema = JSON.parse(graphSchemaText);
    const vGraph = ajv.getSchema(graphSchemaName) || (ajv.addSchema(graphSchema, graphSchemaName), ajv.getSchema(graphSchemaName));
    const graphData = JSON.parse(fs.readFileSync(path.join(__dirname, 'examples/graph.example.json'), 'utf-8'));
    const okGraph = vGraph(graphData);
    if (!okGraph) { ok = false; console.error('FAIL graph.example.json -> glTF.KHR_audio_graph.schema.json'); console.error(vGraph.errors); }
    else {
      console.log('OK   graph.example.json -> glTF.KHR_audio_graph.schema.json');
      // Linter (layered model): sink = outputs[] binding or terminal node
      // (rule 13: terminals route to the global destination); DAG; basic arities.
      for (const g of graphData.graphs || []) {
        const indeg = new Map(); const outdeg = new Map();
        const kinds = (g.nodes || []).map(n => n.kind);
        for (const [i, _] of (g.nodes || []).entries()) { indeg.set(i, 0); outdeg.set(i, 0); }
        for (const c of g.connections || []) { indeg.set(c.to.node, (indeg.get(c.to.node)||0)+1); outdeg.set(c.from.node, (outdeg.get(c.from.node)||0)+1); }
        const hasSink = (Array.isArray(g.outputs) && g.outputs.length > 0)
          || kinds.some((_, i) => (outdeg.get(i) || 0) === 0);
        if (!hasSink) { ok = false; console.error('LINT: graph must have at least one sink (outputs[] binding or terminal node)'); }
        // DAG check
        const adj = new Map();
        for (let i=0;i<kinds.length;i++) adj.set(i, []);
        for (const c of g.connections || []) { (adj.get(c.from.node) || []).push(c.to.node); }
        const temp = new Set(); const perm = new Set();
        function visit(v){ if (perm.has(v)) return false; if (temp.has(v)) return true; temp.add(v); for(const w of adj.get(v)||[]){ if(visit(w)) return true;} temp.delete(v); perm.add(v); return false; }
        for (let i=0;i<kinds.length;i++) { if (!perm.has(i)) { if (visit(i)) { ok=false; console.error('LINT: graph contains a cycle (must be DAG)'); break; } } }
        // Basic arity checks (outputs[] entries are {node, output, emitter} objects)
        const outputsSet = new Set((Array.isArray(g.outputs) ? g.outputs : []).map(o => (typeof o === 'object' ? o.node : o)));
        for (let i=0;i<kinds.length;i++) {
          const inD = indeg.get(i)||0, outD = outdeg.get(i)||0;
          switch (kinds[i]) {
            case 'splitter': if (inD !== 1) { ok=false; console.error(`LINT: splitter ${i} must have exactly 1 input`);} if (outD < 1) { ok=false; console.error(`LINT: splitter ${i} must have at least 1 output`);} break;
            case 'channelmerger': if (inD < 1) { ok=false; console.error(`LINT: channelmerger ${i} must have at least 1 input`);} if (!outputsSet.has(i) && outD !== 1) { ok=false; console.error(`LINT: channelmerger ${i} must have exactly 1 output`);} break;
            case 'channelmixer':
            case 'audiomixer': if (inD < 1) { ok=false; console.error(`LINT: ${kinds[i]} ${i} must have at least 1 input`);} if (!outputsSet.has(i) && outD !== 1) { ok=false; console.error(`LINT: ${kinds[i]} ${i} must have exactly 1 output`);} break;
          }
        }
      }
    }
  }

  for (const ex of examples) {
    const validate = ajv.getSchema(ex.schema) || ajv.compile(schemas[ex.schema]);
    const valid = validate(ex.data);
    if (!valid) {
      ok = false;
      console.error(`FAIL ${ex.file} -> ${ex.schema}`);
      console.error(validate.errors);
    } else {
      console.log(`OK   ${ex.file} -> ${ex.schema}`);
    }
  }
  if (!ok) process.exit(1);
}

main();
