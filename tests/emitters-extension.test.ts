import { describe, it, expect, vi } from 'vitest';
import { applyEmitterInstancesFromExtension } from '../src/runtime/emitters';
import type { AudioEmitter, BuiltGraph } from '../src/types';

function mockGainNode(gainValue = 1.0) {
  return {
    gain: { value: gainValue },
    connect: vi.fn(),
    disconnect: vi.fn(),
  };
}

function mockPannerNode() {
  return {
    panningModel: 'equalpower' as string,
    distanceModel: 'inverse' as string,
    refDistance: 1,
    maxDistance: 10000,
    rolloffFactor: 1,
    coneInnerAngle: 360,
    coneOuterAngle: 360,
    coneOuterGain: 0,
    positionX: { setValueAtTime: vi.fn() },
    positionY: { setValueAtTime: vi.fn() },
    positionZ: { setValueAtTime: vi.fn() },
    orientationX: { setValueAtTime: vi.fn() },
    orientationY: { setValueAtTime: vi.fn() },
    orientationZ: { setValueAtTime: vi.fn() },
    connect: vi.fn(),
    disconnect: vi.fn(),
  };
}

function mockContext() {
  return {
    currentTime: 0,
    destination: {},
    createGain: vi.fn(() => mockGainNode()),
    createPanner: vi.fn(() => mockPannerNode()),
  } as any;
}

function mockBuiltGraph(ctx: any, emitterBusId: string): BuiltGraph {
  const busNode = mockGainNode();
  return {
    context: ctx,
    nodes: new Map(),
    _inputs: new Map([[emitterBusId, busNode as any]]),
    _outputs: new Map(),
  };
}

describe('applyEmitterInstancesFromExtension', () => {
  it('global emitter creates gain → destination', () => {
    const ctx = mockContext();
    const built = mockBuiltGraph(ctx, 'emitter_0');
    const emitter: AudioEmitter = { type: 'global', gain: 0.7, sources: [] };

    applyEmitterInstancesFromExtension(built, [
      { emitterNodeId: 'emitter_0', emitter },
    ]);

    expect(ctx.createGain).toHaveBeenCalled();
    // Post gain should connect to destination
    const postGain = ctx.createGain.mock.results[0].value;
    expect(postGain.connect).toHaveBeenCalledWith(ctx.destination);
    expect(postGain.gain.value).toBe(0.7);
  });

  it('positional emitter creates panner + gain → destination', () => {
    const ctx = mockContext();
    const built = mockBuiltGraph(ctx, 'emitter_0');
    const emitter: AudioEmitter = {
      type: 'positional',
      gain: 0.5,
      sources: [],
      positional: {
        distanceModel: 'inverse',
        refDistance: 1.0,
        maxDistance: 50.0,
        rolloffFactor: 1.5,
      },
    };

    applyEmitterInstancesFromExtension(built, [
      { emitterNodeId: 'emitter_0', emitter, translation: [5, 0, 3] },
    ]);

    expect(ctx.createPanner).toHaveBeenCalled();
    expect(ctx.createGain).toHaveBeenCalled();
    const panner = ctx.createPanner.mock.results[0].value;
    expect(panner.refDistance).toBe(1.0);
    expect(panner.maxDistance).toBe(50.0);
    expect(panner.rolloffFactor).toBe(1.5);
    // Position should be set
    expect(panner.positionX.setValueAtTime).toHaveBeenCalledWith(5, 0);
    expect(panner.positionZ.setValueAtTime).toHaveBeenCalledWith(3, 0);
  });

  it('spatial properties mapping (cone angles)', () => {
    const ctx = mockContext();
    const built = mockBuiltGraph(ctx, 'emitter_0');
    const emitter: AudioEmitter = {
      type: 'positional',
      gain: 1.0,
      sources: [],
      positional: {
        distanceModel: 'inverse',
        coneInnerAngle: 1.57,
        coneOuterAngle: 3.14,
        coneOuterGain: 0.2,
      },
    };

    applyEmitterInstancesFromExtension(built, [
      { emitterNodeId: 'emitter_0', emitter },
    ]);

    const panner = ctx.createPanner.mock.results[0].value;
    expect(panner.coneInnerAngle).toBeCloseTo(89.954, 2);
    expect(panner.coneOuterAngle).toBeCloseTo(179.909, 2);
    expect(panner.coneOuterGain).toBe(0.2);
  });

  it('listener spatializationModel applied as default panning model', () => {
    const ctx = mockContext();
    const built = mockBuiltGraph(ctx, 'emitter_0');
    const emitter: AudioEmitter = {
      type: 'positional',
      gain: 1.0,
      sources: [],
      positional: { distanceModel: 'inverse' },
    };

    applyEmitterInstancesFromExtension(built, [
      { emitterNodeId: 'emitter_0', emitter },
    ], 'HRTF');

    const panner = ctx.createPanner.mock.results[0].value;
    expect(panner.panningModel).toBe('HRTF');
  });

  it('equalpower is default when no spatializationModel provided', () => {
    const ctx = mockContext();
    const built = mockBuiltGraph(ctx, 'emitter_0');
    const emitter: AudioEmitter = {
      type: 'positional',
      gain: 1.0,
      sources: [],
      positional: { distanceModel: 'inverse' },
    };

    applyEmitterInstancesFromExtension(built, [
      { emitterNodeId: 'emitter_0', emitter },
    ]);

    const panner = ctx.createPanner.mock.results[0].value;
    expect(panner.panningModel).toBe('equalpower');
  });

  it('skips binding when bus not found', () => {
    const ctx = mockContext();
    const built = mockBuiltGraph(ctx, 'emitter_0');
    const emitter: AudioEmitter = { type: 'global', gain: 1.0, sources: [] };
    const trace = { log: vi.fn(), getLines: () => [] };

    applyEmitterInstancesFromExtension(built, [
      { emitterNodeId: 'nonexistent', emitter },
    ], undefined, trace);

    expect(trace.log).toHaveBeenCalledWith('warn: emitter bus not found for nonexistent');
    expect(ctx.createGain).not.toHaveBeenCalled();
  });

  it('uses provided destination node instead of context destination', () => {
    const ctx = mockContext();
    const built = mockBuiltGraph(ctx, 'emitter_0');
    const emitter: AudioEmitter = { type: 'global', gain: 0.7, sources: [] };
    const customDestination = { connect: vi.fn() } as any;

    applyEmitterInstancesFromExtension(
      built,
      [{ emitterNodeId: 'emitter_0', emitter }],
      undefined,
      undefined,
      customDestination,
    );

    const postGain = ctx.createGain.mock.results[0].value;
    expect(postGain.connect).toHaveBeenCalledWith(customDestination);
  });
});
