import { GraphSpec, GraphNodeSpec, KHRGraph, KHRAudioEmitterExtension } from '../types.js';

export interface LintResult {
  errors: string[];
  warnings: string[];
}

export function lintGraph(spec: GraphSpec): LintResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const ids = new Set(spec.nodes.map((n) => n.id));
  // Validate references
  for (const c of spec.connections) {
    if (!ids.has(c.from.node)) errors.push(`Connection from unknown node: ${c.from.node}`);
    if (!ids.has(c.to.node)) errors.push(`Connection to unknown node: ${c.to.node}`);
  }

  // Build indegree/outdegree
  const indeg = new Map<string, number>();
  const outdeg = new Map<string, number>();
  for (const n of spec.nodes) { indeg.set(n.id, 0); outdeg.set(n.id, 0); }
  for (const c of spec.connections) {
    outdeg.set(c.from.node, (outdeg.get(c.from.node) || 0) + 1);
    indeg.set(c.to.node, (indeg.get(c.to.node) || 0) + 1);
  }

  // Sink invariant: must have at least one emitter or outputs[]
  const hasEmitter = spec.nodes.some((n) => n.kind === 'emitter');
  const hasOutputs = Array.isArray(spec.outputs) && spec.outputs.length > 0;
  if (!hasEmitter && !hasOutputs) errors.push('Graph must have at least one sink (emitter or outputs[])');

  // Emitter degree
  for (const n of spec.nodes) {
    if (n.kind === 'emitter') {
      if ((indeg.get(n.id) || 0) !== 1) errors.push(`Emitter ${n.id} must have exactly one input`);
      if ((outdeg.get(n.id) || 0) !== 0) errors.push(`Emitter ${n.id} must have zero outputs`);
    }
  }

  // Simple arity checks (allow sink nodes listed in outputs[] to have zero outgoing edges)
  const outputsSet = new Set(Array.isArray(spec.outputs) ? spec.outputs : []);
  for (const n of spec.nodes) {
    const inD = indeg.get(n.id) || 0;
    const outD = outdeg.get(n.id) || 0;
    switch (n.kind) {
      case 'channel-splitter':
        if (inD !== 1) errors.push(`channel-splitter ${n.id} must have exactly 1 input`);
        if (outD < 1) errors.push(`channel-splitter ${n.id} must have at least 1 output`);
        break;
      case 'channel-merger':
        if (inD < 1) errors.push(`channel-merger ${n.id} must have at least 1 input`);
        if (!outputsSet.has(n.id) && outD !== 1) errors.push(`channel-merger ${n.id} must have exactly 1 output`);
        break;
      case 'audio-mixer':
      case 'channel-mixer':
        if (inD < 1) errors.push(`${n.kind} ${n.id} must have at least 1 input`);
        if (!outputsSet.has(n.id) && outD !== 1) errors.push(`${n.kind} ${n.id} must have exactly 1 output`);
        break;
    }
  }

  // Cycle rule (KHR_audio_graph rule 1): cycles are permitted only when every
  // cycle contains a delay node. Implementation: strip delay nodes and re-check —
  // any cycle that survives contains no delay and is invalid.
  const hasCycle = (excludeDelay: boolean): boolean => {
    const adj = new Map<string, string[]>();
    const skip = (id: string) => excludeDelay && spec.nodes.find((n) => n.id === id)?.kind === 'delay';
    for (const n of spec.nodes) adj.set(n.id, []);
    for (const c of spec.connections) {
      if (skip(c.from.node) || skip(c.to.node)) continue;
      (adj.get(c.from.node) || []).push(c.to.node);
    }
    const temp = new Set<string>();
    const perm = new Set<string>();
    const visit = (v: string): boolean => {
      if (perm.has(v)) return false;
      if (temp.has(v)) return true;
      temp.add(v);
      for (const w of adj.get(v) || []) {
        if (visit(w)) return true;
      }
      temp.delete(v);
      perm.add(v);
      return false;
    };
    for (const n of spec.nodes) {
      if (!perm.has(n.id) && visit(n.id)) return true;
    }
    return false;
  };
  if (hasCycle(true)) {
    errors.push('Graph contains a cycle with no delay node (rule 1: every cycle must contain a delay node)');
  } else if (hasCycle(false)) {
    warnings.push('Graph contains delay-stabilized feedback cycle(s) (permitted by rule 1)');
  }

  return { errors, warnings };
}

