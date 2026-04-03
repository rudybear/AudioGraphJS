# AudioGraphJS Runtime - Usage Notes

- GraphSpec
  - `nodes`: array of `{ id, kind, params }`
  - `connections`: edges `{ from: { node, output? }, to: { node, input? } }`
  - `outputs?`: optional node ids that connect directly to destination

- Sinks
  - `emitter` nodes represent shared emitter buses.
  - Multiple upstream edges may target the same emitter bus. Signals are summed by default before spatialization or final gain. This is the runtime's informative default mixing rule for layered graphs.
  - Use `outputs[]` only for direct global sinks that do not need emitter semantics.

- Time Units
  - Runtime node params use seconds.
  - Layered glTF is also interpreted in seconds.
  - Legacy `KHR_audio_graph` container examples still map milliseconds to seconds in the runner.

- Linting
  - `lintGraph(spec)` checks DAG validity, sink presence, emitter degree (`in >= 1`, `out = 0`), and basic routing arity.
  - `lintLayeredGraph(graph, audioEmitter)` checks layered graph structure and base-layer references.

- Layered Binding Model
  - Node-level emitter binding:
    - `"extensions": { "KHR_audio_emitter": { "emitter": <emitterId> } }`
    - `"extensions": { "KHR_audio_emitter": { "emitters": [<emitterId>, ...] } }`
  - Scene-level emitter binding for global emitters:
    - `"extensions": { "KHR_audio_emitter": { "emitters": [<emitterId>, ...] } }`
  - Layered graphs may fan in to the same emitter. The runtime combines those inputs on the shared emitter bus.

- Layered Environment Model
  - Listener binding is read from `KHR_audio_environment` on nodes.
  - Environment binding is read from `KHR_audio_environment` on scenes.
  - Current runtime scope: scene-level environment only.

- Validation
  - Layered examples: `node tools/spec-validate/validate-layered.mjs <files...>`
  - Legacy graph schema validation: `npm run spec:validate`
