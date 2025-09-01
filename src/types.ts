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
  | 'emitter';

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
}

export interface BuiltGraph {
  context: BaseAudioContext;
  nodes: Map<NodeId, AudioNode>;
}
