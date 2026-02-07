import type {
  GltfDocument,
  KHRAudioEmitterExtension,
  KHRAudioGraphExtension,
  KHRAudioEnvironmentExtension,
  KHRGraph,
  AudioEmitter,
  AudioEmitterSource,
  AudioEmitterAudioData,
  GraphSpec,
  GraphNodeSpec,
  GraphConnectionSpec,
  LayeredParseResult,
  Listener,
  Environment,
  NodeKind,
  NodeParamMap,
} from '../types.js';

// Map KHR_audio_graph node kind → runtime NodeKind
const FILTER_KINDS = new Set([
  'lowpass', 'highpass', 'bandpass', 'lowshelf', 'highshelf', 'peaking', 'notch', 'allpass',
]);

function mapKind(khrKind: string): NodeKind {
  if (FILTER_KINDS.has(khrKind)) return 'biquad-filter';
  switch (khrKind) {
    case 'gain': return 'gain';
    case 'delay': return 'delay';
    case 'waveshaper': return 'wave-shaper';
    case 'splitter': return 'channel-splitter';
    case 'channelmerger': return 'channel-merger';
    case 'channelmixer': return 'channel-mixer';
    case 'audiomixer': return 'audio-mixer';
    case 'oscillator': return 'oscillator';
    case 'emitter': return 'emitter';
    default: return khrKind as NodeKind;
  }
}

function mapFilterParams(khrKind: string, params: Record<string, unknown>): NodeParamMap {
  const out: Record<string, any> = { type: khrKind };
  if (typeof params.frequency === 'number') out.frequency = params.frequency;
  if (typeof params.qualityFactor === 'number') out.Q = params.qualityFactor;
  if (typeof params.gain === 'number') out.gain = params.gain;
  if (typeof params.bypass === 'boolean') out.bypass = params.bypass;
  return out;
}

function mapProcessingParams(khrKind: string, params: Record<string, unknown>): NodeParamMap {
  if (FILTER_KINDS.has(khrKind)) return mapFilterParams(khrKind, params);
  // For non-filter kinds, pass through params directly — layered format uses
  // seconds (no conversion needed) and string oscillator types (no mapping needed)
  const out: Record<string, any> = { ...params };
  if (typeof params.bypass === 'boolean') out.bypass = params.bypass;
  return out as NodeParamMap;
}

function makeEmitterParams(emitter: AudioEmitter): NodeParamMap {
  const params: Record<string, any> = {};
  params.emitterType = emitter.type === 'positional' ? 'spatial' : 'global';
  if (typeof emitter.gain === 'number') params.gain = emitter.gain;

  if (emitter.type === 'positional' && emitter.positional) {
    const pos = emitter.positional;
    const attenuation: Record<string, unknown> = {};
    if (pos.distanceModel) attenuation.distanceModel = pos.distanceModel;
    if (typeof pos.refDistance === 'number') attenuation.refDistance = pos.refDistance;
    if (typeof pos.maxDistance === 'number') attenuation.maxDistance = pos.maxDistance;
    if (typeof pos.rolloffFactor === 'number') attenuation.rolloffFactor = pos.rolloffFactor;
    if (typeof pos.coneInnerAngle === 'number') attenuation.coneInnerAngle = pos.coneInnerAngle;
    if (typeof pos.coneOuterAngle === 'number') attenuation.coneOuterAngle = pos.coneOuterAngle;
    if (typeof pos.coneOuterGain === 'number') attenuation.coneOuterGain = pos.coneOuterGain;
    params.spatialProperties = { attenuation };
  }

  return params as NodeParamMap;
}

