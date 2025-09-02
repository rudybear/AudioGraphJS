# Next Session Notes — KHR_audio_graph

Scope for continuation
- Add per-node “Web Audio Mapping” notes in the spec README (gain, delay, filters, waveshaper, reverb) using `docs/spec-sync/PROPOSED_TEXT_UPDATES.md` as source.
- Tighten spec README: dedupe remaining repeated sections, ensure Listener and animation guidance are crisp and non‑conflicting.

Validation/Lint
- Runtime now includes `lintGraph` (DAG, sinks, emitter degree, basic arity). Optionally mirror these checks in `tools/spec-validate/validate.mjs`.

Examples/Coverage
- Added example: `examples/render-splitter-merger-mixer.mjs` (splitter→filters→merger→mixer).
- Expand validator examples to cover each node kind at least once.

Schemas (polish)
- Quick pass for titles/descriptions consistency; ensure units (ms vs Hz) are explicit in descriptions.
- Confirm `emitter.spatialProperties` optionality for `global` vs required for `spatial` in spec text (schema may remain permissive for now).

Runtime alignment
- Confirm `examples/parse-gltf.mjs` reads `audioData[]` + `graphs[]` and applies ms→s conversions uniformly (done for Source/Delay). Consider mapping for any additional time‑based params.

Housekeeping
- After review, commit changes with clear messages per area (README, schemas, validator/examples).

Notes
- Runtime GraphSpec supports optional `outputs[]` sink list; builders now auto‑connect those nodes to destination, in addition to auto‑connecting emitters.
