import type {
  DopplerProperties,
  EnvironmentZoneBinding,
  GltfDocument,
  Listener,
  NodeTransform,
  ReverbProperties,
} from '../types.js';

// ---------------------------------------------------------------------------
// Reverb presets (KHR_audio_environment 2.4.1) — informative reference values
// derived from the I3DL2 preset table, converted to glTF units.
// ---------------------------------------------------------------------------

export interface ResolvedReverbParams {
  mix: number;
  decayTime: number;
  decayHFRatio: number;
  reflectionsGain: number;
  reflectionsDelay: number;
  reverbGain: number;
  reverbDelay: number;
  diffusion: number;
  density: number;
}

const REVERB_DEFAULTS: ResolvedReverbParams = {
  mix: 0.5,
  decayTime: 1.5,
  decayHFRatio: 0.83,
  reflectionsGain: 1.0,
  reflectionsDelay: 0.02,
  reverbGain: 1.0,
  reverbDelay: 0.04,
  diffusion: 1.0,
  density: 1.0,
};

export const REVERB_PRESETS: Record<string, Partial<ResolvedReverbParams>> = {
  generic:     { decayTime: 1.49,  decayHFRatio: 0.83, reflectionsDelay: 0.007, reverbDelay: 0.011 },
  smallRoom:   { decayTime: 0.4,   decayHFRatio: 0.83, reflectionsDelay: 0.002, reverbDelay: 0.003 },
  mediumRoom:  { decayTime: 1.1,   decayHFRatio: 0.83, reflectionsDelay: 0.01,  reverbDelay: 0.011 },
  largeRoom:   { decayTime: 4.32,  decayHFRatio: 0.59, reflectionsDelay: 0.02,  reverbDelay: 0.03 },
  bathroom:    { decayTime: 1.49,  decayHFRatio: 0.54, reflectionsDelay: 0.007, reverbDelay: 0.011 },
  concertHall: { decayTime: 3.92,  decayHFRatio: 0.7,  reflectionsDelay: 0.02,  reverbDelay: 0.029 },
  cathedral:   { decayTime: 5.5,   decayHFRatio: 0.6,  reflectionsDelay: 0.025, reverbDelay: 0.04 },
  cave:        { decayTime: 2.91,  decayHFRatio: 1.3,  reflectionsDelay: 0.015, reverbDelay: 0.022 },
  arena:       { decayTime: 7.24,  decayHFRatio: 0.33, reflectionsDelay: 0.02,  reverbDelay: 0.03 },
  hangar:      { decayTime: 10.05, decayHFRatio: 0.23, reflectionsDelay: 0.02,  reverbDelay: 0.03 },
  corridor:    { decayTime: 1.79,  decayHFRatio: 0.59, reflectionsDelay: 0.007, reverbDelay: 0.011 },
  forest:      { decayTime: 1.49,  decayHFRatio: 0.54, reflectionsDelay: 0.162, reverbDelay: 0.088 },
  underwater:  { decayTime: 1.49,  decayHFRatio: 0.1,  reflectionsDelay: 0.007, reverbDelay: 0.011 },
};

/** Preset provides the base assignment; explicit properties override (spec 2.4). */
export function resolveReverbParams(reverb: ReverbProperties | undefined): ResolvedReverbParams {
  const preset = reverb?.preset ? REVERB_PRESETS[reverb.preset] : undefined;
  const merged: ResolvedReverbParams = { ...REVERB_DEFAULTS, ...preset };
  if (!reverb) return merged;
  for (const key of Object.keys(REVERB_DEFAULTS) as (keyof ResolvedReverbParams)[]) {
    const v = (reverb as Record<string, unknown>)[key];
    if (typeof v === 'number') merged[key] = v;
  }
  return merged;
}

// ---------------------------------------------------------------------------
// Transforms and zone containment (spec 2.3)
// ---------------------------------------------------------------------------

export type Vec3 = [number, number, number];