function makeSourceParams(
  source: AudioEmitterSource,
  audioData: AudioEmitterAudioData[],
): NodeParamMap {
  const params: Record<string, any> = {};
  const ad = audioData[source.audio];
  if (ad?.uri) params.uri = ad.uri;
  if (typeof source.gain === 'number') params.gain = source.gain;
  if (typeof source.playbackRate === 'number') params.playbackRate = source.playbackRate;
  if (typeof source.loop === 'boolean') params.loop = source.loop;
  if (typeof source.autoplay === 'boolean') params.autoplay = source.autoplay;

  // Extended source properties from KHR_audio_graph extension on source
  const ext = source.extensions?.KHR_audio_graph;
  if (ext) {
    if (typeof ext.loopStart === 'number') params.loopStart = ext.loopStart;
    if (typeof ext.loopEnd === 'number') params.loopEnd = ext.loopEnd;
    if (typeof ext.offset === 'number') params.offset = ext.offset;
    if (typeof ext.when === 'number') params.startTime = ext.when;
    if (typeof ext.duration === 'number') params.duration = ext.duration;
  }

  return params as NodeParamMap;
}

function parseGraph(
  graph: KHRGraph,
  audioEmitter: KHRAudioEmitterExtension,
  graphIndex: number,
): GraphSpec {
  const nodes: GraphNodeSpec[] = [];
  const connections: GraphConnectionSpec[] = [];
  const idByIndex: string[] = [];
  const outputNodeIds: string[] = [];

  // Track which node indices receive graph inputs (source bindings)
  const inputTargets = new Map<number, number[]>(); // node index → source indices
  if (graph.inputs) {
    for (const inp of graph.inputs) {
      const existing = inputTargets.get(inp.node) || [];
      existing.push(inp.source);
      inputTargets.set(inp.node, existing);
    }
  }

  // Create IDs for all graph processing nodes first
  for (let i = 0; i < graph.nodes.length; i++) {
    const n = graph.nodes[i];
    idByIndex.push(n.label || `node_${i}`);
  }

  // Create source nodes for graph inputs
  const sourceNodeIds: Map<string, string> = new Map(); // key "sourceIdx_targetNode" → runtime node id
  if (graph.inputs) {
    for (const inp of graph.inputs) {
      const source = audioEmitter.sources[inp.source];
      if (!source) continue;
      const srcId = `src_${inp.source}_g${graphIndex}`;
      if (!sourceNodeIds.has(srcId)) {
        const params = makeSourceParams(source, audioEmitter.audio);
        nodes.push({ id: srcId, kind: 'audio-buffer-source', params });
        sourceNodeIds.set(srcId, srcId);
      }
      // Connection from source to target node
      const targetId = idByIndex[inp.node];
      connections.push({
        from: { node: sourceNodeIds.get(srcId)!, output: 0 },
        to: { node: targetId, input: inp.input ?? 0 },
      });
    }
  }

  // Create processing nodes
  for (let i = 0; i < graph.nodes.length; i++) {
    const n = graph.nodes[i];
    const id = idByIndex[i];
    const runtimeKind = mapKind(n.kind);
    const params = mapProcessingParams(n.kind, n.params || {});
    if (n.bypass) params.bypass = true;
    nodes.push({ id, kind: runtimeKind, params });
  }

  // Create connections between processing nodes
  for (const c of graph.connections) {
    connections.push({
      from: { node: idByIndex[c.from.node], output: c.from.output },
      to: { node: idByIndex[c.to.node], input: c.to.input },
    });
  }

  // Create emitter nodes for graph outputs
  if (graph.outputs) {
    for (const out of graph.outputs) {
      const emitter = audioEmitter.emitters[out.emitter];
      if (!emitter) continue;
      const emitterId = `emitter_${out.emitter}`;
      // Only create emitter node once per emitter index
      if (!nodes.find(n => n.id === emitterId)) {
        const params = makeEmitterParams(emitter);
        nodes.push({ id: emitterId, kind: 'emitter', params });
      }
      // Connection from output node to emitter
      connections.push({
        from: { node: idByIndex[out.node], output: out.output },
        to: { node: emitterId, input: 0 },
      });
    }
  } else {
    // No outputs: use the last nodes as outputs[] (implicit destination)
    // Find sink nodes (no outgoing connections among processing nodes)
    const hasOutgoing = new Set<number>();
    for (const c of graph.connections) hasOutgoing.add(c.from.node);
    for (let i = 0; i < graph.nodes.length; i++) {
      if (!hasOutgoing.has(i)) outputNodeIds.push(idByIndex[i]);
    }
  }

  return {
    nodes,
    connections,
    outputs: outputNodeIds.length > 0 ? outputNodeIds : undefined,
  };
}

