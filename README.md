Audio Graph JS - Layered glTF Audio Runtime (Node/Web)

**What It Is**
- **Runtime:** A minimal Web Audio-based runtime for layered glTF audio proposals built on `KHR_audio_emitter`, with compatibility support for legacy `KHR_audio_graph` containers.
- **Parity tools:** Side-by-side runner and comparator to verify parity between native runtime GraphSpecs and glTF containers.
- **Emitters:** Placement-agnostic emitters with instance expansion from glTF node or scene bindings.

**Requirements**
- **Node.js:** 18+.

**Install & Build**
- Install deps: `npm install`
- TypeScript build: `npm run build`

**Quick Start**
- Render one example: `npm run example:run-graph -- examples/graphs/osc.json`
- Run tests: `npm test`

**Emitter Instance Expansion**
- The base graph builds `emitter` nodes as shared input buses with no direct auto-connect to the destination.
- Instance expansion creates the final panner and post-gain stages for each binding.
- Multiple upstream graph outputs may target the same emitter bus. The runtime mixes those inputs by default before spatialization or final gain. This is informative runtime guidance and matches the intended layered spec behavior.
- Layered glTF bindings:
  - Node-level: `extensions.KHR_audio_emitter = { emitter: <id> }` or `{ emitters: [<id>, ...] }`
  - Scene-level for global emitters: `extensions.KHR_audio_emitter = { emitters: [<id>, ...] }`
- Runtime test harness:
  - Add `__emitterInstances` to a runtime GraphSpec, for example `{ emitterNodeId: "emit", translation: [1, 0, 0] }`

**Runner Input Modes**
- Runtime GraphSpec: `{ nodes, connections, outputs? }`
- Layered glTF: `KHR_audio_emitter`, optionally `KHR_audio_graph` and `KHR_audio_environment`
- Legacy glTF: `extensions.KHR_audio_graph`

**Useful Scripts**
- `npm run spec:validate`
- `npm run spec:validate:gltf`
- `node tools/spec-validate/validate-layered.mjs <files...>`

**Notes**
- Listener application is available for layered inputs.
- `KHR_animation_pointer` integration is still TODO.
- Stereo panner uses an approximation in this runtime where needed.

**Where Things Live**
- Runtime code: `src/runtime`
- Serialization and parsing: `src/serialization`
- Examples: `examples`
- Notes: `docs`
