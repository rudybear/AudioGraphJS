/*
 Utility to load an AudioBuffer from a URI.
 Supports:
 - Browser: http(s)/data: via fetch + decodeAudioData
 - Node: data: URIs and file/relative paths (PCM16 WAV only)
*/

export async function loadAudioBuffer(
  context: BaseAudioContext,
  uri: string
): Promise<AudioBuffer> {
  if (typeof window !== 'undefined' && typeof fetch !== 'undefined') {
    const res = await fetch(uri);
    const arrayBuffer = await res.arrayBuffer();
    return await context.decodeAudioData(arrayBuffer.slice(0));
  }
  // Node path
  if (uri.startsWith('data:')) {
    const buf = dataUriToBuffer(uri);
    return decodePcm16WavToAudioBuffer(context, buf.buffer as ArrayBuffer);
  }
  const { readFileSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  let filePath = uri;
  if (uri.startsWith('file://')) filePath = fileURLToPath(uri);
  const data = readFileSync(filePath);
  return decodePcm16WavToAudioBuffer(context, data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
}

function dataUriToBuffer(uri: string): Uint8Array {
  const m = uri.match(/^data:([^;,]+)?(;base64)?,(.*)$/);
  if (!m) throw new Error('Invalid data URI');
  const isBase64 = !!m[2];
  const data = m[3];
  if (isBase64) {
    const b = Buffer.from(data, 'base64');
    return new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
  } else {
    const decoded = decodeURIComponent(data);
    const arr = new Uint8Array(decoded.length);
    for (let i = 0; i < decoded.length; i++) arr[i] = decoded.charCodeAt(i);
    return arr;
  }
}

function decodePcm16WavToAudioBuffer(context: BaseAudioContext, ab: ArrayBuffer): AudioBuffer {
  const dv = new DataView(ab);
  // Minimal WAV header parsing (PCM16 LE)
  const riff = getStr(dv, 0, 4);
  if (riff !== 'RIFF') throw new Error('Not a RIFF file');
  const wave = getStr(dv, 8, 4);
  if (wave !== 'WAVE') throw new Error('Not a WAVE file');
  let offset = 12;
  let fmtChunkOffset = -1;
  let dataChunkOffset = -1;
  let dataChunkSize = 0;
  while (offset + 8 <= dv.byteLength) {
    const id = getStr(dv, offset, 4);
    const size = dv.getUint32(offset + 4, true);
    if (id === 'fmt ') fmtChunkOffset = offset + 8;
    if (id === 'data') {
      dataChunkOffset = offset + 8;
      dataChunkSize = size;
    }
    offset += 8 + size;
  }
  if (fmtChunkOffset < 0 || dataChunkOffset < 0) throw new Error('Invalid WAV file');
  const audioFormat = dv.getUint16(fmtChunkOffset + 0, true);
  const numChannels = dv.getUint16(fmtChunkOffset + 2, true);
  const sampleRate = dv.getUint32(fmtChunkOffset + 4, true);
  const bitsPerSample = dv.getUint16(fmtChunkOffset + 14, true);
  if (audioFormat !== 1 || bitsPerSample !== 16) throw new Error('Only PCM16 WAV supported');
  const frameCount = Math.floor(dataChunkSize / (numChannels * 2));
  const buffer = context.createBuffer(numChannels, frameCount, sampleRate);
  let idx = dataChunkOffset;
  for (let ch = 0; ch < numChannels; ch++) {
    const chData = buffer.getChannelData(ch);
    let i = ch;
    for (let f = 0; f < frameCount; f++, i += numChannels) {
      const sample = dv.getInt16(idx + i * 2, true);
      chData[f] = sample / 0x8000;
    }
  }
  return buffer;
}

function getStr(dv: DataView, offset: number, len: number): string {
  let s = '';
  for (let i = 0; i < len; i++) s += String.fromCharCode(dv.getUint8(offset + i));
  return s;
}

