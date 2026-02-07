import { describe, it, expect, vi } from 'vitest';
import { applyEnvironment } from '../src/runtime/environment';
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

describe('applyEnvironment', () => {
  it('parametric reverb creates processing chain', async () => {
    const ctx = mockContext();
    const built = mockBuiltGraph(ctx);
    const env: Environment = {
      reverb: {
        type: 'parametric',
        mix: 0.4,
        decayTime: 2.0,
        reflectionDelay: 0.02,
        reverbDelay: 0.04,
      },
    };
    const trace = { log: vi.fn(), getLines: () => [] };

    await applyEnvironment(ctx, env, built, undefined, undefined, trace);

    // Should have created gain nodes for dry/wet/output + delay
    expect(ctx.createGain).toHaveBeenCalled();
    expect(ctx.createDelay).toHaveBeenCalled();
    expect((built as any)._environment).toBeDefined();
    expect(trace.log).toHaveBeenCalled();
  });

  it('impulse response reverb creates ConvolverNode', async () => {
    const ctx = mockContext();
    const built = mockBuiltGraph(ctx);
    const env: Environment = {
      reverb: {
        type: 'impulseResponse',
        mix: 0.5,
        audio: 0,
      },
    };
    const audioEmitter = {
      audio: [{ uri: 'ir.wav' }],
      sources: [],
      emitters: [],
    };
    const fakeBuffer = {} as AudioBuffer;
    const loadBuffer = vi.fn().mockResolvedValue(fakeBuffer);

    await applyEnvironment(ctx, env, built, audioEmitter, loadBuffer);

    expect(ctx.createConvolver).toHaveBeenCalled();
    expect(loadBuffer).toHaveBeenCalledWith('ir.wav', ctx);
  });

  it('wet/dry mix: dry gain = 1-mix, wet gain = mix', async () => {
    const ctx = mockContext();
    const gains: any[] = [];
    ctx.createGain = vi.fn(() => {
      const g = mockGainNode();
      gains.push(g);
      return g;
    });
    const built = mockBuiltGraph(ctx);
    const env: Environment = {
      reverb: { type: 'parametric', mix: 0.3 },
    };

    await applyEnvironment(ctx, env, built);

    // First gain is dry, second is wet
    const dryGain = gains[0];
    const wetGain = gains[1];
    expect(dryGain.gain.value).toBeCloseTo(0.7, 5);
    expect(wetGain.gain.value).toBeCloseTo(0.3, 5);
  });

  it('no-op when no reverb configured', async () => {
    const ctx = mockContext();
    const built = mockBuiltGraph(ctx);
    const env: Environment = {};
    const trace = { log: vi.fn(), getLines: () => [] };

    await applyEnvironment(ctx, env, built, undefined, undefined, trace);

    expect(ctx.createGain).not.toHaveBeenCalled();
    expect(trace.log).toHaveBeenCalledWith('applyEnvironment: no reverb configured');
  });
});
