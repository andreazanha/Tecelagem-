// Grava áudio do microfone em WAV (o WhatsApp não toca webm; e o Safari não toca webm nem no
// navegador). WAV 16-bit mono 16kHz é leve e toca em qualquer lugar. Usado no atendimento e no
// chat interno. Captura PCM cru via Web Audio (ScriptProcessor) e monta o WAV na hora de parar.

function baixaAmostragem(buf: Float32Array, inRate: number, outRate: number): Float32Array {
  if (!outRate || outRate >= inRate) return buf;
  const ratio = inRate / outRate;
  const outLen = Math.floor(buf.length / ratio);
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) out[i] = buf[Math.floor(i * ratio)] || 0;
  return out;
}

export function pcmParaWav(chunks: Float32Array[], inRate: number, outRate = 16000): ArrayBuffer {
  let len = 0; for (const c of chunks) len += c.length;
  const flat = new Float32Array(len); let off = 0;
  for (const c of chunks) { flat.set(c, off); off += c.length; }
  const rate = outRate && outRate < inRate ? outRate : inRate;
  const data = baixaAmostragem(flat, inRate, rate);
  const buffer = new ArrayBuffer(44 + data.length * 2);
  const view = new DataView(buffer);
  const wstr = (o: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
  wstr(0, "RIFF"); view.setUint32(4, 36 + data.length * 2, true); wstr(8, "WAVE");
  wstr(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  wstr(36, "data"); view.setUint32(40, data.length * 2, true);
  let o = 44; for (let i = 0; i < data.length; i++) { const s = Math.max(-1, Math.min(1, data[i])); view.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true); o += 2; }
  return buffer;
}

// Handle de gravação em andamento.
export interface GravadorWav { ctx: AudioContext; stream: MediaStream; source: MediaStreamAudioSourceNode; processor: ScriptProcessorNode; chunks: Float32Array[]; sampleRate: number }

// Começa a gravar. Retorna o handle (guarde num ref) — chame pararGravacaoWav pra obter o WAV.
export async function iniciarGravacaoWav(): Promise<GravadorWav> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
  const AC: typeof AudioContext = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AC();
  const source = ctx.createMediaStreamSource(stream);
  const processor = ctx.createScriptProcessor(4096, 1, 1);
  const chunks: Float32Array[] = [];
  processor.onaudioprocess = (e) => { chunks.push(new Float32Array(e.inputBuffer.getChannelData(0))); };
  source.connect(processor); processor.connect(ctx.destination);
  return { ctx, stream, source, processor, chunks, sampleRate: ctx.sampleRate };
}

// Para a gravação e devolve o arquivo WAV (ou null se não gravou nada).
export function pararGravacaoWav(g: GravadorWav | null): File | null {
  if (!g) return null;
  try { g.processor.disconnect(); g.source.disconnect(); } catch { /* ok */ }
  g.stream.getTracks().forEach((t) => t.stop());
  let wav: ArrayBuffer | null = null;
  try { wav = pcmParaWav(g.chunks, g.sampleRate); } catch { wav = null; }
  g.ctx.close().catch(() => { /* ok */ });
  if (!wav || wav.byteLength <= 44) return null;
  return new File([wav], `audio-${Date.now()}.wav`, { type: "audio/wav" });
}
