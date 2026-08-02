import { describe, it, expect } from 'vitest';
import {
  REVERB_PRESETS,
  resolveReverbParams,
  selectEnvironment,
  selectActiveListener,
  computeDopplerPitch,
  computeAirAbsorptionCutoff,
  computeConeCutoff,
  combineCutoffs,
  sampleDistanceCurve,
  distanceToZoneBoundary,
  worldToLocal,
} from '../src/runtime/spatial';
import type { EnvironmentZoneBinding, GltfDocument } from '../src/types';

const TAU = Math.PI * 2;

describe('resolveReverbParams', () => {
  it('defaults match the spec table', () => {
    const p = resolveReverbParams(undefined);
    expect(p.mix).toBe(0.5);
    expect(p.decayTime).toBe(1.5);
    expect(p.decayHFRatio).toBe(0.83);
    expect(p.reflectionsDelay).toBe(0.02);
    expect(p.reverbDelay).toBe(0.04);
    expect(p.diffusion).toBe(1.0);
    expect(p.density).toBe(1.0);
  });

  it('preset is a full assignment; explicit props override', () => {
    const p = resolveReverbParams({ preset: 'hangar', decayTime: 3.0 });
    expect(p.decayTime).toBe(3.0); // explicit wins
    expect(p.decayHFRatio).toBe(0.23); // from hangar preset
  });

  it('all 13 spec presets exist', () => {
    const names = [
      'generic', 'smallRoom', 'mediumRoom', 'largeRoom', 'bathroom',
      'concertHall', 'cathedral', 'cave', 'arena', 'hangar',
      'corridor', 'forest', 'underwater',
    ];
    for (const n of names) expect(REVERB_PRESETS[n], n).toBeDefined();
  });

  it('unknown preset falls back to defaults', () => {
    const p = resolveReverbParams({ preset: 'vendorSpecific' });
    expect(p.decayTime).toBe(1.5);
  });
});

describe('zone geometry', () => {
  it('point in box: negative distance inside, positive outside', () => {
    const box = { type: 'box', size: [4, 2, 6] as [number, number, number] };
    expect(distanceToZoneBoundary([0, 0, 0], box)).toBeLessThan(0);
    expect(distanceToZoneBoundary([1.9, 0, 0], box)).toBeLessThan(0);
    expect(distanceToZoneBoundary([2.1, 0, 0], box)).toBeGreaterThan(0);
    expect(distanceToZoneBoundary([0, 0, 3.5], box)).toBeCloseTo(0.5, 5);
  });

  it('point in sphere', () => {
    const sphere = { type: 'sphere', radius: 5 };
    expect(distanceToZoneBoundary([0, 3, 0], sphere)).toBeCloseTo(-2, 5);
    expect(distanceToZoneBoundary([0, 7, 0], sphere)).toBeCloseTo(2, 5);
  });

  it('worldToLocal applies inverse translation and scale', () => {
    const local = worldToLocal([12, 0, 0], { translation: [10, 0, 0], scale: [2, 2, 2] });
    expect(local[0]).toBeCloseTo(1, 5);
  });
});

function zone(partial: Partial<EnvironmentZoneBinding> & { environmentIndex: number }): EnvironmentZoneBinding {
  return {
    nodeIndex: 0,
    environment: {},
    shape: { type: 'sphere', radius: 5 },
    blendDistance: 0,
    priority: 0,
    ...partial,
  } as EnvironmentZoneBinding;
}

