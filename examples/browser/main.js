import { buildGraph } from '../../dist/index.js';

let ctx = null;
let graph = null;

function makeSpec(sr) {
  return {
    sampleRate: sr,
    nodes: [
      { id: 'osc', kind: 'oscillator', params: { type: 'sine', frequency: 220, startTime: 0 } },
      { id: 'gain', kind: 'gain', params: { gain: 0.2 } },
      { id: 'filt', kind: 'biquad-filter', params: { type: 'lowpass', frequency: 2000, Q: 0.707 } },
      { id: 'dly', kind: 'delay', params: { maxDelayTime: 1, delayTime: 0.1 } },
    ],
    connections: [
      { from: { node: 'osc' }, to: { node: 'gain' } },
      { from: { node: 'gain' }, to: { node: 'filt' } },
      { from: { node: 'filt' }, to: { node: 'dly' } },
    ],
  };
}

async function play() {
  if (!ctx) ctx = new AudioContext();
  // Must be in a user gesture
  await ctx.resume();
  const spec = makeSpec(ctx.sampleRate);
  graph = buildGraph(ctx, spec);
  graph.nodes.get('dly')?.connect(ctx.destination);
}

async function stop() {
  if (ctx) {
    await ctx.suspend().catch(() => {});
    await ctx.close().catch(() => {});
    ctx = null;
    graph = null;
  }
}

const playBtn = document.getElementById('playBtn');
const stopBtn = document.getElementById('stopBtn');

playBtn.addEventListener('click', async () => {
  playBtn.disabled = true;
  await play();
  stopBtn.disabled = false;
});

stopBtn.addEventListener('click', async () => {
  await stop();
  stopBtn.disabled = true;
  playBtn.disabled = false;
});

