export interface BypassWrapped {
  input: GainNode;
  output: GainNode;
  dry: GainNode;
  wet: GainNode;
}

export function wrapBypass(
  context: BaseAudioContext,
  core: AudioNode,
  initialBypass: boolean,
  trace?: { log: (s: string) => void }
): BypassWrapped {
  const input = context.createGain();
  const dry = context.createGain();
  const wet = context.createGain();
  const mix = context.createGain();

  dry.gain.value = initialBypass ? 1 : 0;
  wet.gain.value = initialBypass ? 0 : 1;

  input.connect(dry);
  input.connect(core as any);
  (core as any).connect?.(wet);
  dry.connect(mix);
  wet.connect(mix);

  trace?.log?.(`wrapBypass(dry=${dry.gain.value}, wet=${wet.gain.value})`);
  return { input, output: mix, dry, wet };
}

