# AudioGraphJS - Current State

Date: 2026-04-02

## Summary

The active implementation direction is the layered model:

- `KHR_audio_emitter` as the base layer
- `KHR_audio_graph` for routing and processing
- `KHR_audio_environment` for listener and environment semantics

Legacy `KHR_audio_graph` container support remains in the runner for compatibility, but the layered path is now the primary path.

## Implemented

- Layered parser:
  - `parseLayeredExtensions()` reads `KHR_audio_emitter`, optional `KHR_audio_graph`, and optional `KHR_audio_environment`
  - scene-level and node-level emitter bindings are extracted
- Graph merging:
  - multiple layered graphs are merged into one runtime graph
  - shared emitters stay shared, which enables additive fan-in
- Default emitter mixing:
  - multiple graph outputs may target the same emitter
  - the runtime sums those inputs on the shared emitter bus by default
- Listener application:
  - scene listener transform is applied to the Web Audio listener
- Environment application:
  - scene-level environment creates a real wet/dry routing bus
  - emitters route through that bus when environment processing is active
- Positional emitter fix:
  - glTF cone angles are converted from radians to Web Audio degrees
- Validation:
  - layered validator works with explicit files and wildcard patterns

## Tests

- Unit and integration suite: `54` passing tests
- Real layered glTF fixture coverage includes:
  - `simple-emitter-only.json`
  - `spatial-with-environment.json`
  - `same-emitter-multi-graph.json`

## Current Runtime Behavior

- Layered fixtures in `examples/graphs-layered` are treated as real glTF JSON with extensions.
- Scene-level global emitters are supported.
- Node-level positional emitters are supported.
- Scene-level environment is supported.
- Node-localized environment zones are still out of scope.

## Informative Runtime Rule

When multiple upstream graph outputs target the same emitter, their signals are mixed by default before emitter gain and spatialization. This is the runtime's informative behavior and should be reflected in the proposal language.

## Remaining Gaps

- Node-localized environment zones are not implemented.
- `KHR_animation_pointer` integration is not implemented.
- The older legacy-spec docs under `docs/spec-sync` still contain historical notes and are not the source of truth.

## Recommended Next Steps

- add one or two more layered examples that combine source bindings and oscillator-only graph sources in the same asset
- decide whether node-localized environment zones belong in the next milestone or should stay deferred
- tighten any remaining spec prose so it matches the layered runtime exactly
