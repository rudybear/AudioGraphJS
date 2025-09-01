import { GraphNodeSpec } from '../types.js';

export interface OscillatorParams {
  type?: OscillatorType | 'square';
  frequency?: number; // AudioParam
  detune?: number; // AudioParam (cents)
  pulseWidth?: number; // for 'square' only, static [0..1]
  startTime?: number; // seconds
  stopTime?: number; // seconds (absolute on context time)
}

export function createOscillator(
  context: BaseAudioContext,
  spec: GraphNodeSpec,
  trace?: { log: (s: string) => void }
): OscillatorNode {
  const node = context.createOscillator();
  const p = (spec.params || {}) as Partial<OscillatorParams>;

  if (p.type) { node.type = p.type as OscillatorType; trace?.log?.(`Oscillator[${spec.id}].type=${p.type}`); }
  if (typeof p.frequency === 'number') { node.frequency.setValueAtTime(p.frequency, context.currentTime); trace?.log?.(`Oscillator[${spec.id}].frequency.setValueAtTime(${p.frequency}, ${context.currentTime})`); }
  if (typeof p.detune === 'number') { node.detune.setValueAtTime(p.detune, context.currentTime); trace?.log?.(`Oscillator[${spec.id}].detune.setValueAtTime(${p.detune}, ${context.currentTime})`); }

  // Static PWM for square using PeriodicWave
  if (p.type === 'square' && typeof p.pulseWidth === 'number') {
    const duty = Math.max(0.01, Math.min(0.99, p.pulseWidth));
    const wave = createPulsePeriodicWave(context, duty, 64);
    try {
      node.setPeriodicWave(wave);
      trace?.log?.(`Oscillator[${spec.id}].setPeriodicWave(pulseWidth=${duty})`);
    } catch (_) {
      // ignore if backend doesn't support PeriodicWave
    }
  }

  const when = context.currentTime + Math.max(0, p.startTime ?? 0);
  try {
    node.start(when);
    trace?.log?.(`Oscillator[${spec.id}].start(${when})`);
  } catch (_) {
    // ignore double starts
  }
  if (typeof p.stopTime === 'number') {
    try {
      node.stop(p.stopTime);
      trace?.log?.(`Oscillator[${spec.id}].stop(${p.stopTime})`);
    } catch (_) {
      // ignore if already stopped
    }
  }
  return node;
}

function createPulsePeriodicWave(
  context: BaseAudioContext,
  duty: number,
  harmonics: number
): PeriodicWave {
  const real = new Float32Array(harmonics + 1);
  const imag = new Float32Array(harmonics + 1);
  real[0] = 0; // remove DC
  for (let n = 1; n <= harmonics; n++) {
    const a = (2 / (Math.PI * n)) * Math.sin(2 * Math.PI * n * duty); // cos coeff
    const b = (2 / (Math.PI * n)) * (1 - Math.cos(2 * Math.PI * n * duty)); // sin coeff
    real[n] = a;
    imag[n] = b;
  }
  // Prefer context.createPeriodicWave for broader backend support
  if ((context as any).createPeriodicWave) {
    return (context as any).createPeriodicWave(real, imag, { disableNormalization: false });
  }
  // Fallback (browser)
  // @ts-ignore
  return new (globalThis as any).PeriodicWave(context, { real, imag, disableNormalization: false });
}
