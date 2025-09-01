# KHR_audio_graph Node Mapping (Tracking)

- Source → AudioBufferSourceNode (implemented)
  - id, data(audio|osc), priority, gain, state, autoPlay, loop, loopStart(ms), loopEnd(ms), playbackSpeed, duration(ms), offset(ms), when(s), channelInterpretation
- Audio Data (partial)
  - bufferView, uri, mimeType, encodingProperties(bitsPerSample, duration, samples, sampleRate, channels)
- Oscillator Data → OscillatorNode (implemented)
  - type, frequency, pulseWidth (static via PeriodicWave; no modulation)
- Emitter (implemented)
  - id, emitterType(global|spatial), gain, spatialProperties(spatializationModel, attenuation)
  - Maps to GainNode + (PannerNode/StereoPanner)
- Listener → AudioListener (planned)

Processors
- Gain → GainNode (implemented)
  - gain, interpolation, duration(ms)
- Delay → DelayNode (implemented)
  - delayTime(ms)
- Pitch Shifter (custom) (not_implemented)
  - pitch(semitones)
- Channel Splitter → ChannelSplitterNode (implemented)
- Channel Merger → ChannelMergerNode (implemented)
- Channel Mixer → GainNode with channelCount (implemented)
  - outputChannels
- Audio Mixer (composite) (not_implemented)
- Audio Mixer → GainNode (summing) (implemented)
- Filters (implemented via BiquadFilterNode)
  - lowpass: frequency, qualityFactor, bypass
  - highpass: frequency, qualityFactor, bypass
  - bandpass: frequency, qualityFactor, bypass
  - lowshelf: frequency, gain, bypass
  - highshelf: frequency, gain, bypass
  - peaking: frequency, qualityFactor, gain, bypass
  - notch: frequency, qualityFactor, bypass
  - allpass: frequency, qualityFactor, bypass
- Reverb (custom) (not_implemented)
  - mix, earlyReflectionsGain, diffusionGain, roomSize, reflectivity(+high/low), earlyReflections, min/maxDistance, reflectionDelay(ms), reverbDelay(ms), bypass

Notes
- Unit conversions: ms ↔ s for Delay/Source timing.
- Bypass: requires routing toggle; not native on Web Audio nodes.
- Pitch shifter & Reverb: require custom DSP or Worklets; not standard nodes.
- Spatialization: Emitter maps to PannerNode; listener bound to camera.

See docs/KHR_AUDIO_GRAPH_NODE_MAP.json for machine-readable detail.
