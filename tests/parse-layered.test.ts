import { describe, it, expect } from 'vitest';
import { parseLayeredExtensions } from '../src/serialization/parse-layered';
import type { GltfDocument } from '../src/types';

describe('parseLayeredExtensions', () => {
  it('emitter-only input produces correct runtime spec', () => {
    const gltf: GltfDocument = {
      extensionsUsed: ['KHR_audio_emitter'],
      extensions: {
        KHR_audio_emitter: {
          audio: [{ uri: 'test.wav' }],
          sources: [{ audio: 0, gain: 0.5, autoplay: true }],
          emitters: [{ type: 'global', gain: 1.0, sources: [0] }],
        },
      },
    };

    const result = parseLayeredExtensions(gltf);
    expect(result.graphs).toHaveLength(1);
    const spec = result.graphs[0];
    // Should have 1 emitter node + 1 source node
    expect(spec.nodes).toHaveLength(2);
    const emitter = spec.nodes.find(n => n.kind === 'emitter');
    expect(emitter).toBeDefined();
    expect((emitter!.params as any).emitterType).toBe('global');
    const src = spec.nodes.find(n => n.kind === 'audio-buffer-source');
    expect(src).toBeDefined();
    expect((src!.params as any).uri).toBe('test.wav');
    expect((src!.params as any).gain).toBe(0.5);
    // Should have connection from source to emitter
    expect(spec.connections).toHaveLength(1);
  });

  it('audio_emitter + audio_graph produces correct runtime spec', () => {
    const gltf: GltfDocument = {
      extensionsUsed: ['KHR_audio_emitter', 'KHR_audio_graph'],
      extensions: {
        KHR_audio_emitter: {
          audio: [{ uri: 'noise.wav' }],
          sources: [{ audio: 0, gain: 1.0, autoplay: true }],
          emitters: [{ type: 'global', gain: 0.8, sources: [] }],
        },
        KHR_audio_graph: {
          graphs: [{
            name: 'test',
            nodes: [
              { kind: 'gain', params: { gain: 0.5 }, label: 'vol' },
              { kind: 'lowpass', params: { frequency: 2000, qualityFactor: 1.0 }, label: 'lpf' },
            ],
            connections: [{ from: { node: 0 }, to: { node: 1 } }],
            inputs: [{ source: 0, node: 0 }],
            outputs: [{ node: 1, emitter: 0 }],
          }],
        },
      },
    };

    const result = parseLayeredExtensions(gltf);
    expect(result.graphs).toHaveLength(1);
    const spec = result.graphs[0];
    // Source + gain + lpf + emitter = 4 nodes
    expect(spec.nodes).toHaveLength(4);
    expect(spec.nodes.find(n => n.id === 'vol')?.kind).toBe('gain');
    expect(spec.nodes.find(n => n.id === 'lpf')?.kind).toBe('biquad-filter');
    const lpfParams = spec.nodes.find(n => n.id === 'lpf')?.params as any;
    expect(lpfParams.type).toBe('lowpass');
    expect(lpfParams.Q).toBe(1.0);
    expect(lpfParams.frequency).toBe(2000);
    // Emitter node
    const emitter = spec.nodes.find(n => n.kind === 'emitter');
    expect(emitter).toBeDefined();
    expect((emitter!.params as any).gain).toBe(0.8);
  });

  it('graph with oscillator-only source (no audio_emitter source binding)', () => {
    const gltf: GltfDocument = {
      extensionsUsed: ['KHR_audio_emitter', 'KHR_audio_graph'],
      extensions: {
        KHR_audio_emitter: {
          audio: [],
          sources: [],
          emitters: [{ type: 'global', gain: 1.0, sources: [] }],
        },
        KHR_audio_graph: {
          graphs: [{
            name: 'synth',
            nodes: [
              { kind: 'oscillator', params: { type: 'sine', frequency: 440 }, label: 'osc' },
              { kind: 'gain', params: { gain: 0.3 }, label: 'vol' },
            ],
            connections: [{ from: { node: 0 }, to: { node: 1 } }],
            outputs: [{ node: 1, emitter: 0 }],
          }],
        },
      },
    };

    const result = parseLayeredExtensions(gltf);
    const spec = result.graphs[0];
    // No graph inputs → no audio-buffer-source; just osc + gain + emitter = 3
    expect(spec.nodes).toHaveLength(3);
    const osc = spec.nodes.find(n => n.id === 'osc');
    expect(osc?.kind).toBe('oscillator');
    expect((osc?.params as any).type).toBe('sine');
    expect((osc?.params as any).frequency).toBe(440);
  });

  it('handles multiple graphs', () => {
    const gltf: GltfDocument = {
      extensionsUsed: ['KHR_audio_emitter', 'KHR_audio_graph'],
      extensions: {
        KHR_audio_emitter: {
          audio: [{ uri: 'a.wav' }, { uri: 'b.wav' }],
          sources: [{ audio: 0, gain: 1.0 }, { audio: 1, gain: 0.5 }],
          emitters: [{ type: 'global', gain: 1.0, sources: [] }, { type: 'global', gain: 0.5, sources: [] }],
        },
        KHR_audio_graph: {
          graphs: [
            {
              nodes: [{ kind: 'gain', params: { gain: 1.0 } }],
              connections: [],
              inputs: [{ source: 0, node: 0 }],
              outputs: [{ node: 0, emitter: 0 }],
            },
            {
              nodes: [{ kind: 'gain', params: { gain: 0.5 } }],
              connections: [],
              inputs: [{ source: 1, node: 0 }],
              outputs: [{ node: 0, emitter: 1 }],
            },
          ],
        },
      },
    };

    const result = parseLayeredExtensions(gltf);
    expect(result.graphs).toHaveLength(2);
  });

  it('handles multiple inputs/outputs per graph', () => {
    const gltf: GltfDocument = {
      extensionsUsed: ['KHR_audio_emitter', 'KHR_audio_graph'],
      extensions: {
        KHR_audio_emitter: {
          audio: [{ uri: 'a.wav' }, { uri: 'b.wav' }],
          sources: [{ audio: 0, gain: 1.0 }, { audio: 1, gain: 0.5 }],
          emitters: [{ type: 'global', gain: 1.0, sources: [] }, { type: 'global', gain: 0.5, sources: [] }],
        },
        KHR_audio_graph: {
          graphs: [{
            nodes: [
              { kind: 'audiomixer', params: {} },
              { kind: 'gain', params: { gain: 0.5 } },
              { kind: 'gain', params: { gain: 0.3 } },
            ],
            connections: [
              { from: { node: 0 }, to: { node: 1 } },
              { from: { node: 0 }, to: { node: 2 } },
            ],
            inputs: [{ source: 0, node: 0 }, { source: 1, node: 0 }],
            outputs: [{ node: 1, emitter: 0 }, { node: 2, emitter: 1 }],
          }],
        },
      },
    };

    const result = parseLayeredExtensions(gltf);
    const spec = result.graphs[0];
    // 2 sources + 3 processing + 2 emitters = 7 nodes
    expect(spec.nodes).toHaveLength(7);
    const emitters = spec.nodes.filter(n => n.kind === 'emitter');
    expect(emitters).toHaveLength(2);
  });

  it('emitter sources[] ignored when graph output binds to it', () => {
    const gltf: GltfDocument = {
      extensionsUsed: ['KHR_audio_emitter', 'KHR_audio_graph'],
      extensions: {
        KHR_audio_emitter: {
          audio: [{ uri: 'a.wav' }],
          sources: [{ audio: 0, gain: 1.0 }],
          emitters: [{ type: 'global', gain: 1.0, sources: [0] }], // sources present but should be ignored
        },
        KHR_audio_graph: {
          graphs: [{
            nodes: [{ kind: 'oscillator', params: { type: 'sine', frequency: 440 } }],
            connections: [],
            outputs: [{ node: 0, emitter: 0 }],
          }],
        },
      },
    };

    const result = parseLayeredExtensions(gltf);
    const spec = result.graphs[0];
    // Graph has oscillator + emitter. The emitter.sources[0] is NOT
    // expanded into an audio-buffer-source because the graph provides signal.
    const absSources = spec.nodes.filter(n => n.kind === 'audio-buffer-source');
    expect(absSources).toHaveLength(0);
  });

  it('extracts encoding properties extension on audio data', () => {
    const gltf: GltfDocument = {
      extensionsUsed: ['KHR_audio_emitter', 'KHR_audio_graph'],
      extensions: {
        KHR_audio_emitter: {
          audio: [{
            uri: 'music.mp3',
            extensions: {
              KHR_audio_graph: {
                encoding: { sampleRate: 44100, channels: 2, bitsPerSample: 16, duration: 180.5 },
              },
            },
          }],
          sources: [{ audio: 0, gain: 1.0 }],
          emitters: [{ type: 'global', gain: 1.0, sources: [] }],
        },
        KHR_audio_graph: {
          graphs: [{
            nodes: [{ kind: 'gain', params: { gain: 1.0 } }],
            connections: [],
            inputs: [{ source: 0, node: 0 }],
            outputs: [{ node: 0, emitter: 0 }],
          }],
        },
      },
    };

    const result = parseLayeredExtensions(gltf);
    // Encoding info is stored on the raw audioEmitter reference
    const encoding = result.audioEmitter.audio[0].extensions?.KHR_audio_graph?.encoding;
    expect(encoding?.sampleRate).toBe(44100);
    expect(encoding?.channels).toBe(2);
    expect(encoding?.duration).toBe(180.5);
  });

  it('extracts listener from KHR_audio_environment on nodes', () => {
    const gltf: GltfDocument = {
      extensionsUsed: ['KHR_audio_emitter', 'KHR_audio_environment'],
      extensions: {
        KHR_audio_emitter: {
          audio: [],
          sources: [],
          emitters: [{ type: 'global', gain: 1.0, sources: [] }],
        },
        KHR_audio_environment: {
          listeners: [{ name: 'Player', spatializationModel: 'HRTF' }],
          environments: [],
        },
      },
      nodes: [{ name: 'Camera', extensions: { KHR_audio_environment: { listener: 0 } } }],
    };

    const result = parseLayeredExtensions(gltf);
    expect(result.listener).toBeDefined();
    expect(result.listener!.listener.spatializationModel).toBe('HRTF');
    expect(result.listener!.nodeIndex).toBe(0);
  });

  it('extracts environment from KHR_audio_environment on scenes', () => {
    const gltf: GltfDocument = {
      extensionsUsed: ['KHR_audio_emitter', 'KHR_audio_environment'],
      extensions: {
        KHR_audio_emitter: {
          audio: [],
          sources: [],
          emitters: [{ type: 'global', gain: 1.0, sources: [] }],
        },
        KHR_audio_environment: {
          listeners: [],
          environments: [{ name: 'Room', reverb: { type: 'parametric', mix: 0.4, decayTime: 2.0 } }],
        },
      },
      scenes: [{ extensions: { KHR_audio_environment: { environment: 0 } } }],
    };

    const result = parseLayeredExtensions(gltf);
    expect(result.environment).toBeDefined();
    expect(result.environment!.environment.reverb?.type).toBe('parametric');
    expect(result.environment!.environment.reverb?.decayTime).toBe(2.0);
    expect(result.environment!.sceneIndex).toBe(0);
  });

  it('throws when KHR_audio_emitter is missing', () => {
    const gltf = { extensionsUsed: [] } as any;
    expect(() => parseLayeredExtensions(gltf)).toThrow('Missing required extension: KHR_audio_emitter');
  });

  it('positional emitter maps spatial properties correctly', () => {
    const gltf: GltfDocument = {
      extensionsUsed: ['KHR_audio_emitter', 'KHR_audio_graph'],
      extensions: {
        KHR_audio_emitter: {
          audio: [],
          sources: [],
          emitters: [{
            type: 'positional',
            gain: 0.8,
            sources: [],
            positional: {
              distanceModel: 'inverse',
              refDistance: 1.0,
              maxDistance: 50.0,
              rolloffFactor: 1.0,
              coneInnerAngle: 1.57,
              coneOuterAngle: 3.14,
              coneOuterGain: 0.3,
            },
          }],
        },
        KHR_audio_graph: {
          graphs: [{
            nodes: [{ kind: 'oscillator', params: { type: 'sine', frequency: 440 } }],
            connections: [],
            outputs: [{ node: 0, emitter: 0 }],
          }],
        },
      },
    };

    const result = parseLayeredExtensions(gltf);
    const emitter = result.graphs[0].nodes.find(n => n.kind === 'emitter');
    expect(emitter).toBeDefined();
    const p = emitter!.params as any;
    expect(p.emitterType).toBe('spatial');
    expect(p.gain).toBe(0.8);
    expect(p.spatialProperties.attenuation.distanceModel).toBe('inverse');
    expect(p.spatialProperties.attenuation.refDistance).toBe(1.0);
    expect(p.spatialProperties.attenuation.maxDistance).toBe(50.0);
    expect(p.spatialProperties.attenuation.coneInnerAngle).toBe(1.57);
    expect(p.spatialProperties.attenuation.coneOuterGain).toBe(0.3);
  });
});

