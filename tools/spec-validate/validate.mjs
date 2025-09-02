import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const specRoot = path.resolve(__dirname, '../../spec-repo/extensions/2.0/Khronos/KHR_audio_graph/schema');

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

  // Example instances to validate (node objects only for now)
  const examples = [
    { file: 'gain.example.json', schema: 'KHR_audio_graph.gain.schema.json', data: { id: 1, gain: 0.5 } },
    { file: 'delay.example.json', schema: 'KHR_audio_graph.delay.schema.json', data: { id: 2, delayTime: 120 } },
    { file: 'oscillator.example.json', schema: 'KHR_audio_graph.oscillator.schema.json', data: { id: 3, type: 1, frequency: 440, pulseWidth: 0.25 } },
    { file: 'reverb.example.json', schema: 'KHR_audio_graph.reverb.schema.json', data: { id: 4, impulse: 0, normalize: true } },
    { file: 'waveshaper.example.json', schema: 'KHR_audio_graph.waveshaper.schema.json', data: { id: 5, amount: 0.7, oversample: '2x' } },
    { file: 'source.example.json', schema: 'KHR_audio_graph.source.schema.json', data: { data: { audioData: 0 }, when: 0, loop: false } }
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
      // Linter: emitter in-degree=1; no emitter out-degree; must have sink (emitter or outputs)
      for (const g of graphData.graphs || []) {
        const indeg = new Map(); const outdeg = new Map();
        const kinds = (g.nodes || []).map(n => n.kind);
        for (const [i, _] of (g.nodes || []).entries()) { indeg.set(i, 0); outdeg.set(i, 0); }
        for (const c of g.connections || []) { indeg.set(c.to.node, (indeg.get(c.to.node)||0)+1); outdeg.set(c.from.node, (outdeg.get(c.from.node)||0)+1); }
        let hasSink = Array.isArray(g.outputs) && g.outputs.length > 0;
        for (let i=0;i<kinds.length;i++) {
          if (kinds[i] === 'emitter') {
            hasSink = true;
            if (indeg.get(i) !== 1) { ok = false; console.error(`LINT: emitter at index ${i} must have exactly 1 input`); }
            if ((outdeg.get(i)||0) !== 0) { ok = false; console.error(`LINT: emitter at index ${i} must have 0 outputs`); }
          }
        }
        if (!hasSink) { ok = false; console.error('LINT: graph must have at least one sink (emitter or outputs[])'); }
        // TODO: DAG check (skip in stub for brevity)
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
