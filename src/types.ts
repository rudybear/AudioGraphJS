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

// ---------------------------------------------------------------------------
// KHR_audio_emitter — base layer types
// ---------------------------------------------------------------------------

export interface AudioEmitterEncodingProperties {
  sampleRate: number;
  channels: number;
  bitsPerSample?: number;
  duration?: number;
  samples?: number;
}

export interface AudioEmitterAudioData {
  uri?: string;
  mimeType?: string;
  bufferView?: number;
  extensions?: {
    KHR_audio_graph?: {
      encoding?: AudioEmitterEncodingProperties;
    };
    [key: string]: unknown;
  };
  extras?: unknown;
}

export interface AudioEmitterSource {
  audio: number;
  gain?: number;
  autoplay?: boolean;
  loop?: boolean;
  playbackRate?: number;
  extensions?: {
    KHR_audio_graph?: {
      loopStart?: number;
      loopEnd?: number;
      offset?: number;
      when?: number;
      duration?: number;
      priority?: number;
      state?: 'playing' | 'paused' | 'stopped';
      channelInterpretation?: 'speakers' | 'discrete';
    };
    [key: string]: unknown;
  };
  extras?: unknown;
}

export interface AudioEmitterPositional {
  shapeType?: 'omnidirectional' | 'cone';
  distanceModel?: 'linear' | 'inverse' | 'exponential' | 'custom';
  refDistance?: number;
  maxDistance?: number;
  rolloffFactor?: number;
  coneInnerAngle?: number;
  coneOuterAngle?: number;
  coneOuterGain?: number;
  extensions?: {
    KHR_audio_environment?: {
      spatializationModel?: 'equalpower' | 'HRTF' | 'custom';
      distanceCurve?: number[];
      airAbsorption?: { enabled?: boolean; cutoffAtMaxDistance?: number };
      coneOuterCutoff?: number;
      dopplerEnabled?: boolean;
    };
    [key: string]: unknown;
  };
}

export interface AudioEmitter {
  type: 'positional' | 'global';
  gain?: number;
  sources?: number[];
  positional?: AudioEmitterPositional;
  name?: string;
  extensions?: {
    KHR_audio_environment?: {
      directLevel?: number;
      reverbLevel?: number;
      environment?: number;
    };
    [key: string]: unknown;
  };
  extras?: unknown;
}

export interface KHRAudioEmitterExtension {
  audio: AudioEmitterAudioData[];
  sources: AudioEmitterSource[];
  emitters: AudioEmitter[];
}

// ---------------------------------------------------------------------------
// KHR_audio_graph — processing graph layer types
// ---------------------------------------------------------------------------

export interface GraphInput {
  source: number;
  node: number;
  input?: number;
}

export interface GraphOutput {
  node: number;
  output?: number;
  emitter: number;
}

export interface KHRGraphNodeSpec {
  kind: string;
  params: Record<string, unknown>;
  label?: string;
  bypass?: boolean;
}

export interface KHRGraphConnection {
  from: { node: number; output?: number };
  to: { node: number; input?: number };
}

export interface KHRGraph {
  name?: string;
  nodes: KHRGraphNodeSpec[];
  connections: KHRGraphConnection[];
  inputs?: GraphInput[];
  outputs?: GraphOutput[];
}

export interface KHRAudioGraphExtension {
  graphs: KHRGraph[];
}

// ---------------------------------------------------------------------------
// KHR_audio_environment — listener / reverb / spatialization layer types
// ---------------------------------------------------------------------------

export interface HRTFConfig {
  audio?: number;
  profile?: 'generic' | 'small' | 'medium' | 'large';
}

export interface Listener {
  name?: string;
  gain?: number;
  spatializationModel?: 'equalpower' | 'HRTF' | 'custom';
  hrtf?: HRTFConfig;
  interauralDistance?: number;
  /** Index into KHR_audio_graph.graphs[]: listener-bus processing hook (spec 3.5). */
  graph?: number;
  extensions?: Record<string, unknown>;
  extras?: unknown;
}

export type ReverbPresetName =
  | 'generic' | 'smallRoom' | 'mediumRoom' | 'largeRoom' | 'bathroom'
  | 'concertHall' | 'cathedral' | 'cave' | 'arena' | 'hangar'
  | 'corridor' | 'forest' | 'underwater';

