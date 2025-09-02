# KHR_audio_graph Project Plan

## Scope & Goals
- Implement spec-defined nodes using Web Audio API to build complex audio graphs (TypeScript).
- Enable serialization first, then parsing of a provisional JSON shape; glTF container integration later.
- Support browser and Node (for CI/debug) with deterministic tests.

## Phases & Deliverables
- Phase 0 — Foundation: TS package, Web Audio adapter, Node support (standardized-audio-context), OfflineAudioContext harness, minimal docs.
- Phase 1 — Nodes (runtime): Spec-accurate nodes, defaults, clamping, AudioParam mapping, start/stop semantics.
- Phase 2 — Serialization (first): Serialize in-memory graph -> provisional extension JSON (stable IDs, node types, params, connections).
- Phase 3 — Parser: Parse JSON -> runtime graph, schema validation, clear errors for unsupported features.
- Phase 4 — Examples: Small demos after runtime + parser/serialization stabilize.
- Phase 5 — glTF Hooks: Bind listener to glTF camera; sources per node spec; no animation.

## Node Implementation Order
1) Sources: AudioBufferSource, Oscillator.
2) Core processors: Gain, BiquadFilter, Delay, DynamicsCompressor, WaveShaper, Convolver.
3) Routing/utility: ChannelSplitter/Merger, StereoPanner/Panner (spatialization).
4) Optional/custom: AudioWorkletNode only if explicitly in spec (requires approval).

## Testing Strategy
- Start Day 1. Use OfflineAudioContext for determinism; run in Node for CI.
- Assert via RMS/FFT/impulse responses; tolerance-based comparisons; golden fixtures where helpful.
- Parity tests for Node vs browser when applicable.

## glTF Integration Assumptions
- Listener attaches to glTF camera. Sources follow node spec.
- Asset packaging is out of scope; final container is glTF.
- No animation work; follow node specification only.

## Risks & Compatibility Notes
- Panner/doppler defaults vary; fix exact options and document.
- Convolver IR sample-rate/normalization differences; standardize via preprocessing.
- DelayNode max delayTime differences; cap/validate per spec.
- DynamicsCompressor behavior varies; use range assertions, not exact waveforms.

## Out of Scope (for now)
- Final graph schema in spec (may change).
- Full glTF animation integration.
- Offline export beyond test rendering.

## Decision Log
Document noteworthy choices and approvals.
- 2025-09-01: Agreed phases (runtime first, then serialization, then parser). Listener bound to camera; Node + browser targets; no animation. — approved by PM
- 2025-09-01: AudioBufferSource is single-shot; rebuild graph to replay. Fixed sample rate allowed (use encoding properties for assets). Spatialization per glTF scheme. Convolver defaults per Web Audio. Node is primary target; CI later. Minimal private debug dump OK. — approved by PM
- 2025-09-01: Listener binding skipped for initial runtime scope. Pitch Shifter deferred (requires DSP/Worklet). Reverb kept simple as IR-based Convolver with wet/dry mix; algorithmic model out of scope. — approved by PM
- 2025-09-01: Graph schema direction agreed — Sources remain a single 0/1 node kind with data.oneOf { audioData: glTFid | oscillator: oscillator params } (timing fields in ms at Source level). Oscillator is not a separate node kind. Graph nodes will use a discriminator shape { kind, params, label? } and connections reference nodes by array index (glTF-style). Node-level numeric ids are deprecated; optional string label allowed for debug. Emitter remains a sink (1/0) in graph; Listener remains outside graph (per-node extension). JSON Schema validates structure/params; a linter (specified in spec) will enforce DAG, single listener, emitter single-input, etc. — agreed

## Next Actions
- Scaffold Phase 0.
- Implement 1–2 nodes (AudioBufferSource, Gain) and serialization stubs.