function rotateVecByQuat(v: Vec3, q: [number, number, number, number]): Vec3 {
  const [x, y, z, w] = q;
  const tx = 2 * (y * v[2] - z * v[1]);
  const ty = 2 * (z * v[0] - x * v[2]);
  const tz = 2 * (x * v[1] - y * v[0]);
  return [
    v[0] + w * tx + (y * tz - z * ty),
    v[1] + w * ty + (z * tx - x * tz),
    v[2] + w * tz + (x * ty - y * tx),
  ];
}

/** World point → node-local space (TRS inverse; prototype: single node, no hierarchy). */
export function worldToLocal(point: Vec3, transform: NodeTransform | undefined): Vec3 {
  if (!transform) return point;
  const t = transform.translation ?? [0, 0, 0];
  let p: Vec3 = [point[0] - t[0], point[1] - t[1], point[2] - t[2]];
  if (transform.rotation) {
    const [x, y, z, w] = transform.rotation;
    p = rotateVecByQuat(p, [-x, -y, -z, w]); // conjugate = inverse for unit quats
  }
  const s = transform.scale ?? [1, 1, 1];
  return [p[0] / (s[0] || 1), p[1] / (s[1] || 1), p[2] / (s[2] || 1)];
}

/**
 * Signed distance (meters, in local units) from the point to the zone boundary.
 * Negative = inside. Used both for containment and blendDistance crossfades.
 */
export function distanceToZoneBoundary(localPoint: Vec3, shape: { type: string; size?: Vec3; radius?: number }): number {
  if (shape.type === 'sphere') {
    const r = shape.radius ?? 0;
    const d = Math.hypot(localPoint[0], localPoint[1], localPoint[2]);
    return d - r;
  }
  if (shape.type === 'box') {
    const half = (shape.size ?? [0, 0, 0]).map(v => v / 2);
    const q: Vec3 = [
      Math.abs(localPoint[0]) - half[0],
      Math.abs(localPoint[1]) - half[1],
      Math.abs(localPoint[2]) - half[2],
    ];
    const outside = Math.hypot(Math.max(q[0], 0), Math.max(q[1], 0), Math.max(q[2], 0));
    const inside = Math.min(Math.max(q[0], q[1], q[2]), 0);
    return outside + inside;
  }
  return Number.POSITIVE_INFINITY; // unknown shape: never contains
}

export function zoneVolume(shape: { type: string; size?: Vec3; radius?: number }): number {
  if (shape.type === 'sphere') {
    const r = shape.radius ?? 0;
    return (4 / 3) * Math.PI * r * r * r;
  }
  if (shape.type === 'box') {
    const s = shape.size ?? [0, 0, 0];
    return s[0] * s[1] * s[2];
  }
  return Number.POSITIVE_INFINITY;
}

export interface ZoneSelection {
  /** Index into environments[] of the active environment, or undefined when none applies. */
  environmentIndex?: number;
  /** The zone binding that won, when the listener is inside a zone. */
  zone?: EnvironmentZoneBinding;
  /**
   * Crossfade factor toward the *outside* environment within blendDistance of
   * the boundary: 0 = fully this zone, 1 = fully outside. Always 0 beyond the band.
   */
  blendToOutside: number;
  /** Environment index heard "just outside" the winning zone (next zone or scene default). */
  outsideEnvironmentIndex?: number;
}

/**
 * Zone selection (spec 2.3): the listener's world position picks the zone;
 * highest priority wins, ties go to the smallest volume; otherwise the scene default.
 */
