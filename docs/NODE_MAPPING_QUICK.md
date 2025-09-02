# Node Mapping Quick Reference

Sources
- AudioBufferSourceNode: buffer | uri, loop (false), loopStart/loopEnd (s), playbackRate (1.0), detune (0), start(when, offset, duration). Units in seconds; convert from ms as needed.
- OscillatorNode: type (sine|square|sawtooth|triangle|custom), frequency (Hz, default 440), detune (cents). Static PWM for square via PeriodicWave (pulseWidth [0..1]).

Processors
- GainNode: gain (default 1.0). Smoothing: interpolation ('linear'|'custom') + duration (ms). 'custom' uses setTargetAtTime.
- DelayNode: delayTime (s, default 0), maxDelayTime at creation. Convert ms→s for spec fields.
- BiquadFilterNode: type (lowpass|highpass|bandpass|lowshelf|highshelf|peaking|notch|allpass). frequency (Hz ≥ 0), Q (≥ 0), gain (dB). channelInterpretation ('speakers'|'discrete') optional.
- ConvolverNode (Reverb IR): buffer (AudioBuffer), normalize (true by default). Use wet/dry Gains for mix.
- WaveShaperNode (Distortion): amount [0..1] -> tanh curve, oversample ('none'|'2x'|'4x'), or custom curve[].
- ChannelSplitterNode: numberOfOutputs (at construction). Splits input channels to outputs.
- ChannelMergerNode: numberOfInputs (at construction). Merges mono inputs to multichannel.
- Channel Mixer: GainNode with channelCountMode='explicit', channelCount to request up/down-mix per Web Audio rules.
- Audio Mixer: GainNode as summing junction; connect N inputs; per-input gains upstream.

Spatial
- StereoPannerNode: pan [-1..1].
- PannerNode: panningModel ('equalpower'|'HRTF'), distanceModel ('linear'|'inverse'|'exponential'), refDistance, maxDistance, rolloffFactor, coneInner/OuterAngle, coneOuterGain. Position/orientation via AudioParams if supported.

Emitter
- Global/Spatial: implemented as Gain + (Panner or none). Listener handling is out of scope here.

Bypass
- Build-time: nodes with `bypass: true` can be removed and connections re-routed.
- Runtime: filters/delay/convolver/waveshaper are wrapped with a dry/wet crossfade; toggle via `setBypass(graph, id, enabled, rampMs)`.

Channel Options
- channelInterpretation ('speakers'|'discrete') is applied where available (via AudioNode.channelInterpretation).

Notes
- Spec ms fields convert to seconds for Web Audio.
- Parameter validation/clamping should respect Web Audio ranges; runtime applies minimal clamping for PWM.
- IR sample-rate is normalized by ConvolverNode; mono IR applies to both channels.

