import { describe, it, expect, vi } from 'vitest';
import { applyEnvironment, createReverbBus, generateReverbImpulse } from '../src/runtime/environment';
import { resolveReverbParams } from '../src/runtime/spatial';
import type { Environment, BuiltGraph } from '../src/types';

function mockGainNode(gainValue = 1.0) {
  return {
    gain: { value: gainValue },
    connect: vi.fn(),
    disconnect: vi.fn(),
  };
}

function mockDelayNode() {
  return {
    delayTime: { value: 0 },
    connect: vi.fn(),
    disconnect: vi.fn(),
  };
}

function mockConvolverNode() {
  return {
    buffer: null as any,
    normalize: true,
    connect: vi.fn(),
    disconnect: vi.fn(),
  };
}

function mockBiquadNode() {
  return {
    type: 'lowpass',
    frequency: { value: 350 },
    Q: { value: 1 },
    connect: vi.fn(),
    disconnect: vi.fn(),
  };
}

function mockContext() {
  return {
    currentTime: 0,
    sampleRate: 48000,
    destination: { connect: vi.fn() },
    createGain: vi.fn(() => mockGainNode()),
    createDelay: vi.fn(() => mockDelayNode()),
    createConvolver: vi.fn(() => mockConvolverNode()),
    createBiquadFilter: vi.fn(() => mockBiquadNode()),
    createBuffer: vi.fn((channels: number, length: number, rate: number) => {
      const data = Array.from({ length: channels }, () => new Float32Array(length));
      return {
        numberOfChannels: channels,
        length,
        sampleRate: rate,
        getChannelData: (ch: number) => data[ch],
      };
    }),
  } as any;
}

function mockBuiltGraph(ctx: any): BuiltGraph {
  return {
    context: ctx,
    nodes: new Map(),
    _inputs: new Map(),
    _outputs: new Map(),
  };
}

describe('generateReverbImpulse', () => {
  it('IR length covers reflectionsDelay + reverbDelay + decayTime', () => {
    const ctx = mockContext();
    const params = resolveReverbParams({ decayTime: 2.0, reflectionsDelay: 0.02, reverbDelay: 0.04 });
    const buffer = generateReverbImpulse(ctx, params);
    expect(buffer.numberOfChannels).toBe(2);
    expect(buffer.length).toBe(Math.floor(48000 * (0.02 + 0.04 + 2.0)));
  });

  it('tail decays: late energy is far below early energy (no runaway)', () => {
    const ctx = mockContext();
    const params = resolveReverbParams({ preset: 'smallRoom' });
    const buffer = generateReverbImpulse(ctx, params);
    const data = buffer.getChannelData(0);
    const rms = (from: number, to: number) => {
      let sum = 0;
      for (let i = from; i < to; i += 1) sum += data[i] * data[i];
      return Math.sqrt(sum / (to - from));
    };
    const head = rms(0, Math.floor(buffer.length * 0.2));
    const tail = rms(Math.floor(buffer.length * 0.8), buffer.length);
    expect(tail).toBeLessThan(head * 0.2);
  });

  it('preset provides parameters; explicit values override (via IR length)', () => {
    const ctx = mockContext();
    // cathedral preset decayTime 5.5, overridden to 1.0
    const params = resolveReverbParams({ preset: 'cathedral', decayTime: 1.0 });
    const buffer = generateReverbImpulse(ctx, params);
    expect(buffer.length).toBe(Math.floor(48000 * (0.025 + 0.04 + 1.0)));
  });
});