export function selectEnvironment(
  zones: EnvironmentZoneBinding[] | undefined,
  defaultEnvironmentIndex: number | undefined,
  listenerWorldPos: Vec3,
): ZoneSelection {
  const containing: { zone: EnvironmentZoneBinding; boundaryDist: number }[] = [];
  for (const z of zones ?? []) {
    const local = worldToLocal(listenerWorldPos, z.transform);
    const d = distanceToZoneBoundary(local, z.shape as { type: string; size?: Vec3; radius?: number });
    if (d <= 0) containing.push({ zone: z, boundaryDist: -d }); // boundaryDist = depth inside
  }
  if (containing.length === 0) {
    return { environmentIndex: defaultEnvironmentIndex, blendToOutside: 0 };
  }
  containing.sort((a, b) => {
    if (b.zone.priority !== a.zone.priority) return b.zone.priority - a.zone.priority;
    return zoneVolume(a.zone.shape as { type: string; size?: Vec3; radius?: number })
         - zoneVolume(b.zone.shape as { type: string; size?: Vec3; radius?: number });
  });
  const winner = containing[0];
  const runnerUp = containing[1];
  const outsideEnvironmentIndex = runnerUp ? runnerUp.zone.environmentIndex : defaultEnvironmentIndex;

  let blendToOutside = 0;
  const band = winner.zone.blendDistance;
  if (band > 0 && winner.boundaryDist < band) {
    blendToOutside = 1 - winner.boundaryDist / band;
  }
  return {
    environmentIndex: winner.zone.environmentIndex,
    zone: winner.zone,
    blendToOutside,
    outsideEnvironmentIndex,
  };
}

// ---------------------------------------------------------------------------
// Doppler (spec 2.5): pitch = (c + s·vL) / (c − s·vS)
// vL, vS = radial velocities toward each other; positive = approaching,
// so approach raises pitch from either side.
// ---------------------------------------------------------------------------

export function computeDopplerPitch(
  doppler: DopplerProperties | undefined,
  listenerPos: Vec3,
  listenerVel: Vec3,
  emitterPos: Vec3,
  emitterVel: Vec3,
): number {
  if (!doppler?.enabled) return 1.0;
  const c = doppler.speedOfSound ?? 343.0;
  const s = doppler.scale ?? 1.0;
  const dx = emitterPos[0] - listenerPos[0];
  const dy = emitterPos[1] - listenerPos[1];
  const dz = emitterPos[2] - listenerPos[2];
  const dist = Math.hypot(dx, dy, dz);
  if (dist === 0) return 1.0;
  const nx = dx / dist, ny = dy / dist, nz = dz / dist; // listener → emitter
  // Radial speed toward the other party (positive = approaching):
  const vL = listenerVel[0] * nx + listenerVel[1] * ny + listenerVel[2] * nz;
  const vS = -(emitterVel[0] * nx + emitterVel[1] * ny + emitterVel[2] * nz);
  const eps = 1e-3;
  const denom = Math.max(c - s * vS, eps); // clamp: denominator must stay positive
  const numer = Math.max(c + s * vL, 0);
  return numer / denom;
}

// ---------------------------------------------------------------------------
// Distance & directivity filtering (spec 3.4)
// ---------------------------------------------------------------------------

const FULL_BANDWIDTH_HZ = 20000;

/**
 * Air absorption: 20 kHz at refDistance → cutoffAtMaxDistance at maxDistance,
 * interpolated linearly in log-frequency. Returns 20 kHz when disabled/invalid.
 */
export function computeAirAbsorptionCutoff(
  refDistance: number,
  maxDistance: number,
  cutoffAtMaxDistance: number,
  distance: number,
): number {
  if (!(maxDistance > refDistance) || !(cutoffAtMaxDistance > 0)) return FULL_BANDWIDTH_HZ;
  const frac = Math.min(Math.max((distance - refDistance) / (maxDistance - refDistance), 0), 1);
  const logF = Math.log(FULL_BANDWIDTH_HZ) + frac * (Math.log(cutoffAtMaxDistance) - Math.log(FULL_BANDWIDTH_HZ));
  return Math.exp(logF);
}

/**
 * Cone low-pass: no filtering at/inside coneInnerAngle; coneOuterCutoff at/outside
 * coneOuterAngle; log-frequency interpolation between. Angles are diameters in
 * radians (KHR_audio_emitter convention); offAxisAngle is the angle in radians
 * between the emitter's forward axis and the direction to the listener.
 */
