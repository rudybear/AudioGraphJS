import { describe, it, expect } from 'vitest';
import { lintLayeredGraph } from '../src/runtime/lint';
import type { KHRGraph, KHRAudioEmitterExtension } from '../src/types';

function makeAudioEmitter(nSources = 2, nEmitters = 1): KHRAudioEmitterExtension {
  return {
    audio: Array.from({ length: nSources }, (_, i) => ({ uri: `audio_${i}.wav` })),
    sources: Array.from({ length: nSources }, (_, i) => ({ audio: i, gain: 1.0 })),
    emitters: Array.from({ length: nEmitters }, () => ({ type: 'global' as const, gain: 1.0, sources: [] })),
  };
}

describe('lintLayeredGraph', () => {
  it('valid graph passes', () => {
    const graph: KHRGraph = {
      nodes: [
        { kind: 'gain', params: { gain: 0.5 } },
        { kind: 'lowpass', params: { frequency: 2000 } },
      ],
      connections: [{ from: { node: 0 }, to: { node: 1 } }],
      inputs: [{ source: 0, node: 0 }],
      outputs: [{ node: 1, emitter: 0 }],
    };
    const result = lintLayeredGraph(graph, makeAudioEmitter());
    expect(result.errors).toHaveLength(0);
  });

  it('invalid source index errors', () => {
    const graph: KHRGraph = {
      nodes: [{ kind: 'gain', params: {} }],
      connections: [],
      inputs: [{ source: 99, node: 0 }],
      outputs: [{ node: 0, emitter: 0 }],
    };
    const result = lintLayeredGraph(graph, makeAudioEmitter());
    expect(result.errors.some(e => e.includes('invalid source index 99'))).toBe(true);
  });

  it('invalid emitter index errors', () => {
    const graph: KHRGraph = {
      nodes: [{ kind: 'gain', params: {} }],
      connections: [],
      inputs: [{ source: 0, node: 0 }],
      outputs: [{ node: 0, emitter: 99 }],
    };
    const result = lintLayeredGraph(graph, makeAudioEmitter());
    expect(result.errors.some(e => e.includes('invalid emitter index 99'))).toBe(true);
  });

  it('emitter kind nodes rejected in layered graph', () => {
    const graph: KHRGraph = {
      nodes: [
        { kind: 'emitter', params: {} },
        { kind: 'gain', params: {} },
      ],
      connections: [{ from: { node: 1 }, to: { node: 0 } }],
      outputs: [{ node: 0, emitter: 0 }],
    };
    const result = lintLayeredGraph(graph, makeAudioEmitter());
    expect(result.errors.some(e => e.includes('must not contain "emitter" kind nodes'))).toBe(true);
  });

  it('DAG validation catches cycles', () => {
    const graph: KHRGraph = {
      nodes: [
        { kind: 'gain', params: {} },
        { kind: 'gain', params: {} },
      ],
      connections: [
        { from: { node: 0 }, to: { node: 1 } },
        { from: { node: 1 }, to: { node: 0 } },
      ],
      outputs: [{ node: 1, emitter: 0 }],
    };
    const result = lintLayeredGraph(graph, makeAudioEmitter());
    expect(result.errors.some(e => e.includes('cycle'))).toBe(true);
  });

  it('invalid node index in connection', () => {
    const graph: KHRGraph = {
      nodes: [{ kind: 'gain', params: {} }],
      connections: [{ from: { node: 0 }, to: { node: 5 } }],
      outputs: [{ node: 0, emitter: 0 }],
    };
    const result = lintLayeredGraph(graph, makeAudioEmitter());
    expect(result.errors.some(e => e.includes('invalid node index'))).toBe(true);
  });

  it('invalid node index in input', () => {
    const graph: KHRGraph = {
      nodes: [{ kind: 'gain', params: {} }],
      connections: [],
      inputs: [{ source: 0, node: 10 }],
      outputs: [{ node: 0, emitter: 0 }],
    };
    const result = lintLayeredGraph(graph, makeAudioEmitter());
    expect(result.errors.some(e => e.includes('invalid node index 10'))).toBe(true);
  });
});

describe('lintLayeredGraph r2 rules', () => {
  const makeAudioEmitter = () => ({
    audio: [{ uri: 'a.mp3' }],
    sources: [{ audio: 0 }],
    emitters: [{ type: 'global' as const, sources: [0] }],
  });

  it('rejects a cycle with no delay node (rule 1)', () => {
    const graph: KHRGraph = {
      nodes: [
        { kind: 'gain', params: {} },
        { kind: 'gain', params: {} },
      ],
      connections: [
        { from: { node: 0 }, to: { node: 1 } },
        { from: { node: 1 }, to: { node: 0 } },
      ],
      outputs: [{ node: 1, emitter: 0 }],
    };
    const result = lintLayeredGraph(graph, makeAudioEmitter());
    expect(result.errors.some(e => e.includes('no delay node'))).toBe(true);
  });

  it('permits a delay-stabilized feedback cycle (rule 1)', () => {
    const graph: KHRGraph = {
      nodes: [
        { kind: 'gain', params: {} },
        { kind: 'delay', params: { delayTime: 0.25 } },
        { kind: 'gain', params: { gain: 0.4 } },
      ],
      connections: [
        { from: { node: 0 }, to: { node: 1 } },
        { from: { node: 1 }, to: { node: 2 } },
        { from: { node: 2 }, to: { node: 1 } },
      ],
      outputs: [{ node: 1, emitter: 0 }],
    };
    const result = lintLayeredGraph(graph, makeAudioEmitter());
    expect(result.errors).toEqual([]);
  });

  it('rejects the oscillator node kind (r2: source data instead)', () => {
    const graph: KHRGraph = {
      nodes: [{ kind: 'oscillator', params: { type: 'sine' } }],
      connections: [],
      outputs: [{ node: 0, emitter: 0 }],
    };
    const result = lintLayeredGraph(graph, makeAudioEmitter());
    expect(result.errors.some(e => e.includes('not a graph node kind'))).toBe(true);
  });
});
