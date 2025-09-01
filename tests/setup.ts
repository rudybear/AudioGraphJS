// Prefer a Node implementation for tests; fall back to standardized-audio-context if needed.
let AC: any;
let OAC: any;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const wae = require('web-audio-engine');
  OAC = wae.OfflineAudioContext;
  AC = wae.AudioContext;
} catch {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const std = require('standardized-audio-context');
  AC = std.AudioContext;
  OAC = std.OfflineAudioContext;
}

(globalThis as any).AudioContext = AC;
(globalThis as any).OfflineAudioContext = OAC;
