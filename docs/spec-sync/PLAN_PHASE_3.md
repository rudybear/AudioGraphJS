# Phase 3 — Schemas & Graph (Agreed)

Agreements
- Timing: All node timing fields use milliseconds (ms) in the spec/schemas; runtime maps ms→seconds for Web Audio.
- WaveShaper added; Pitch Shifter removed. Reverb simplified to IR-based Convolver (impulse + normalize). Listener preserved (outside graph).
- Graph nodes use a discriminator: `{ kind: <enum>, params: <node-schema>, label?: string }`.
- Source nodes are 0 in / 1 out with `params.data` as `oneOf`:
  - `{ audioData: <glTFid> }` (index into extension root `audioData[]`)
  - `{ oscillator: <oscillator params> }`
  Source-level playback fields (when/offset/duration/loop/playbackSpeed/gain) remain at Source level in ms.
- Connections reference node indices (glTF-style): `{ from: { node, output? }, to: { node, input? } }`.
- Node-level numeric "id" fields are deprecated across node schemas; optional string `label` at graph node level for debug.
- Emitter remains a graph sink (1 in / 0 out); Listener is not a graph node (0/0), enforced via per-node extension and linter rules.
- Validation: JSON Schemas validate structure + params; a linter (documented in spec) enforces DAG, emitter single input, scene contains a single listener, etc.

Tasks
1) Update Source schema to make `data` a oneOf `{ audioData: glTFid } | { oscillator: oscillator params }` and ensure all Source timing fields use ms.
2) Update Graph schema to discriminator model (nodes[].oneOf branches with `kind: const` and `params: $ref <node-schema>`; add `label?: string`).
3) Remove (or deprecate) node-level `id` fields from per-node schemas where redundant, keeping only `extensions`/`extras`. (If retained, convert to optional string label.)
4) Add/adjust examples: buffer-based source, oscillator-based source, wet/dry reverb split, filter chain, splitter/merger.
5) Extend validator: add linter pass for invariants (DAG, emitter single input, single listener per scene). Document linter in spec.
6) CI proposal: GitHub Action runs ajv validation + linter on PRs.

Open Points (to watch while implementing)
- Ensure $ref paths mirror other extensions (glTFProperty/glTFid + local KHR_audio_graph.*.schema.json files).
- Avoid oneOf ambiguity by using `kind: const` discriminator.
- Keep Listener semantics per node extension and scene-level rules; do not introduce cross-pointers from graph to scene nodes.

