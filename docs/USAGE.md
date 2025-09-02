# AudioGraphJS Runtime — Usage Notes

- GraphSpec
  - `nodes`: array of `{ id, kind, params }` using runtime kinds (e.g., `audio-buffer-source`, `oscillator`, `gain`, `biquad-filter`, `delay`, `convolver`, `stereo-panner`, `panner`, `channel-splitter`, `channel-merger`, `channel-mixer`, `audio-mixer`, `emitter`, `wave-shaper`).
  - `connections`: edges `{ from: { node, output? }, to: { node, input? } }`. Omitted `output`/`input` target the default port.
  - `outputs?`: optional list of node ids to be connected to the destination. This supports global (non‑spatial) sinks.

- Sinks
  - Prefer `emitter` nodes as sinks: they auto‑connect to the destination (1‑in/0‑out). For global (non‑spatial) sinks, use a global emitter (emitterType: "global") instead of `outputs[]`.
  - Migration helper: `node tools/update-emitters.mjs` converts graphs with a single `outputs[]` entry into a global emitter sink (preserves connections). Use with care for multi‑output graphs.

- Time Units
  - Runtime node params use seconds for Web Audio API calls. When consuming KHR_audio_graph (ms), convert ms→s. See `examples/parse-gltf.mjs` for a mapper.
  - Deterministic noise: the runner synthesizes noise using a seeded PRNG derived from the file name (seedBase). KHR `audioData` may use `GENERATE_NOISE:seconds:amp` which the runner maps to a deterministic data URI, ensuring strict WAV comparisons when desired.

- Linting
  - Import `lintGraph` from the runtime and validate graphs before building:
    ```js
    import { lintGraph } from 'audio-graph-js';
    const { errors, warnings } = lintGraph(spec);
    if (errors.length) throw new Error(errors.join('\n'));
    ```
  - Checks: DAG (no cycles), sink presence (emitter or outputs[]), emitter degree (in=1, out=0), basic arity for splitter/merger/mixer.

- Spec Validation & glTF Validator (CLI)
  - Schema + lints for examples: `npm run spec:validate`
  - Validate real glTF files (only `extensions.KHR_audio_graph` is examined):
    - `npm run spec:validate:gltf path/to/scene.gltf [more.gltf]`
    - Prints JSON Schema errors and linter findings per file; ignores non‑audio parts of the glTF.

- Comparator strict mode
  - Compare KHR vs runtime pairs (traces only): `npm run example:compare-khr`
  - Strict WAV checksum: `npm run example:compare-khr:strict` (skips only complex `seven-nation-army` for now).

## Complex Graph
- Pattern: osc → lowpass → delay → (dry + convolver→wet) → audio-mixer → emitter (global sink)
- Purpose: demonstrates wet/dry routing, summed mixing, and a clear sink pattern.
- Examples:
  - Runtime: `examples/graphs/complex.json`
  - KHR: `examples/graphs-khr/complex-khr.json`

## Spatial Emitter Binding
- Bind emitters to glTF nodes via a node extension. A node may reference a single emitter id or an array of emitter ids.
- Scalar form:
  - `"extensions": { "KHR_audio_graph": { "emitter": <emitterId> } }`
- Array form:
  - `"extensions": { "KHR_audio_graph": { "emitters": [ <emitterId>, ... ] } }`
- Instance semantics:
  - Each glTF node creates one emitter instance per referenced emitter id, driven by that node’s transform (translation/rotation/scale).
  - Multiple nodes may reference the same emitter id; upstream graph routing is shared, and only the final spatial stage (panner + optional post‑panner gain) is instantiated per instance.

## Stereo Panner Approximation
- KHR currently has no native `stereo-panner` node. For parity, we approximate equal‑power panning using:
  - Split mono -> two gains -> merge to stereo.
  - For pan `x` in [-1, 1]:
    - Left gain `L = cos((x + 1) * π / 4)`
    - Right gain `R = sin((x + 1) * π / 4)`
- See `examples/graphs/stereo-panner.json` and `examples/graphs-khr/stereo-panner-khr.json`.
