# AudioGraphJS Runtime — Usage Notes

- GraphSpec
  - `nodes`: array of `{ id, kind, params }` using runtime kinds (e.g., `audio-buffer-source`, `oscillator`, `gain`, `biquad-filter`, `delay`, `convolver`, `stereo-panner`, `panner`, `channel-splitter`, `channel-merger`, `channel-mixer`, `audio-mixer`, `emitter`, `wave-shaper`).
  - `connections`: edges `{ from: { node, output? }, to: { node, input? } }`. Omitted `output`/`input` target the default port.
  - `outputs?`: optional list of node ids to be connected to the destination. This supports global (non‑spatial) sinks.

- Sinks
  - `emitter` nodes auto‑connect to the audio destination (1‑in/0‑out sink). Use emitters for spatialized playback; use `outputs[]` for global sinks.

- Time Units
  - Runtime node params use seconds for Web Audio API calls. When consuming KHR_audio_graph (ms), convert ms→s. See `examples/parse-gltf.mjs` for a mapper.

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
