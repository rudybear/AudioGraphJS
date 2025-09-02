Audio Graph JS — KHR_audio_graph Runtime (Node/Web)

**What It Is**
- **Runtime:** A minimal Web Audio–based runtime for graphs shaped like the glTF KHR_audio_graph proposal.
- **Parity tools:** Side‑by‑side runner + comparator to verify parity between native runtime GraphSpecs and KHR containers.
- **Emitters:** Placement‑agnostic emitters with instance expansion from glTF node bindings.

**Requirements**
- **Node.js:** 18+ (includes `globalThis.fetch`).
- Optional: macOS/Linux/Windows shell to run example scripts.

**Install & Build**
- Install deps: `npm install`
- TypeScript build: `npm run build`

**Quick Start: Run Examples**
- Render one example (writes WAV + trace): `npm run example:run-graph -- examples/graphs/osc.json`
- Run all core examples: `npm run examples`
- Compare KHR vs runtime graphs (traces only): `npm run example:compare-khr`
- Strict compare (traces + WAV checksums): `npm run example:compare-khr:strict`
  - Note: “seven-nation-army” WAV strict is intentionally skipped; traces still match.

**Emitter Instance Expansion**
- The base graph builds `emitter` nodes as shared input buses (no auto‑connect to destination).
- Instance expansion creates per‑instance panner and post‑gain, connecting bus → panner → gain → destination.
- Two ways to provide instances:
  - **glTF node bindings:** Attach `extensions.KHR_audio_graph = { emitter: <emitterId> }` or `{ emitters: [<id>, ...] }` to glTF nodes. The example runner extracts node T/R/S “as is” and expands instances at runtime.
  - **Runtime test harness:** Add a top‑level `__emitterInstances` to a runtime GraphSpec, e.g. `{ emitterNodeId: "emit", translation: [1,0,0] }`.

**Run The New Spatial Emitter Parity Example**
- Runtime graph with instance expansion hint: `node examples/run-graph.mjs examples/graphs/spatial-emitter-instanced.json`
- glTF + KHR graph with node binding: `node examples/run-graph.mjs examples/graphs-khr/spatial-emitter-instanced-khr.json`
- Comparator picks both up automatically.

**API Usage (Node)**
- Build a graph and apply instances programmatically:

```
import wae from 'web-audio-engine';
import { buildGraphAsync, applyEmitterInstances } from './dist/index.js';

const { OfflineAudioContext } = wae;
const spec = {
  nodes: [
    { id: 'src', kind: 'oscillator', params: { type: 'sine', frequency: 330, startTime: 0 } },
    { id: 'emit', kind: 'emitter', params: { emitterType: 'spatial', gain: 1 } },
  ],
  connections: [ { from: { node: 'src' }, to: { node: 'emit' } } ],
};

const sr = 48000;
const ctx = new OfflineAudioContext(2, sr * 2, sr);
const built = await buildGraphAsync(ctx, spec);

applyEmitterInstances(built, spec, [
  { emitterNodeId: 'emit', translation: [1, 0, 0] },
]);

const audioBuffer = await ctx.startRendering();
```

**glTF/KHR Mapping In Runner**
- The example runner (`examples/run-graph.mjs`) accepts either:
  - A runtime GraphSpec: `{ nodes, connections, outputs? }`
  - A glTF JSON with `extensions.KHR_audio_graph` container and optional node bindings (scalar `emitter` or array `emitters`).
- For mappings, it also:
  - Synthesizes deterministic noise or IR where needed to ensure parity.
  - Applies simple musical automation for select presets.

**Testing & Linting**
- Unit tests: `npm test`
- Graph lint: enforced by `buildGraph(Async)` usage in the runner; you can invoke `lintGraph(spec)` manually.

**Useful Scripts**
- `npm run spec:validate` — validate KHR graphs using the included schema and examples.
- `npm run spec:validate:gltf` — validate glTF examples.

**Notes**
- Listener design and KHR_animation_pointer integration are TODO (documented under `docs/` and spec repo notes).
- Stereo panner uses an approximation in this runtime; parity tests account for it.

**Where Things Live**
- Runtime code: `src/runtime`, nodes under `src/nodes`.
- Examples and tools: `examples/*`, `tools/*`.
- Doc updates: `docs/USAGE.md`, `docs/PLAN_AND_STATUS.md`, `docs/STATE_OF_PROJECT.md`.
