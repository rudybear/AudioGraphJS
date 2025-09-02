# AudioGraphJS — Current State and Learnings (Snapshot)

Date: 2025‑09‑01

## Scope Overview
- Implemented end‑to‑end tooling and examples to align a runtime GraphSpec with KHR_audio_graph container graphs and verify parity via traces.
- Updated spec text (README) and polished schemas inside `spec-repo` (embedded) to reflect the agreed graph model and conventions.
- Added validators, a graph runner, a comparator, and a set of aligned examples (runtime and KHR) including musical presets.

## Spec/Text and Schema Updates
- README (spec):
  - Extension container shape: `audioData[]` + `graphs[]` with nodes, connections, and optional `outputs[]` sinks.
  - Conventions: all times in ms in the spec; runtime converts ms→s.
  - Node discriminator: `{ kind, params, label? }` with explicit index/port connections.
  - Listener is scene‑level; emitter is a 1‑in/0‑out sink; graphs must have a sink (emitter or `outputs[]`).
  - Replaced legacy “procedurals/nodegraph” sections.
- Schemas (select fixes):
  - Highshelf title/limits corrected; `source.gain` clamped [0..1]; `source.state` enum; `emitter.gain` [0..1].
- Spec linter (tools/spec-validate/validate.mjs):
  - DAG cycle detection, sink requirement, emitter degrees, splitter/merger/mixer arities (sink exceptions for outputs[]).

## Runtime/Tools
- Graph builders: `buildGraph`, `buildGraphAsync` now auto‑connect `outputs[]` sinks; emitters also auto‑connect.
- Linter: `lintGraph(spec)` (DAG, sinks, emitter degrees, basic arity with sink exceptions).
- Runner CLI: `examples/run-graph.mjs`
  - Accepts runtime GraphSpec or KHR container.
  - Mapping rules (KHR → runtime):
    - Labels preserved as node ids; connections/outputs indices remapped to ids.
    - Oscillator type number → Web Audio type (0 sine, 1 square, 2 sawtooth, 3 triangle).
    - Source data.audioData → buffer uri (from extensions.KHR_audio_graph.audioData[]).
    - Reverb → Convolver; uri resolved from `audioData` or synthesized IR fallback.
  - Runtime GraphSpec enrichments:
    - If a convolver has no `uri`, inject a small mono IR (synthesized).
    - For musical presets, inject noise buffers (data URIs) for snare/cymbal if missing.
  - Trace logging via `createMemoryTrace()`; numbers normalized to 3 decimals.
- KHR validator CLI: `tools/spec-validate/validate-gltf.mjs`
  - Validates `extensions.KHR_audio_graph` in glTF files and runs lints (DAG, sinks, degrees/arity).
- Comparator: `examples/compare-khr-runtime.mjs`
  - Runs matched pairs from `examples/graphs/*.json` vs `examples/graphs-khr/*-khr.json`, diffs traces (top 20 lines of diffs).
  - Strict mode (`--strict-wav` or `STRICT_WAV=1`) compares WAV checksums and skips noise‑synth graphs.

## Examples (Aligned Pairs)
- Core
  - simple-outputs, split-merge-mix, with-emitter, delay, convolver-mix, spatial-emitter.
- Musical
  - drum (kick‑style), snare, cymbal, bass, seven-nation-army (riff).
- Each has a runtime GraphSpec JSON and a KHR container JSON with matching topology and labels.
- Baseline traces: `examples/trace-*.txt` and `examples/trace-*_khr.txt`.

## Sinks Preference
- Adopted global emitter sinks for parity and clarity. Graphs with a single `outputs[]` entry were migrated to a global emitter (emitterType `global`), preserving connectivity.
- Helper: `tools/update-emitters.mjs` automates this migration for both runtime and KHR graphs.

## Musical Preset Automation (Runner)
- drum: body/click envelopes and sweeps.
- snare: tone pitch down + noise decay.
- cymbal: long decay envelope on `gainEnv`.
- bass: ADSR‑like envelope; filter ramps skipped in runner to avoid wrapped node handle.
- seven-nation-army: note scheduling with per‑note amp envelopes; filter ramps skipped.

## Current Parity Status (Comparator)
- All aligned pairs report “traces match”:
  - bass, convolver-mix, cymbal, delay, drum, seven-nation-army, simple-outputs, snare, spatial-emitter, split-merge-mix, with-emitter.
- WAV checksums are produced by the runner but not strictly enforced in comparator (intentionally non‑fatal).

## Key Learnings
- Preserve human‑readable `label` in KHR nodes to achieve stable id‑based traces; remap connection indices accordingly.
- Spec ms→s conversion must be centralized and consistent (source start/offset/duration/loop; delay times, etc.).
- When comparing disparate ecosystems (container vs runtime), inject minimal synthetic content (IR/noise) to stabilize parity, but keep this behind tooling (runner) and document it.
- For wrapped processor nodes (bypass wrappers), direct parameter automation requires exposing or proxying the inner node; otherwise skip in trace‑parity flows or add a typed API.

## How to Use
- Run a single graph (runtime or KHR):
  - `npm run example:run-graph -- examples/graphs/simple-outputs.json`
- Compare all KHR vs runtime pairs:
  - `npm run example:compare-khr`
- Run test harness to generate/compare traces and MD5 baselines:
  - `npm run example:test-graphs`
- Validate glTF’s KHR_audio_graph sections:
  - `npm run spec:validate:gltf -- path/to/scene.gltf`
- Validate schemas + example set:
  - `npm run spec:validate`

## Next Steps
- Spec/Docs
  - Add “Web Audio Mapping” notes per node into spec README (from `docs/spec-sync/PROPOSED_TEXT_UPDATES.md`).
  - Dedupe legacy/duplicated prose; keep Listener and animation guidance crisp.
- Runtime
  - Expose inner nodes (or a param proxy) for wrapped processors to allow filter param automation in examples.
  - Add optional strict WAV checksum compare mode to comparator for CI.
- Validator
  - Extend `validate-gltf.mjs` to support `.glb` by extracting JSON chunk.
  - Add JSON output mode for CI ingestion.
- Examples
  - Add aligned pairs for lead/pad/song if desired; refine musical presets and envelopes.

## File Map (Key)
- Spec docs/schemas: `spec-repo/extensions/2.0/Khronos/KHR_audio_graph/`
- Validators: `tools/spec-validate/`
- Runner + comparator: `examples/run-graph.mjs`, `examples/compare-khr-runtime.mjs`
- Aligned examples: `examples/graphs/` and `examples/graphs-khr/`
- Traces: `examples/trace-*.txt`
