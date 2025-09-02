# Next Session Notes — KHR_audio_graph

Scope for continuation
- Add per-node “Web Audio Mapping” notes in README (gain, delay, filters, waveshaper, reverb) using `docs/spec-sync/PROPOSED_TEXT_UPDATES.md` as source.
- Tighten README: dedupe any remaining repeated sections, ensure Listener and animation guidance are crisp and non‑conflicting.

Validation/Lint
- Extend `tools/spec-validate/validate.mjs` with:
  - DAG cycle detection for each graph.
  - Arity checks: splitter 1→N, channelmerger N→1, mixers as declared.
  - Verify sink invariant: at least one emitter or non‑empty `outputs[]` (already present).

Examples/Coverage
- Expand validator examples to cover each node kind at least once.
- Add an example with multiple outputs and one with a splitter/merger chain.

Schemas (polish)
- Quick pass for titles/descriptions consistency; ensure units (ms vs Hz) are explicit in descriptions.
- Confirm `emitter.spatialProperties` optionality for `global` vs required for `spatial` in text (schema may remain permissive for now).

Runtime alignment
- Confirm `examples/parse-gltf.mjs` reads `audioData[]` + `graphs[]` and applies ms→s conversions uniformly.

Housekeeping
- After review, commit changes with clear messages per area (README, schemas, validator/examples).

