import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { buildGraphAsync } from '../src/runtime/buildGraphAsync';
import { createMemoryTrace } from '../src/runtime/trace';
import { parseLayeredExtensions, mergeGraphSpecs } from '../src/serialization/parse-layered';
import { applyEmitterInstancesFromExtension } from '../src/runtime/emitters';
import { applyListener } from '../src/runtime/listener';
import { applyEnvironment } from '../src/runtime/environment';
import { loadAudioBuffer } from '../src/assets/loadAudioBuffer';
import type { GltfDocument } from '../src/types';

function readFixture(name: string): GltfDocument {
  const file = path.resolve(__dirname, '..', 'examples', 'graphs-layered', name);
  return JSON.parse(fs.readFileSync(file, 'utf-8'));
}

function floatTo16BitPCM(float32: number): number {
  const s = Math.max(-1, Math.min(1, float32));
  return s < 0 ? s * 0x8000 : s * 0x7fff;
}

function writeWavPCM16LE(samples: Float32Array, sampleRate: number, numChannels: number): Buffer {
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = samples.length * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataSize);
  let offset = 0;
  buffer.write('RIFF', offset); offset += 4;
  buffer.writeUInt32LE(36 + dataSize, offset); offset += 4;
  buffer.write('WAVE', offset); offset += 4;
  buffer.write('fmt ', offset); offset += 4;
  buffer.writeUInt32LE(16, offset); offset += 4;
  buffer.writeUInt16LE(1, offset); offset += 2;
  buffer.writeUInt16LE(numChannels, offset); offset += 2;
  buffer.writeUInt32LE(sampleRate, offset); offset += 4;
  buffer.writeUInt32LE(byteRate, offset); offset += 4;
  buffer.writeUInt16LE(blockAlign, offset); offset += 2;
  buffer.writeUInt16LE(16, offset); offset += 2;
  buffer.write('data', offset); offset += 4;
  buffer.writeUInt32LE(dataSize, offset); offset += 4;
  for (let i = 0; i < samples.length; i++) {
    buffer.writeInt16LE(floatTo16BitPCM(samples[i]), 44 + i * 2);
  }
  return buffer;
}

function hashString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return function () {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function makeNoiseDataUri(seedBase: string, seconds = 1.0, amp = 0.5, sampleRate = 48000): string {
  const length = Math.floor(sampleRate * seconds);
  const rng = mulberry32(hashString(seedBase));
  const samples = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    samples[i] = (rng() * 2 - 1) * amp;
  }
  const wav = writeWavPCM16LE(samples, sampleRate, 1);
  return `data:audio/wav;base64,${wav.toString('base64')}`;
}

function resolveGeneratedNoise(gltf: GltfDocument, seedBase: string): void {
  const audio = gltf.extensions?.KHR_audio_emitter?.audio ?? [];
  for (const entry of audio) {
    if (typeof entry.uri === 'string' && entry.uri.startsWith('GENERATE_NOISE')) {
      const parts = entry.uri.split(':');
      const seconds = parts[1] ? Number(parts[1]) : 1.0;
      const amp = parts[2] ? Number(parts[2]) : 0.5;
      entry.uri = makeNoiseDataUri(seedBase, seconds, amp);
    }
  }
}

async function renderLayeredFixture(name: string) {
  const gltf = readFixture(name);
  resolveGeneratedNoise(gltf, name);
  const layered = parseLayeredExtensions(gltf);
  const spec = mergeGraphSpecs(layered.graphs);
  const sampleRate = spec.sampleRate || 48000;
  const ctx = new OfflineAudioContext(2, sampleRate * 2, sampleRate);
  const trace = createMemoryTrace();
  const built = await buildGraphAsync(ctx, spec, trace);
  let destination: AudioNode = ctx.destination;

  if (layered.listener) {
    applyListener(ctx, layered.listener.listener, layered.listener.transform, trace);
  }
  if (layered.environment) {
    destination = await applyEnvironment(
      ctx,
      layered.environment.environment,
      built,
      layered.audioEmitter,
      async (uri, audioContext) => loadAudioBuffer(audioContext, uri),
      trace,
    );
  }

  if (layered.emitterBindings.length > 0) {
    const resolved = layered.emitterBindings.map((binding) => ({
      emitterNodeId: `emitter_${binding.emitterId}`,
      emitter: layered.audioEmitter.emitters[binding.emitterId],
      translation: binding.translation,
      rotation: binding.rotation,
      scale: binding.scale,
    }));
    applyEmitterInstancesFromExtension(
      built,
      resolved,
      layered.listener?.listener?.spatializationModel,
      trace,
      destination,
    );
  }

  const rendered = await ctx.startRendering();
  const left = rendered.getChannelData(0);
  let sum = 0;
  for (let i = 0; i < left.length; i++) sum += left[i] * left[i];
  const rms = Math.sqrt(sum / left.length);

  return { rms, trace: trace.getLines(), spec };
}

describe('layered glTF fixture integration', () => {
  it('renders simple-emitter-only fixture with actual KHR_audio_emitter bindings', async () => {
    const rendered = await renderLayeredFixture('simple-emitter-only.json');
    expect(rendered.rms).toBeGreaterThan(0.01);
    expect(rendered.trace.some((line) => line.includes('createEmitterInstanceExt id=emitter_0'))).toBe(true);
  });

  it('renders spatial-with-environment fixture and applies listener/environment', async () => {
    const rendered = await renderLayeredFixture('spatial-with-environment.json');
    expect(rendered.rms).toBeGreaterThan(0.001);
    expect(rendered.trace.some((line) => line.includes('applyListener spatializationModel=HRTF'))).toBe(true);
    expect(rendered.trace.some((line) => line.includes('applyEnvironment type=parametric mix=0.3'))).toBe(true);
  });

  it('renders same-emitter-multi-graph fixture and mixes graphs on the shared emitter bus', async () => {
    const mixed = await renderLayeredFixture('same-emitter-multi-graph.json');

    expect(mixed.spec.connections.filter((connection) => connection.to.node === 'emitter_0')).toHaveLength(2);
    expect(mixed.rms).toBeGreaterThan(0.35);
  });
});
