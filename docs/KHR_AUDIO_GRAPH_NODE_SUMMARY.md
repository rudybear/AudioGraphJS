# Layered Audio Runtime Mapping

- `KHR_audio_emitter.audio[]`
  - asset-level audio payloads
  - optional `KHR_audio_graph.encoding` metadata

- `KHR_audio_emitter.sources[]`
  - maps to runtime audio-buffer-source setup
  - extended playback fields from `extensions.KHR_audio_graph`

- `KHR_audio_emitter.emitters[]`
  - maps to shared runtime emitter buses
  - `type: global` -> gain-only output instance
  - `type: positional` -> panner plus post-gain output instance

- `KHR_audio_graph.graphs[]`
  - parsed individually, then merged for execution
  - shared emitter targets remain shared across merged graphs
  - when multiple outputs target the same emitter, signals are summed by default

- `KHR_audio_environment.listeners[]`
  - maps to `AudioListener`
  - transform comes from the bound glTF node

- `KHR_audio_environment.environments[]`
  - scene-level environment currently supported
  - reverb is implemented through a real wet/dry environment bus

## Important Conversions

- glTF time in the layered runtime path is interpreted in seconds
- glTF cone angles are interpreted in radians
- Web Audio panner cone angles use degrees, so the runtime converts radians to degrees

## Current Non-Goals

- node-localized environment zones
- `KHR_animation_pointer` integration
- full spec-sync cleanup of older historical notes
