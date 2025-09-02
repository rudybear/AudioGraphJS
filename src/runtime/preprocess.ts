import { GraphSpec, GraphNodeSpec, GraphConnectionSpec } from '../types.js';

function isBypassed(node: GraphNodeSpec): boolean {
  const p: any = node.params || {};
  return p.bypass === true;
}

export function applyBypass(spec: GraphSpec): GraphSpec {
  const nodesById = new Map(spec.nodes.map((n) => [n.id, n] as const));
  const bypassIds = new Set(spec.nodes.filter(isBypassed).map((n) => n.id));
  if (bypassIds.size === 0) return spec;

  // Build adjacency for outgoing edges per node
  const outgoing = new Map<string, GraphConnectionSpec[]>();
  for (const c of spec.connections) {
    const arr = outgoing.get(c.from.node) || [];
    arr.push(c);
    outgoing.set(c.from.node, arr);
  }

  const newConnections: GraphConnectionSpec[] = [];
  // For each bypassed node, connect its inputs directly to its outputs
  for (const c of spec.connections) {
    const isIncomingToBypassed = bypassIds.has(c.to.node);
    const isOutgoingFromBypassed = bypassIds.has(c.from.node);
    if (isOutgoingFromBypassed) {
      // drop original outgoing from bypassed node
      continue;
    }
    if (!isIncomingToBypassed) {
      // keep unrelated connections
      newConnections.push(c);
    } else {
      // rewire from original source to all original bypassed node destinations
      const bypassNodeId = c.to.node;
      const outs = outgoing.get(bypassNodeId) || [];
      if (outs.length === 0) {
        // If bypassed node had no outgoing, drop the edge
        continue;
      }
      for (const out of outs) {
        newConnections.push({
          from: { node: c.from.node, output: c.from.output },
          to: { node: out.to.node, input: out.to.input },
        });
      }
    }
  }

  const newNodes = spec.nodes.filter((n) => !bypassIds.has(n.id));
  return { sampleRate: spec.sampleRate, nodes: newNodes, connections: newConnections };
}