describe('selectEnvironment (spec 2.3)', () => {
  it('falls back to scene default outside all zones', () => {
    const sel = selectEnvironment([zone({ environmentIndex: 1 })], 0, [100, 0, 0]);
    expect(sel.environmentIndex).toBe(0);
    expect(sel.zone).toBeUndefined();
  });

  it('picks the containing zone', () => {
    const sel = selectEnvironment([zone({ environmentIndex: 1 })], 0, [1, 0, 0]);
    expect(sel.environmentIndex).toBe(1);
  });

  it('higher priority wins among overlapping zones', () => {
    const zones = [
      zone({ environmentIndex: 1, priority: 0, shape: { type: 'sphere', radius: 10 } }),
      zone({ environmentIndex: 2, priority: 5, shape: { type: 'sphere', radius: 10 } }),
    ];
    expect(selectEnvironment(zones, 0, [0, 0, 0]).environmentIndex).toBe(2);
  });

  it('equal priority: smaller volume wins (inner room beats building)', () => {
    const zones = [
      zone({ environmentIndex: 1, shape: { type: 'box', size: [100, 100, 100] } }),
      zone({ environmentIndex: 2, shape: { type: 'box', size: [4, 3, 5] } }),
    ];
    const sel = selectEnvironment(zones, 0, [0, 0, 0]);
    expect(sel.environmentIndex).toBe(2);
    expect(sel.outsideEnvironmentIndex).toBe(1); // blend target is the enclosing zone
  });

  it('blendDistance produces a crossfade factor near the boundary', () => {
    const z = zone({ environmentIndex: 1, blendDistance: 2, shape: { type: 'sphere', radius: 10 } });
    expect(selectEnvironment([z], 0, [0, 0, 0]).blendToOutside).toBe(0); // deep inside
    const nearEdge = selectEnvironment([z], 0, [9, 0, 0]); // 1m from boundary, band=2
    expect(nearEdge.blendToOutside).toBeCloseTo(0.5, 5);
    expect(nearEdge.outsideEnvironmentIndex).toBe(0);
  });

  it('zone transform is honored', () => {
    const z = zone({
      environmentIndex: 1,
      shape: { type: 'sphere', radius: 1 },
      transform: { translation: [50, 0, 0] },
    });
    expect(selectEnvironment([z], 0, [50, 0, 0]).environmentIndex).toBe(1);
    expect(selectEnvironment([z], 0, [0, 0, 0]).environmentIndex).toBe(0);
  });
});

describe('computeDopplerPitch (spec 2.5)', () => {
  const doppler = { enabled: true, scale: 1.0, speedOfSound: 343.0 };

  it('disabled or static → 1.0', () => {
    expect(computeDopplerPitch(undefined, [0, 0, 0], [0, 0, 0], [10, 0, 0], [0, 0, 0])).toBe(1);
    expect(computeDopplerPitch({ enabled: false }, [0, 0, 0], [0, 0, 0], [10, 0, 0], [10, 0, 0])).toBe(1);
    expect(computeDopplerPitch(doppler, [0, 0, 0], [0, 0, 0], [10, 0, 0], [0, 0, 0])).toBeCloseTo(1, 9);
  });

  it('approaching emitter raises pitch: (c)/(c−v)', () => {
    // Emitter at +x moving toward listener at 34.3 m/s → vS = +34.3
    const pitch = computeDopplerPitch(doppler, [0, 0, 0], [0, 0, 0], [10, 0, 0], [-34.3, 0, 0]);
    expect(pitch).toBeCloseTo(343 / (343 - 34.3), 5);
  });

  it('receding emitter lowers pitch', () => {
    const pitch = computeDopplerPitch(doppler, [0, 0, 0], [0, 0, 0], [10, 0, 0], [34.3, 0, 0]);
    expect(pitch).toBeCloseTo(343 / (343 + 34.3), 5);
  });

  it('approaching listener raises pitch: (c+vL)/c', () => {
    const pitch = computeDopplerPitch(doppler, [0, 0, 0], [34.3, 0, 0], [10, 0, 0], [0, 0, 0]);
    expect(pitch).toBeCloseTo((343 + 34.3) / 343, 5);
  });

  it('receding listener lowers pitch', () => {
    const pitch = computeDopplerPitch(doppler, [0, 0, 0], [-34.3, 0, 0], [10, 0, 0], [0, 0, 0]);
    expect(pitch).toBeCloseTo((343 - 34.3) / 343, 5);
  });

  it('scale exaggerates the effect', () => {
    const base = computeDopplerPitch(doppler, [0, 0, 0], [0, 0, 0], [10, 0, 0], [-10, 0, 0]);
    const scaled = computeDopplerPitch({ ...doppler, scale: 2 }, [0, 0, 0], [0, 0, 0], [10, 0, 0], [-10, 0, 0]);
    expect(scaled).toBeGreaterThan(base);
  });

  it('denominator is clamped (no blow-up at supersonic approach)', () => {
    const pitch = computeDopplerPitch(doppler, [0, 0, 0], [0, 0, 0], [10, 0, 0], [-400, 0, 0]);
    expect(Number.isFinite(pitch)).toBe(true);
    expect(pitch).toBeGreaterThan(0);
  });
});

