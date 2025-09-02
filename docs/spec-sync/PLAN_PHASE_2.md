# Phase 2 — Spec Alignment Plan

Scope
- Keep spec node naming. Add “Informal Web Audio Mapping” subsections per node.
- Listener remains in spec; note runtime treatment is out of scope (informational only).
- Remove/defer nothing in schemas yet; only text edits. Pitch Shifter marked Deferred.
- Reverb: simplify description to IR-based Convolver + wet/dry in the text (schema changes postponed).

Edits (targets by path)
- spec-repo/extensions/2.0/Khronos/KHR_audio_graph/README.md:
  - Add a “Web Audio Mapping” note per node with units and defaults.
  - Mark Pitch Shifter as Deferred.
  - Reword Reverb node as IR-based; move algorithmic params to a future section.
  - Clarify ms→s conversion and parameter ranges.
  - Add bypass semantics (build-time rewire + runtime wrapper) as Implementation Notes.

Deliverables
- PARAM_AUDIT.md: missing/unnecessary parameters flagged per node.
- PROPOSED_TEXT_UPDATES.md: suggested text blocks ready to paste into README.md.
- MATRIX.json: node mapping matrix for quick review.

Out of Scope (Phase 2)
- JSON Schema changes (Phase 3).
- Graph container schema.