export function lintLayeredGraph(
  graph: KHRGraph,
  audioEmitter: KHRAudioEmitterExtension,
): LintResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const nodeCount = graph.nodes.length;

  // Validate that no 'emitter' or 'oscillator' kind nodes exist in layered
  // graphs (r2: oscillators are KHR_audio_emitter source data, not node kinds)
  for (let i = 0; i < nodeCount; i++) {
    if (graph.nodes[i].kind === 'emitter') {
      errors.push(`Layered graph must not contain "emitter" kind nodes (found at index ${i})`);
    }
    if (graph.nodes[i].kind === 'oscillator') {
      errors.push(`"oscillator" is not a graph node kind (found at index ${i}); declare it as source data via source.extensions.KHR_audio_graph.oscillator`);
    }
  }

  // Validate graph input bindings
  if (graph.inputs) {
    for (const inp of graph.inputs) {
      if (inp.source < 0 || inp.source >= audioEmitter.sources.length) {
        errors.push(`Graph input references invalid source index ${inp.source} (sources length: ${audioEmitter.sources.length})`);
      }
      if (inp.node < 0 || inp.node >= nodeCount) {
        errors.push(`Graph input references invalid node index ${inp.node} (nodes length: ${nodeCount})`);
      }
    }
  }

  // Validate graph output bindings
  if (graph.outputs) {
    for (const out of graph.outputs) {
      if (out.emitter < 0 || out.emitter >= audioEmitter.emitters.length) {
        errors.push(`Graph output references invalid emitter index ${out.emitter} (emitters length: ${audioEmitter.emitters.length})`);
      }
      if (out.node < 0 || out.node >= nodeCount) {
        errors.push(`Graph output references invalid node index ${out.node} (nodes length: ${nodeCount})`);
      }
    }
  }

  // Validate connections reference valid node indices
  for (const c of graph.connections) {
    if (c.from.node < 0 || c.from.node >= nodeCount) {
      errors.push(`Connection from invalid node index ${c.from.node}`);
    }
    if (c.to.node < 0 || c.to.node >= nodeCount) {
      errors.push(`Connection to invalid node index ${c.to.node}`);
    }
  }

  // Cycle rule (rule 1): only delay-free cycles are invalid.
  const hasCycle = (excludeDelay: boolean): boolean => {
    const skip = (i: number) => excludeDelay && graph.nodes[i]?.kind === 'delay';
    const adj = new Map<number, number[]>();
    for (let i = 0; i < nodeCount; i++) adj.set(i, []);
    for (const c of graph.connections) {
      if (c.from.node < 0 || c.from.node >= nodeCount || c.to.node < 0 || c.to.node >= nodeCount) continue;
      if (skip(c.from.node) || skip(c.to.node)) continue;
      adj.get(c.from.node)!.push(c.to.node);
    }
    const temp = new Set<number>();
    const perm = new Set<number>();
    const visit = (v: number): boolean => {
      if (perm.has(v)) return false;
      if (temp.has(v)) return true;
      temp.add(v);
      for (const w of adj.get(v) || []) {
        if (visit(w)) return true;
      }
      temp.delete(v);
      perm.add(v);
      return false;
    };
    for (let i = 0; i < nodeCount; i++) {
      if (!perm.has(i) && visit(i)) return true;
    }
    return false;
  };
  if (hasCycle(true)) {
    errors.push('Graph contains a cycle with no delay node (rule 1: every cycle must contain a delay node)');
  } else if (hasCycle(false)) {
    warnings.push('Graph contains delay-stabilized feedback cycle(s) (permitted by rule 1)');
  }

  // Must have at least one sink (output binding or implicit)
  const hasOutputs = Array.isArray(graph.outputs) && graph.outputs.length > 0;
  if (!hasOutputs && !graph.inputs) {
    warnings.push('Graph has no outputs[] and no inputs[]');
  }

  return { errors, warnings };
}
