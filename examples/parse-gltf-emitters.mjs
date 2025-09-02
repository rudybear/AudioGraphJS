// Demonstrate extracting emitter bindings (node extensions) from a glTF JSON
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractEmitterBindings } from '../dist/serialization/gltf-emitters.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function readJson(p) { return JSON.parse(fs.readFileSync(p, 'utf-8')); }

function main() {
  const file = process.argv[2];
  if (!file) { console.log('Usage: node examples/parse-gltf-emitters.mjs <file.gltf>'); process.exit(1); }
  const gltf = readJson(path.resolve(file));
  const bindings = extractEmitterBindings(gltf);
  console.log('Emitter bindings:');
  for (const b of bindings) {
    console.log(JSON.stringify(b));
  }
}

main();

