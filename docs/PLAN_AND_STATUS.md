# Plan & Status — Listener/Emitter Spec + Parser

Status: in progress

Phases

- [x] Docs: Complex Graph (USAGE section)
- [ ] Spec: Listener language (README; KHR_animation_pointer TODO)
- [ ] Spec: Emitter → Node binding (README + node-level extension schema)
- [ ] Spec: Commit + spec validation (no example breakage)
- [ ] Runtime: glTF parser for emitter bindings (separate class/file)
- [ ] Test: Focused spatial emitter parity (one case; identical transforms)
- [ ] Docs: Spatial Emitter Binding (USAGE) + STATE_OF_PROJECT update

Listener — Scope (this pass)
- Not a graph node; scene/node-level concept; single Listener per scene.
- KHR_animation_pointer applicability is deferred (TODO). We will specify accessible properties and pointer paths in a later pass.

Emitter Binding — Node-level (this pass)
- Do not add node ids inside graph emitter objects.
- Bind emitters at glTF node level via a node extension:
  - Scalar form: `extensions.KHR_audio_graph = { "emitter": <emitterId> }`
  - Array form: `extensions.KHR_audio_graph = { "emitters": [<emitterId>, ...] }`
- Each glTF node creates instances for each referenced emitter id. Multiple nodes may reference the same emitter id.
- Runtime optimization: share upstream audio graph routing; instantiate only the final per-instance spatial stage (PannerNode and any post‑panner gain).

Parser (this pass)
- Separate glTF parser external to audio graph parsing.
- For examples, read node transforms (translation/rotation/scale) “as is” — no world/hierarchy computation.

Test (next step)
- Add one focused spatial emitter test to compare KHR-bound instances vs a native baseline with identical transforms.