export function computeConeCutoff(
  coneInnerAngle: number,
  coneOuterAngle: number,
  coneOuterCutoff: number | undefined,
  offAxisAngle: number,
): number {
  if (!(typeof coneOuterCutoff === 'number' && coneOuterCutoff > 0)) return FULL_BANDWIDTH_HZ;
  const innerHalf = coneInnerAngle / 2;
  const outerHalf = coneOuterAngle / 2;
  if (offAxisAngle <= innerHalf) return FULL_BANDWIDTH_HZ;
  if (offAxisAngle >= outerHalf || outerHalf <= innerHalf) return coneOuterCutoff;
  const frac = (offAxisAngle - innerHalf) / (outerHalf - innerHalf);
  const logF = Math.log(FULL_BANDWIDTH_HZ) + frac * (Math.log(coneOuterCutoff) - Math.log(FULL_BANDWIDTH_HZ));
  return Math.exp(logF);
}

/** Two cascaded low-pass stages ≈ soft combination: the lower cutoff dominates (spec 3.4 note). */
export function combineCutoffs(a: number, b: number): number {
  return Math.exp(Math.min(Math.log(a), Math.log(b)));
}

// ---------------------------------------------------------------------------
// Custom distance curve (spec 3.3)
// ---------------------------------------------------------------------------

export function sampleDistanceCurve(
  curve: number[],
  refDistance: number,
  maxDistance: number,
  distance: number,
): number {
  if (curve.length === 0) return 1;
  if (curve.length === 1) return curve[0];
  if (!(maxDistance > refDistance)) return curve[0];
  const frac = Math.min(Math.max((distance - refDistance) / (maxDistance - refDistance), 0), 1);
  const pos = frac * (curve.length - 1);
  const i = Math.floor(pos);
  if (i >= curve.length - 1) return curve[curve.length - 1];
  const t = pos - i;
  return curve[i] * (1 - t) + curve[i + 1] * t;
}

// ---------------------------------------------------------------------------
// Listener lifecycle (spec 1.3)
// ---------------------------------------------------------------------------

export interface ActiveListenerSelection {
  listener: Listener;
  listenerIndex: number;
  nodeIndex: number;
  transform?: NodeTransform;
}

/**
 * Rules 1–3 of the listener lifecycle: scene activeListener → active-camera
 * binding → first binding in node order. Returns undefined for rule 4
 * (implicit viewer listener), which the caller supplies.
 */
export function selectActiveListener(
  gltf: GltfDocument,
  sceneIndex = 0,
  activeCameraNodeIndex?: number,
): ActiveListenerSelection | undefined {
  const listeners = gltf.extensions?.KHR_audio_environment?.listeners;
  if (!listeners || listeners.length === 0) return undefined;
  const nodes = gltf.nodes ?? [];

  const bindings: ActiveListenerSelection[] = [];
  for (let i = 0; i < nodes.length; i++) {
    const idx = nodes[i].extensions?.KHR_audio_environment?.listener;
    if (typeof idx === 'number' && listeners[idx]) {
      bindings.push({
        listener: listeners[idx],
        listenerIndex: idx,
        nodeIndex: i,
        transform: {
          translation: nodes[i].translation,
          rotation: nodes[i].rotation,
          scale: nodes[i].scale,
        },
      });
    }
  }
  if (bindings.length === 0) return undefined;

  // Rule 1: scene-pinned activeListener
  const pinned = gltf.scenes?.[sceneIndex]?.extensions?.KHR_audio_environment?.activeListener;
  if (typeof pinned === 'number') {
    const hit = bindings.find(b => b.listenerIndex === pinned);
    if (hit) return hit;
  }
  // Rule 2: listener bound to the active camera's node
  if (typeof activeCameraNodeIndex === 'number') {
    const hit = bindings.find(b => b.nodeIndex === activeCameraNodeIndex);
    if (hit) return hit;
  }
  const camHit = bindings.find(b => typeof (gltf.nodes?.[b.nodeIndex] as { camera?: number })?.camera === 'number');
  if (camHit) return camHit;
  // Rule 3: first binding in node order
  return bindings[0];
}