describe('computeAirAbsorptionCutoff (spec 3.4)', () => {
  it('20 kHz at refDistance, target cutoff at maxDistance, log-interpolated between', () => {
    expect(computeAirAbsorptionCutoff(1, 50, 5000, 1)).toBeCloseTo(20000, 0);
    expect(computeAirAbsorptionCutoff(1, 50, 5000, 50)).toBeCloseTo(5000, 0);
    const mid = computeAirAbsorptionCutoff(1, 50, 5000, 25.5); // halfway fraction
    expect(mid).toBeCloseTo(Math.exp((Math.log(20000) + Math.log(5000)) / 2), 0);
  });

  it('clamps beyond maxDistance and ignores invalid ranges (maxDistance 0 = disabled)', () => {
    expect(computeAirAbsorptionCutoff(1, 50, 5000, 200)).toBeCloseTo(5000, 0);
    expect(computeAirAbsorptionCutoff(1, 0, 5000, 10)).toBe(20000);
  });
});

describe('computeConeCutoff (spec 3.4)', () => {
  it('no filtering inside inner cone; full cutoff outside outer cone', () => {
    const inner = TAU / 6; // 60° diameter
    const outer = TAU / 3; // 120° diameter
    expect(computeConeCutoff(inner, outer, 3000, 0)).toBe(20000);
    expect(computeConeCutoff(inner, outer, 3000, TAU / 12)).toBe(20000); // at inner half-angle
    expect(computeConeCutoff(inner, outer, 3000, Math.PI)).toBe(3000); // behind
  });

  it('log-interpolates between the angles', () => {
    const inner = 0;
    const outer = Math.PI; // half-angle π/2
    const mid = computeConeCutoff(inner, outer, 2000, Math.PI / 4);
    expect(mid).toBeCloseTo(Math.exp((Math.log(20000) + Math.log(2000)) / 2), 0);
  });

  it('absent cutoff disables filtering', () => {
    expect(computeConeCutoff(1, 2, undefined, Math.PI)).toBe(20000);
  });

  it('combineCutoffs: lower cutoff dominates', () => {
    expect(combineCutoffs(20000, 3000)).toBeCloseTo(3000, 5);
  });
});

describe('sampleDistanceCurve (spec 3.3)', () => {
  const curve = [1.0, 0.8, 0.5, 0.3, 0.1, 0.0];

  it('endpoints map to refDistance / maxDistance', () => {
    expect(sampleDistanceCurve(curve, 1, 51, 1)).toBeCloseTo(1.0, 5);
    expect(sampleDistanceCurve(curve, 1, 51, 51)).toBeCloseTo(0.0, 5);
    expect(sampleDistanceCurve(curve, 1, 51, 100)).toBeCloseTo(0.0, 5); // clamped
  });

  it('linear interpolation between samples', () => {
    // fraction 0.3 → position 1.5 → between 0.8 and 0.5
    expect(sampleDistanceCurve(curve, 0, 10, 3)).toBeCloseTo(0.65, 5);
  });
});

describe('selectActiveListener (spec 1.3)', () => {
  function doc(overrides: Partial<GltfDocument> = {}): GltfDocument {
    return {
      extensions: {
        KHR_audio_emitter: { audio: [], sources: [], emitters: [] },
        KHR_audio_environment: {
          listeners: [{ name: 'A' }, { name: 'B' }],
        },
      },
      scenes: [{ nodes: [0, 1] }],
      nodes: [
        { name: 'plain', extensions: { KHR_audio_environment: { listener: 1 } } },
        { name: 'cam', camera: 0, extensions: { KHR_audio_environment: { listener: 0 } } },
      ],
      ...overrides,
    } as GltfDocument;
  }

  it('rule 1: scene activeListener wins', () => {
    const d = doc({ scenes: [{ nodes: [0, 1], extensions: { KHR_audio_environment: { activeListener: 1 } } }] });
    expect(selectActiveListener(d)?.listenerIndex).toBe(1);
  });

  it('rule 2: camera-bound listener beats earlier node binding', () => {
    expect(selectActiveListener(doc())?.listenerIndex).toBe(0);
    expect(selectActiveListener(doc())?.nodeIndex).toBe(1);
  });

  it('rule 3: first binding in node order when no camera binding', () => {
    const d = doc({
      nodes: [
        { name: 'plain', extensions: { KHR_audio_environment: { listener: 1 } } },
        { name: 'other', extensions: { KHR_audio_environment: { listener: 0 } } },
      ],
    });
    expect(selectActiveListener(d)?.listenerIndex).toBe(1);
  });

  it('rule 4: undefined when nothing is declared (implicit viewer listener)', () => {
    const d = doc({ nodes: [{ name: 'empty' }] });
    expect(selectActiveListener(d)).toBeUndefined();
  });
});