function parseEmitterOnly(audioEmitter: KHRAudioEmitterExtension): GraphSpec {
  const nodes: GraphNodeSpec[] = [];
  const connections: GraphConnectionSpec[] = [];

  for (let eIdx = 0; eIdx < audioEmitter.emitters.length; eIdx++) {
    const emitter = audioEmitter.emitters[eIdx];
    const emitterId = `emitter_${eIdx}`;
    const emitterParams = makeEmitterParams(emitter);
    nodes.push({ id: emitterId, kind: 'emitter', params: emitterParams });

    // Create source nodes for each source bound to this emitter
    const sources = emitter.sources || [];
    for (const srcIdx of sources) {
      const source = audioEmitter.sources[srcIdx];
      if (!source) continue;
      const srcId = `src_${srcIdx}_e${eIdx}`;
      const params = makeSourceParams(source, audioEmitter.audio);
      nodes.push({ id: srcId, kind: 'audio-buffer-source', params });
      connections.push({
        from: { node: srcId },
        to: { node: emitterId },
      });
    }
  }

  return { nodes, connections };
}

export function parseLayeredExtensions(gltf: GltfDocument): LayeredParseResult {
  const audioEmitter = gltf.extensions?.KHR_audio_emitter;
  if (!audioEmitter) {
    throw new Error('Missing required extension: KHR_audio_emitter');
  }

  const audioGraph = gltf.extensions?.KHR_audio_graph;
  const audioEnv = gltf.extensions?.KHR_audio_environment;

  // Parse graphs
  let graphs: GraphSpec[];
  if (audioGraph && audioGraph.graphs.length > 0) {
    graphs = audioGraph.graphs.map((g, i) => parseGraph(g, audioEmitter, i));
  } else {
    // Emitter-only: direct source → emitter
    graphs = [parseEmitterOnly(audioEmitter)];
  }

  // Extract emitter bindings from glTF nodes
  const emitterBindings: LayeredParseResult['emitterBindings'] = [];
  const gltfNodes = gltf.nodes || [];
  for (let i = 0; i < gltfNodes.length; i++) {
    const n = gltfNodes[i];
    const ext = n.extensions?.KHR_audio_emitter;
    if (!ext) continue;
    const t = n.translation;
    const r = n.rotation;
    const s = n.scale;
    // Support both new "emitters" array and legacy "emitter" scalar
    if (Array.isArray(ext.emitters)) {
      for (const id of ext.emitters) {
        if (typeof id === 'number') {
          emitterBindings.push({ nodeIndex: i, emitterId: id, translation: t, rotation: r, scale: s });
        }
      }
    } else if (typeof ext.emitter === 'number') {
      emitterBindings.push({ nodeIndex: i, emitterId: ext.emitter, translation: t, rotation: r, scale: s });
    }
  }

  // Extract listener from KHR_audio_environment on nodes
  let listenerResult: LayeredParseResult['listener'];
  if (audioEnv?.listeners) {
    for (let i = 0; i < gltfNodes.length; i++) {
      const n = gltfNodes[i];
      const envExt = n.extensions?.KHR_audio_environment;
      if (envExt && typeof envExt.listener === 'number') {
        const listener = audioEnv.listeners[envExt.listener];
        if (listener) {
          listenerResult = {
            listener,
            nodeIndex: i,
            transform: {
              translation: n.translation,
              rotation: n.rotation,
              scale: n.scale,
            },
          };
          break; // Only one active listener
        }
      }
    }
  }

  // Extract environment from KHR_audio_environment on scenes
  let environmentResult: LayeredParseResult['environment'];
  if (audioEnv?.environments) {
    const scenes = gltf.scenes || [];
    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      const envExt = scene.extensions?.KHR_audio_environment;
      if (envExt && typeof envExt.environment === 'number') {
        const environment = audioEnv.environments[envExt.environment];
        if (environment) {
          environmentResult = { environment, sceneIndex: i };
          break;
        }
      }
    }
  }

  return {
    graphs,
    emitterBindings,
    listener: listenerResult,
    environment: environmentResult,
    audioEmitter,
  };
}
