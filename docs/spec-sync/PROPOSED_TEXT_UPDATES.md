# Proposed Spec Text Updates (Phase 2)

This file contains suggested text blocks to paste into `extensions/2.0/Khronos/KHR_audio_graph/README.md`.

General — Units & Mapping
- Add to an early “Conventions” section:
  "Unless specified otherwise, times are expressed in milliseconds (ms). When mapping to Web Audio API, timing values are converted to seconds (s), e.g. `delayTime(ms)` → `DelayNode.delayTime(s)`."

Source Node (4.1) — Mapping Note
- “Web Audio Mapping: This node maps to an `AudioBufferSourceNode`. `playbackSpeed` corresponds to `playbackRate`. `loopStart` and `loopEnd` map to `loopStart`/`loopEnd` (seconds). `when` uses seconds and passes to `start(when, offset, duration)` after ms→s conversion for `offset`/`duration`.”

Oscillator Data (4.3) — PWM Clarification
- “Mapping: `OscillatorNode`. If `type = square` and `pulseWidth` is provided, implement as a static PWM using `PeriodicWave`. PWM modulation is out of scope.”

Gain (6.1) — Smoothing
- “Mapping: `GainNode`. Optional smoothing may be expressed with `interpolation: 'linear'|'custom'` and `duration (ms)`. Linear smoothing uses linear ramp; ‘custom’ can be approximated with `setTargetAtTime`.”

Delay (6.2)
- “Mapping: `DelayNode` with `delayTime` in seconds. Convert ms→s.”

Filters (6.8.x)
- “Mapping: `BiquadFilterNode` with corresponding `type`. `frequency` (Hz ≥ 0), `qualityFactor` maps to `Q` (≥ 0), `gain` (dB). Optional `bypass` may be supported via build-time routing or runtime dry/wet crossfade.”

Reverb (6.9) — IR-based
- “Mapping: IR-based reverb via `ConvolverNode`. The effect’s overall wet/dry ratio is implemented by summing dry and wet paths with respective gains. Algorithmic reverb parameters (room size, reflectivity, etc.) are out of scope for the IR-based mapping and may be considered for a future optional node.”

Panning
- “Mapping: `StereoPannerNode` for pan control and `PannerNode` for 3D spatialization. `spatializationModel` maps to `panningModel`; attenuation maps to `distanceModel`, `refDistance`, `maxDistance`, `rolloffFactor`, `cone*`.”

Emitter (5.1)
- “Implemented as a gain stage with optional spatialization using `PannerNode`. A single scene listener is assumed; listener details are outside the scope of this runtime but remain part of the specification.”

Pitch Shifter (6.3) — Deferred
- “This node is deferred from initial scope due to lack of a stock Web Audio node. It can be realized via custom DSP/Worklet in future revisions.”

Bypass (Implementation Note)
- “For processors, an optional `bypass: boolean` may be honored by either: (1) build-time routing (rewire around the node), or (2) runtime dry/wet crossfade wrapper. Both approaches are viable; exact behavior may be implementation-defined.”

Channel Interpretation (Implementation Note)
- “Where supported by Web Audio (`AudioNode.channelInterpretation`), an optional `channelInterpretation: 'speakers'|'discrete'` may be provided to refine mixing behavior. Not all nodes or runtimes support this property.”