describe('parseLayeredExtensions r2', () => {
  it('oscillator source data becomes a runtime oscillator node with scheduling', () => {
    const gltf: GltfDocument = {
      extensions: {
        KHR_audio_emitter: {
          audio: [],
          sources: [{
            gain: 0.5,
            extensions: {
              KHR_audio_graph: {
                oscillator: { type: 'sine', frequency: 220, detune: 5 },
                when: 0.1,
                duration: 0.4,
              },
            },
          }],
          emitters: [{ type: 'global', gain: 1.0, sources: [] }],
        },
        KHR_audio_graph: {
          graphs: [{
            name: 'synth',
            nodes: [{ kind: 'gain', params: { gain: 0.3 } }],
            connections: [],
            inputs: [{ source: 0, node: 0 }],
            outputs: [{ node: 0, emitter: 0 }],
          }],
        },
      },
    };
    const result = parseLayeredExtensions(gltf);
    const osc = result.graphs[0].nodes.find(n => n.kind === 'oscillator');
    expect(osc).toBeDefined();
    expect(osc!.params!.frequency).toBe(220);
    expect(osc!.params!.detune).toBe(5);
    expect(osc!.params!.startTime).toBeCloseTo(0.1, 6);
    expect(osc!.params!.stopTime).toBeCloseTo(0.5, 6);
    expect(osc!.params!.gain).toBe(0.5);
  });

  it('derives splitter/merger port counts from connections (rules 9/10)', () => {
    const gltf: GltfDocument = {
      extensions: {
        KHR_audio_emitter: {
          audio: [{ uri: 'a.mp3' }],
          sources: [{ audio: 0 }],
          emitters: [{ type: 'global', gain: 1.0, sources: [] }],
        },
        KHR_audio_graph: {
          graphs: [{
            name: 'channels',
            nodes: [
              { kind: 'splitter', params: {} },
              { kind: 'gain', params: {} },
              { kind: 'channelmerger', params: {} },
            ],
            connections: [
              { from: { node: 0, output: 0 }, to: { node: 2, input: 0 } },
              { from: { node: 0, output: 3 }, to: { node: 1 } },
              { from: { node: 1 }, to: { node: 2, input: 5 } },
            ],
            inputs: [{ source: 0, node: 0 }],
            outputs: [{ node: 2, emitter: 0 }],
          }],
        },
      },
    };
    const result = parseLayeredExtensions(gltf);
    const splitter = result.graphs[0].nodes.find(n => n.kind === 'channel-splitter');
    const merger = result.graphs[0].nodes.find(n => n.kind === 'channel-merger');
    expect(splitter!.params!.numberOfOutputs).toBe(4); // max output port 3 + 1
    expect(merger!.params!.numberOfInputs).toBe(6); // max input port 5 + 1
  });
});
