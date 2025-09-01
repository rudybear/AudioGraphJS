import { GraphNodeSpec } from '../types.js';

export interface AudioBufferSourceParams {
  buffer?: AudioBuffer | null;
  uri?: string; // if provided, buffer will be loaded
  loop?: boolean;
  loopStart?: number;
  loopEnd?: number;
  playbackRate?: number; // AudioParam
  detune?: number; // AudioParam (cents)
  // start/stop scheduling
  startTime?: number; // seconds, relative to context.currentTime
  offset?: number; // seconds into buffer
  duration?: number; // seconds
  stopTime?: number; // optional absolute stop time
}

export function createAudioBufferSource(
  context: BaseAudioContext,
  spec: GraphNodeSpec,
  trace?: { log: (s: string) => void }
): AudioBufferSourceNode {
  const node = context.createBufferSource();
  const p = (spec.params || {}) as Partial<AudioBufferSourceParams>;

  if (p.buffer !== undefined) node.buffer = p.buffer ?? null;
  if (p.buffer) trace?.log?.(`AudioBufferSource[${spec.id}].buffer = (len=${p.buffer.length}, sr=${p.buffer.sampleRate})`);
  if (p.loop !== undefined) node.loop = !!p.loop;
  if (p.loopStart !== undefined) node.loopStart = p.loopStart!;
  if (p.loopEnd !== undefined) node.loopEnd = p.loopEnd!;
  if (p.playbackRate !== undefined && typeof p.playbackRate === 'number') {
    node.playbackRate.setValueAtTime(p.playbackRate, context.currentTime);
    trace?.log?.(`AudioBufferSource[${spec.id}].playbackRate.setValueAtTime(${p.playbackRate}, ${context.currentTime})`);
  }
  if (p.detune !== undefined && typeof p.detune === 'number') {
    node.detune.setValueAtTime(p.detune, context.currentTime);
    trace?.log?.(`AudioBufferSource[${spec.id}].detune.setValueAtTime(${p.detune}, ${context.currentTime})`);
  }

  // single-shot semantics
  const startAt = p.startTime ?? 0;
  const when = context.currentTime + Math.max(0, startAt);
  const offset = p.offset ?? 0;
  const duration = p.duration;
  try {
    if (duration !== undefined) node.start(when, offset, duration);
    else node.start(when, offset);
    trace?.log?.(`AudioBufferSource[${spec.id}].start(${when}${offset ? `, offset=${offset}` : ''}${duration !== undefined ? `, duration=${duration}` : ''})`);
  } catch (_) {
    // ignore repeated starts; caller must rebuild graph for replays
  }

  if (p.stopTime !== undefined) {
    try {
      node.stop(p.stopTime);
      trace?.log?.(`AudioBufferSource[${spec.id}].stop(${p.stopTime})`);
    } catch (_) {
      // stop may throw if already stopped; ignore in builder path
    }
  }

  return node;
}

import { loadAudioBuffer } from '../assets/loadAudioBuffer.js';

export async function createAudioBufferSourceAsync(
  context: BaseAudioContext,
  spec: GraphNodeSpec,
  trace?: { log: (s: string) => void }
): Promise<AudioBufferSourceNode> {
  const node = createAudioBufferSource(context, spec, trace);
  const p = (spec.params || {}) as Partial<AudioBufferSourceParams>;
  if (p.uri) {
    const buf = await loadAudioBuffer(context, p.uri);
    node.buffer = buf;
    trace?.log?.(`AudioBufferSource[${spec.id}].buffer <- uri(${p.uri.slice(0, 64)}${p.uri.length > 64 ? '…' : ''})`);
  }
  return node;
}
