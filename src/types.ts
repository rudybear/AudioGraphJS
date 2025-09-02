export type NodeId = string;

export type NodeKind =
  | 'audio-buffer-source'
  | 'gain'
  | 'oscillator'
  | 'biquad-filter'
  | 'delay'
  | 'convolver'
  | 'stereo-panner'
  | 'panner'
  | 'channel-splitter'
  | 'channel-merger'
  | 'channel-mixer'
  | 'audio-mixer'
  | 'emitter'
  | 'wave-shaper';

export type ParamValue = number | boolean | string | null;

export interface NodeParamMap {
  [key: string]: ParamValue;
}

export interface GraphNodeSpec {
  id: NodeId;
  kind: NodeKind;
  params?: NodeParamMap;
}

export interface GraphConnectionSpec {
  from: { node: NodeId; output?: number | string };
  to: { node: NodeId; input?: number | string };
}

export interface GraphSpec {
  sampleRate?: number; // tests may lock to 48000
  nodes: GraphNodeSpec[];
  connections: GraphConnectionSpec[];
  // Optional sink list: when provided, these node ids are connected to destination
  outputs?: NodeId[];
}

export interface BuiltGraph {
  context: BaseAudioContext;
  // For convenience, nodes map stores OUTPUT endpoints
  nodes: Map<NodeId, AudioNode>;
  // Internal maps to address runtime wrappers
  _inputs?: Map<NodeId, AudioNode>;
  _outputs?: Map<NodeId, AudioNode>;
  _bypass?: Map<NodeId, { dry: GainNode; wet: GainNode }>;
}
