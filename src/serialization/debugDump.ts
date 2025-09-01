import { GraphSpec } from '../types.js';

// Private, unstable dump for tests/debug only.
export function debugDump(spec: GraphSpec): string {
  return JSON.stringify(
    {
      v: 'x-khr-audio-graph@0.0-debug',
      sampleRate: spec.sampleRate ?? null,
      nodes: spec.nodes.map((n) => ({ id: n.id, kind: n.kind, params: n.params ?? {} })),
      connections: spec.connections.map((c) => ({ from: c.from, to: c.to })),
    },
    null,
    2
  );
}
