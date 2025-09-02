export interface GltfEmitterBinding {
  nodeIndex: number;
  emitterId: number;
  translation?: [number, number, number];
  rotation?: [number, number, number, number];
  scale?: [number, number, number];
}

export function extractEmitterBindings(gltf: any): GltfEmitterBinding[] {
  const out: GltfEmitterBinding[] = [];
  const nodes: any[] = Array.isArray(gltf?.nodes) ? gltf.nodes : [];
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    const ext = n?.extensions?.KHR_audio_graph;
    if (!ext) continue;
    const t = Array.isArray(n.translation) && n.translation.length === 3 ? n.translation as [number, number, number] : undefined;
    const r = Array.isArray(n.rotation) && n.rotation.length === 4 ? n.rotation as [number, number, number, number] : undefined;
    const s = Array.isArray(n.scale) && n.scale.length === 3 ? n.scale as [number, number, number] : undefined;
    if (typeof ext.emitter === 'number') {
      out.push({ nodeIndex: i, emitterId: ext.emitter, translation: t, rotation: r, scale: s });
    }
    if (Array.isArray(ext.emitters)) {
      for (const id of ext.emitters) {
        if (typeof id === 'number') out.push({ nodeIndex: i, emitterId: id, translation: t, rotation: r, scale: s });
      }
    }
  }
  return out;
}