export interface ReverbProperties {
  type?: 'parametric' | 'impulseResponse';
  preset?: ReverbPresetName | string;
  mix?: number;
  decayTime?: number;
  decayHFRatio?: number;
  reflectionsGain?: number;
  reflectionsDelay?: number;
  reverbGain?: number;
  reverbDelay?: number;
  diffusion?: number;
  density?: number;
  audio?: number;
  normalize?: boolean;
}

export interface DopplerProperties {
  enabled?: boolean;
  scale?: number;
  speedOfSound?: number;
}

export interface Environment {
  name?: string;
  reverb?: ReverbProperties;
  doppler?: DopplerProperties;
  extensions?: Record<string, unknown>;
  extras?: unknown;
}

export interface ZoneShape {
  type: 'box' | 'sphere' | string;
  size?: [number, number, number];
  radius?: number;
}

export interface AirAbsorptionProperties {
  enabled?: boolean;
  cutoffAtMaxDistance?: number;
}

/** Per-emitter environment routing (spec 3.1), from emitter.extensions.KHR_audio_environment. */
export interface EmitterEnvironmentProps {
  directLevel?: number;
  reverbLevel?: number;
  environment?: number;
}

export interface KHRAudioEnvironmentExtension {
  listeners?: Listener[];
  environments?: Environment[];
}

// ---------------------------------------------------------------------------
// Unified glTF document type
// ---------------------------------------------------------------------------

export interface GltfNode {
  name?: string;
  camera?: number;
  translation?: [number, number, number];
  rotation?: [number, number, number, number];
  scale?: [number, number, number];
  children?: number[];
  extensions?: {
    KHR_audio_emitter?: { emitter?: number; emitters?: number[] };
    KHR_audio_environment?: {
      listener?: number;
      environment?: number;
      shape?: ZoneShape;
      blendDistance?: number;
      priority?: number;
    };
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface GltfScene {
  name?: string;
  nodes?: number[];
  extensions?: {
    KHR_audio_emitter?: { emitters?: number[] };
    KHR_audio_environment?: { environment?: number; activeListener?: number };
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface GltfDocument {
  asset?: { version?: string; [key: string]: unknown };
  extensionsUsed?: string[];
  extensions?: {
    KHR_audio_emitter?: KHRAudioEmitterExtension;
    KHR_audio_graph?: KHRAudioGraphExtension;
    KHR_audio_environment?: KHRAudioEnvironmentExtension;
    [key: string]: unknown;
  };
  scenes?: GltfScene[];
  nodes?: GltfNode[];
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// parseLayeredExtensions result type
// ---------------------------------------------------------------------------

export interface LayeredParseResult {
  /** Runtime graph specs (one per KHR_audio_graph graph, or one for emitter-only) */
  graphs: GraphSpec[];
  /** Emitter binding info extracted from glTF nodes */
  emitterBindings: {
    nodeIndex: number;
    emitterId: number;
    translation?: [number, number, number];
    rotation?: [number, number, number, number];
    scale?: [number, number, number];
  }[];
  /** Listener info extracted from KHR_audio_environment on nodes */
  listener?: {
    listener: Listener;
    nodeIndex: number;
    transform?: {
      translation?: [number, number, number];
      rotation?: [number, number, number, number];
      scale?: [number, number, number];
    };
  };
  /** Environment info extracted from KHR_audio_environment on scenes (the default environment) */
  environment?: {
    environment: Environment;
    sceneIndex: number;
  };
  /** Environment zones extracted from KHR_audio_environment node bindings */
  zones?: EnvironmentZoneBinding[];
  /** Per-emitter environment routing (directLevel/reverbLevel/forced environment), keyed by emitter index */
  emitterEnvironment?: Map<number, EmitterEnvironmentProps>;
  /** The raw audio_emitter extension for reference */
  audioEmitter: KHRAudioEmitterExtension;
}

export interface NodeTransform {
  translation?: [number, number, number];
  rotation?: [number, number, number, number];
  scale?: [number, number, number];
}

export interface EnvironmentZoneBinding {
  nodeIndex: number;
  environmentIndex: number;
  environment: Environment;
  shape: ZoneShape;
  blendDistance: number;
  priority: number;
  transform?: NodeTransform;
}
