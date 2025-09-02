export type ChannelInterpretation = 'speakers' | 'discrete';

export function applyChannelOptions(
  node: AudioNode,
  params: any,
  trace?: { log: (s: string) => void }
) {
  if (params && typeof params.channelInterpretation === 'string') {
    try {
      (node as any).channelInterpretation = params.channelInterpretation;
      trace?.log?.(`channelInterpretation=${params.channelInterpretation}`);
    } catch {}
  }
}

