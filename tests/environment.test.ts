import { describe, it, expect, vi } from 'vitest';
import { applyEnvironment, createReverbBus } from '../src/runtime/environment';
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
    destination: { connect: vi.fn() },
    createGain: vi.fn(() => mockGainNode()),
    createDelay: vi.fn(() => mockDelayNode()),
    createConvolver: vi.fn(() => mockConvolverNode()),
    createBiquadFilter: vi.fn(() => mockBiquadNode()),
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

describe('createReverbBus', () => {
  it('parametric reverb builds early + late chain with in-loop lowpass', async () => {
    const ctx = mockContext();
    const env: Environment = {
      reverb: { type: 'parametric', decayTime: 2.0, reflectionsDelay: 0.02, reverbDelay: 0.04 },
    };
    const trace = { log: vi.fn(), getLines: () => [] };

    const bus = await createReverbBus(ctx, env, undefined, undefined, trace);

    expect(bus.input).toBeDefined();
    expect(bus.output).toBeDefined();
    expect(ctx.createDelay).toHaveBeenCalledTimes(2); // early + late
    expect(ctx.createBiquadFilter).toHaveBeenCalledTimes(1); // decayHFRatio loop filter
    expect(trace.log).toHaveBeenCalled();
  });

  it('preset provides parameters; explicit values override', async () => {
    const ctx = mockContext();
    const delays: any[] = [];
    ctx.createDelay = vi.fn(() => {
      const d = mockDelayNode();
      delays.push(d);
      return d;
    });
    const env: Environment = {
      reverb: { preset: 'cathedral', reflectionsDelay: 0.1 }, // override preset's 0.025
    };

    await createReverbBus(ctx, env);

    expect(delays[0].delayTime.value).toBeCloseTo(0.1, 5); // early delay = overridden
    expect(delays[1].delayTime.value).toBeCloseTo(0.04, 5); // late delay = cathedral preset
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
