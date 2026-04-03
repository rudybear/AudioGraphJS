# Plan And Status

Status: current layered runtime milestone complete

## Completed

- layered parser for `KHR_audio_emitter`, `KHR_audio_graph`, and `KHR_audio_environment`
- node-level and scene-level emitter binding extraction
- merged execution for multiple layered graphs
- additive default mixing on shared emitter buses
- listener application in the runner
- scene-level environment routing in the runner
- radians-to-degrees conversion for positional emitter cone angles
- layered validator wildcard support
- real glTF fixture tests for layered examples

## Current Scope

- layered format is the preferred implementation path
- legacy `KHR_audio_graph` runner support remains for compatibility only
- scene-level environment is supported
- node-localized environment zones are deferred

## Open Items

- `KHR_animation_pointer` integration
- node-localized environment zones and overlap rules
- additional layered fixture coverage for more complex mixed assets

## Reviewer Notes

- informative runtime behavior now explicitly supports default signal summing when multiple graph outputs target the same emitter
- this should be mirrored in spec prose as informative guidance, not as hidden implementation behavior
