import { describe, it, expect, vi } from 'vitest';
import { applyListener, createListenerBus } from '../src/runtime/listener';
import type { Listener } from '../src/types';

function mockContext() {
  return {
    currentTime: 0,
    listener: {
      positionX: { setValueAtTime: vi.fn() },
      positionY: { setValueAtTime: vi.fn() },
      positionZ: { setValueAtTime: vi.fn() },
      forwardX: { setValueAtTime: vi.fn() },
      forwardY: { setValueAtTime: vi.fn() },
      forwardZ: { setValueAtTime: vi.fn() },
      upX: { setValueAtTime: vi.fn() },
      upY: { setValueAtTime: vi.fn() },
      upZ: { setValueAtTime: vi.fn() },
    },
  } as any;
}

describe('applyListener', () => {
  it('returns HRTF model', () => {
    const ctx = mockContext();
    const listener: Listener = { spatializationModel: 'HRTF' };
    const model = applyListener(ctx, listener);
    expect(model).toBe('HRTF');
  });

  it('returns equalpower model by default', () => {
    const ctx = mockContext();
    const listener: Listener = {};
    const model = applyListener(ctx, listener);
    expect(model).toBe('equalpower');
  });

  it('returns custom model with profile', () => {
    const ctx = mockContext();
    const listener: Listener = {
      spatializationModel: 'custom',
      hrtf: { profile: 'medium' },
    };
    const model = applyListener(ctx, listener);
    expect(model).toBe('custom');
  });

  it('sets position from transform translation', () => {
    const ctx = mockContext();
    const listener: Listener = { spatializationModel: 'HRTF' };
    applyListener(ctx, listener, { translation: [1, 2, 3] });
    expect(ctx.listener.positionX.setValueAtTime).toHaveBeenCalledWith(1, 0);
    expect(ctx.listener.positionY.setValueAtTime).toHaveBeenCalledWith(2, 0);
    expect(ctx.listener.positionZ.setValueAtTime).toHaveBeenCalledWith(3, 0);
  });

  it('sets orientation from transform rotation', () => {
    const ctx = mockContext();
    const listener: Listener = { spatializationModel: 'equalpower' };
    // Identity quaternion [0, 0, 0, 1] → forward = [0, 0, -1], up = [0, 1, 0]
    applyListener(ctx, listener, { rotation: [0, 0, 0, 1] });
    expect(ctx.listener.forwardX.setValueAtTime).toHaveBeenCalledWith(0, 0);
    expect(ctx.listener.forwardY.setValueAtTime).toHaveBeenCalledWith(0, 0);
    expect(ctx.listener.forwardZ.setValueAtTime).toHaveBeenCalledWith(-1, 0);
    expect(ctx.listener.upX.setValueAtTime).toHaveBeenCalledWith(0, 0);
    expect(ctx.listener.upY.setValueAtTime).toHaveBeenCalledWith(1, 0);
    expect(ctx.listener.upZ.setValueAtTime).toHaveBeenCalledWith(0, 0);
  });

  it('logs with trace', () => {
    const ctx = mockContext();
    const listener: Listener = { spatializationModel: 'HRTF' };
    const trace = { log: vi.fn(), getLines: () => [] };
    applyListener(ctx, listener, undefined, trace);
    expect(trace.log).toHaveBeenCalledWith('applyListener spatializationModel=HRTF gain=1');
  });
});

describe('createListenerBus', () => {
  function mockBusContext() {
    const gain = { gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() };
    return {
      ctx: {
        destination: {},
        createGain: vi.fn(() => gain),
      } as any,
      gain,
    };
  }

  it('carries listener.gain and connects to destination', () => {
    const { ctx, gain } = mockBusContext();
    const bus = createListenerBus(ctx, { gain: 0.5 });
    expect(bus).toBe(gain);
    expect(gain.gain.value).toBeCloseTo(0.5, 5);
    expect(gain.connect).toHaveBeenCalledWith(ctx.destination);
  });

  it('defaults to unity gain without a listener', () => {
    const { ctx, gain } = mockBusContext();
    createListenerBus(ctx, undefined);
    expect(gain.gain.value).toBe(1.0);
  });
});
