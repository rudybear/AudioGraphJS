import { describe, it, expect } from 'vitest';
import { extractEmitterBindings } from '../src/serialization/gltf-emitters';

describe('extractEmitterBindings', () => {
  it('extracts KHR_audio_emitter extension (emitters array)', () => {
    const gltf = {
      nodes: [
        {
          name: 'Duck',
          translation: [1.0, 2.0, 3.0],
          extensions: { KHR_audio_emitter: { emitters: [0, 1] } },
        },
      ],
    };

    const bindings = extractEmitterBindings(gltf);
    expect(bindings).toHaveLength(2);
    expect(bindings[0]).toEqual({
      nodeIndex: 0,
      emitterId: 0,
      translation: [1.0, 2.0, 3.0],
      rotation: undefined,
      scale: undefined,
    });
    expect(bindings[1].emitterId).toBe(1);
  });

  it('extracts KHR_audio_graph extension (legacy format)', () => {
    const gltf = {
      nodes: [
        {
          name: 'Object',
          extensions: { KHR_audio_graph: { emitter: 5 } },
        },
      ],
    };

    const bindings = extractEmitterBindings(gltf);
    expect(bindings).toHaveLength(1);
    expect(bindings[0].emitterId).toBe(5);
  });

  it('KHR_audio_emitter takes precedence over KHR_audio_graph', () => {
    const gltf = {
      nodes: [
        {
          name: 'Object',
          extensions: {
            KHR_audio_emitter: { emitters: [10] },
            KHR_audio_graph: { emitter: 99 },
          },
        },
      ],
    };

    const bindings = extractEmitterBindings(gltf);
    // KHR_audio_emitter is checked first, and since it exists, KHR_audio_graph is not used
    expect(bindings).toHaveLength(1);
    expect(bindings[0].emitterId).toBe(10);
  });

  it('extracts transform (translation, rotation, scale)', () => {
    const gltf = {
      nodes: [
        {
          translation: [1.0, 2.0, 3.0],
          rotation: [0.0, 0.707, 0.0, 0.707],
          scale: [1.0, 2.0, 1.0],
          extensions: { KHR_audio_emitter: { emitters: [0] } },
        },
      ],
    };

    const bindings = extractEmitterBindings(gltf);
    expect(bindings).toHaveLength(1);
    expect(bindings[0].translation).toEqual([1.0, 2.0, 3.0]);
    expect(bindings[0].rotation).toEqual([0.0, 0.707, 0.0, 0.707]);
    expect(bindings[0].scale).toEqual([1.0, 2.0, 1.0]);
  });

  it('handles legacy scalar emitter form', () => {
    const gltf = {
      nodes: [
        {
          extensions: { KHR_audio_emitter: { emitter: 3 } },
        },
      ],
    };

    const bindings = extractEmitterBindings(gltf);
    expect(bindings).toHaveLength(1);
    expect(bindings[0].emitterId).toBe(3);
  });

  it('returns empty array when no nodes', () => {
    const bindings = extractEmitterBindings({});
    expect(bindings).toHaveLength(0);
  });

  it('skips nodes without extensions', () => {
    const gltf = {
      nodes: [
        { name: 'No extensions' },
        { name: 'Has ext', extensions: { KHR_audio_emitter: { emitters: [0] } } },
      ],
    };

    const bindings = extractEmitterBindings(gltf);
    expect(bindings).toHaveLength(1);
    expect(bindings[0].nodeIndex).toBe(1);
  });
});
