# Parameter Audit — KHR_audio_graph (Phase 2)

Notes
- Units: keep ms in spec; add explicit ms→s conversion in Web Audio mapping notes for timing params (source.when, offset, duration; delayTime; loopStart/End).
- Channel interpretation: present in some nodes; recommend consistent optional field where supported by Web Audio (e.g., filters, delay, gain). Document applicability.
- Bypass: add optional `bypass: boolean` with behavior notes (build-time rewire + runtime wrapper).

Findings (by node)
- Source (4.1)
  - OK: data, loop, loopStart/End(ms), offset(ms), duration(ms), when(s), playbackSpeed (maps to playbackRate), autoPlay, gain.
  - Flag: when uses seconds while others use ms — keep but clarify.
- Audio data (4.2)
  - OK: bufferView|uri, mimeType, encodingProperties. No change.
- Oscillator data (4.3)
  - OK: type, frequency; pulseWidth (square only) — clarify: static only, mapped via PeriodicWave.
- Emitter (5.1)
  - OK: emitterType (global|spatial), gain, spatialProperties. Note: Listener binding stays; runtime excludes it.
- Spatial properties/Attenuation (5.2/5.3)
  - OK: distanceModel/refDistance/maxDistance/rolloffFactor/cone* map to PannerNode; note engine variance and doppler.
- Gain (6.1)
  - Present: gain, interpolation, duration — OK. Add: channelInterpretation optional.
- Delay (6.2)
  - OK: delayTime (ms). Add: channelInterpretation optional.
- Pitch shifter (6.3)
  - Action: mark Deferred (no Web Audio stock node).
- Channel splitter/merger/mixer (6.4–6.6)
  - OK: semantics align with Web Audio; note mixing rules for mixer.
- Audio mixer (6.7)
  - OK: N→1 sum; recommend per-input gain via Gain nodes.
- Filters (6.8.x)
  - OK: frequency, qualityFactor (Q), gain where applicable; bypass optional. Add: channelInterpretation optional.
- Reverb (6.9)
  - Action: simplify to IR-based Convolver + wet/dry in text; algorithmic params (roomSize, reflectivity*, earlyReflections*, etc.) should be moved to a future/optional algorithmic reverb node or extension.
- Panning (StereoPanner/Panner)
  - OK: expose pan; spatialization via emitter + panner mapping notes (panningModel/distanceModel). Document chosen defaults.
- WaveShaper (new)
  - Proposal: add optional node with `amount [0..1]`, `oversample` enum, or `curve[]` for custom. Useful for common distortion use-cases.

Missing/Unnecessary (summary)
- Missing (optional): bypass (global across processors); channelInterpretation on processors where supported; waveshaper node (optional addition).
- Unnecessary (for initial runtime): algorithmic reverb parameters; Pitch shifter (deferred) — keep section with a “Deferred” notice.