describe('createReverbBus', () => {
  it('parametric reverb builds a generated-IR convolver (no feedback topology)', async () => {
    const ctx = mockContext();
    const convolvers: any[] = [];
    ctx.createConvolver = vi.fn(() => {
      const c = mockConvolverNode();
      convolvers.push(c);
      return c;
    });
    const env: Environment = {
      reverb: { type: 'parametric', decayTime: 2.0, reflectionsDelay: 0.02, reverbDelay: 0.04 },
    };
    const trace = { log: vi.fn(), getLines: () => [] };

    const bus = await createReverbBus(ctx, env, undefined, undefined, trace);

    expect(bus.input).toBeDefined();
    expect(bus.output).toBeDefined();
    expect(ctx.createConvolver).toHaveBeenCalledTimes(1);
    expect(convolvers[0].buffer).toBeTruthy();
    expect(ctx.createDelay).not.toHaveBeenCalled(); // no comb/feedback nodes
    expect(trace.log).toHaveBeenCalled();
  });

  it('impulse response reverb creates ConvolverNode and honors normalize', async () => {
    const ctx = mockContext();
    const convolvers: any[] = [];
    ctx.createConvolver = vi.fn(() => {
      const c = mockConvolverNode();
      convolvers.push(c);
      return c;
    });
    const env: Environment = {
      reverb: { type: 'impulseResponse', mix: 0.5, audio: 0, normalize: false },
    };
    const audioEmitter = { audio: [{ uri: 'ir.wav' }], sources: [], emitters: [] };
    const fakeBuffer = {} as AudioBuffer;
    const loadBuffer = vi.fn().mockResolvedValue(fakeBuffer);

    await createReverbBus(ctx, env, audioEmitter, loadBuffer);

    expect(ctx.createConvolver).toHaveBeenCalled();
    expect(loadBuffer).toHaveBeenCalledWith('ir.wav', ctx);
    expect(convolvers[0].normalize).toBe(false);
    expect(convolvers[0].buffer).toBe(fakeBuffer);
  });
});

describe('applyEnvironment', () => {
  it('no-op when no reverb configured', async () => {
    const ctx = mockContext();
    const built = mockBuiltGraph(ctx);
    const trace = { log: vi.fn(), getLines: () => [] };

    await applyEnvironment(ctx, {}, built, undefined, undefined, trace);

    expect(ctx.createGain).not.toHaveBeenCalled();
    expect(trace.log).toHaveBeenCalledWith('applyEnvironment: no reverb configured');
  });

  it('creates mix gain at reverb.mix and stores environment state', async () => {
    const ctx = mockContext();
    const gains: any[] = [];
    ctx.createGain = vi.fn(() => {
      const g = mockGainNode();
      gains.push(g);
      return g;
    });
    const built = mockBuiltGraph(ctx);
    const env: Environment = { reverb: { type: 'parametric', mix: 0.3 } };

    await applyEnvironment(ctx, env, built);

    const state = (built as any)._environment;
    expect(state).toBeDefined();
    expect(state.mixGain.gain.value).toBeCloseTo(0.3, 5);
    expect(state.params.decayTime).toBeCloseTo(1.5, 5);
  });

  it('per-emitter sends: rewires emitter into direct + reverb send at declared levels', async () => {
    const ctx = mockContext();
    const built = mockBuiltGraph(ctx);
    const env: Environment = { reverb: { preset: 'smallRoom', mix: 0.5 } };
    const emitterOut = mockGainNode();
    const trace = { log: vi.fn(), getLines: () => [] };

    await applyEnvironment(ctx, env, built, undefined, undefined, trace, {
      sends: [{ node: emitterOut as any, directLevel: 0.9, reverbLevel: 0.4, label: 'emitter_0' }],
    });

    // Emitter was disconnected from its previous target and re-fanned into two gains
    expect(emitterOut.disconnect).toHaveBeenCalled();
    expect(emitterOut.connect).toHaveBeenCalledTimes(2);
    const state = (built as any)._environment;
    expect(state.sends).toHaveLength(1);
    expect(state.sends[0].direct.gain.value).toBeCloseTo(0.9, 5);
    expect(state.sends[0].send.gain.value).toBeCloseTo(0.4, 5);
  });

  it('routes into a custom destination (listener bus)', async () => {
    const ctx = mockContext();
    const built = mockBuiltGraph(ctx);
    const listenerBus = mockGainNode();
    const env: Environment = { reverb: { preset: 'generic' } };

    await applyEnvironment(ctx, env, built, undefined, undefined, undefined, {
      destination: listenerBus as any,
      sends: [{ node: mockGainNode() as any, directLevel: 1, reverbLevel: 1 }],
    });

    const state = (built as any)._environment;
    expect(state.destination).toBe(listenerBus);
    // mix gain connects to the listener bus, not ctx.destination
    expect(state.mixGain.connect).toHaveBeenCalledWith(listenerBus);
  });
});
