/**
 * AWS Transcribe Streaming event stream encoder / decoder.
 *
 * 프로토콜 spec (AWS docs):
 *   https://docs.aws.amazon.com/transcribe/latest/dg/event-stream.html
 *
 * Frame 구조 (binary):
 *   [4 bytes] total_byte_length (big-endian uint32, 전체 frame 크기)
 *   [4 bytes] headers_byte_length (big-endian uint32, headers 부분 크기)
 *   [4 bytes] prelude_crc (CRC32 of 위 8 bytes)
 *   [headers_byte_length bytes] headers
 *   [N bytes] payload
 *   [4 bytes] message_crc (CRC32 of 전체 frame 빼고 message_crc 자체만)
 *
 * Header 구조 (한 헤더):
 *   [1 byte] header_name_length
 *   [name_length bytes] header_name (utf-8)
 *   [1 byte] header_value_type (7 = string)
 *   [2 bytes] header_value_length (big-endian uint16)
 *   [value_length bytes] header_value (utf-8 for string)
 *
 * 마이크 PCM 보낼 때 헤더 3개 고정:
 *   :message-type = "event"
 *   :event-type = "AudioEvent"
 *   :content-type = "application/octet-stream"
 *
 * 응답 transcript 파싱 시 헤더에서 :event-type 보고 분기.
 *   TranscriptEvent → payload JSON.Transcript.Results
 *   exception/error → 다른 :message-type
 */

// ── CRC32 (IEEE 802.3 polynomial 0xEDB88320 reversed) ────────────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

// ── 인코더 ────────────────────────────────────────────────────────────
const enc = new TextEncoder();
const dec = new TextDecoder('utf-8');

function encodeHeader(name: string, value: string): Uint8Array {
  const nameBytes = enc.encode(name);
  const valueBytes = enc.encode(value);
  // 1 byte name_length + name + 1 byte type (7=string) + 2 bytes value_length + value
  const buf = new Uint8Array(1 + nameBytes.length + 1 + 2 + valueBytes.length);
  const view = new DataView(buf.buffer);
  let offset = 0;
  buf[offset++] = nameBytes.length;
  buf.set(nameBytes, offset);
  offset += nameBytes.length;
  buf[offset++] = 7; // string type
  view.setUint16(offset, valueBytes.length, false);
  offset += 2;
  buf.set(valueBytes, offset);
  return buf;
}

/** PCM Int16 audio chunk → Transcribe event stream binary frame. */
export function encodeAudioEvent(pcm: ArrayBuffer): Uint8Array {
  const headerParts = [
    encodeHeader(':content-type', 'application/octet-stream'),
    encodeHeader(':event-type', 'AudioEvent'),
    encodeHeader(':message-type', 'event'),
  ];
  let headersLen = 0;
  for (const h of headerParts) headersLen += h.length;

  const payload = new Uint8Array(pcm);
  const totalLen = 4 + 4 + 4 + headersLen + payload.length + 4;

  const buf = new Uint8Array(totalLen);
  const view = new DataView(buf.buffer);
  let offset = 0;
  // prelude
  view.setUint32(offset, totalLen, false);
  offset += 4;
  view.setUint32(offset, headersLen, false);
  offset += 4;
  const preludeCrc = crc32(buf.subarray(0, 8));
  view.setUint32(offset, preludeCrc, false);
  offset += 4;
  // headers
  for (const h of headerParts) {
    buf.set(h, offset);
    offset += h.length;
  }
  // payload
  buf.set(payload, offset);
  offset += payload.length;
  // message crc (전체 buffer 의 마지막 4 bytes 제외)
  const messageCrc = crc32(buf.subarray(0, offset));
  view.setUint32(offset, messageCrc, false);

  return buf;
}

// ── 디코더 ────────────────────────────────────────────────────────────
export interface DecodedMessage {
  headers: Record<string, string>;
  payload: Uint8Array;
}

/** Transcribe 가 보낸 binary frame → 디코딩. CRC mismatch 면 throw. */
export function decodeMessage(frame: ArrayBuffer): DecodedMessage {
  const buf = new Uint8Array(frame);
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

  if (buf.length < 16) throw new Error('frame too small');

  const totalLen = view.getUint32(0, false);
  const headersLen = view.getUint32(4, false);
  const preludeCrc = view.getUint32(8, false);

  if (crc32(buf.subarray(0, 8)) !== preludeCrc) {
    throw new Error('prelude CRC mismatch');
  }
  if (buf.length !== totalLen) {
    throw new Error(`length mismatch: declared ${totalLen}, got ${buf.length}`);
  }

  const messageCrc = view.getUint32(totalLen - 4, false);
  if (crc32(buf.subarray(0, totalLen - 4)) !== messageCrc) {
    throw new Error('message CRC mismatch');
  }

  // headers parse
  const headers: Record<string, string> = {};
  let offset = 12;
  const headersEnd = 12 + headersLen;
  while (offset < headersEnd) {
    const nameLen = buf[offset++];
    const name = dec.decode(buf.subarray(offset, offset + nameLen));
    offset += nameLen;
    const valueType = buf[offset++];
    // 0=bool true, 1=bool false, 2=byte, 3=short, 4=int, 5=long,
    // 6=bytearray, 7=string, 8=timestamp, 9=uuid
    if (valueType === 7) {
      const valueLen = view.getUint16(offset, false);
      offset += 2;
      headers[name] = dec.decode(buf.subarray(offset, offset + valueLen));
      offset += valueLen;
    } else {
      // 일단 audio 응답에는 string 만 옴 — 다른 타입은 skip
      // 안전하게 처리하려면 type 별 길이 lookup 필요
      throw new Error(`unsupported header value type: ${valueType}`);
    }
  }

  const payload = buf.subarray(headersEnd, totalLen - 4);
  return { headers, payload: new Uint8Array(payload) };
}

// ── Transcribe transcript event 파싱 helper ───────────────────────────
export interface TranscribeAlternative {
  Transcript: string;
  Items?: Array<{ Content: string; Type: string }>;
}

export interface TranscribeResult {
  Alternatives: TranscribeAlternative[];
  IsPartial: boolean;
  ResultId?: string;
}

export interface TranscribeEvent {
  Transcript: { Results: TranscribeResult[] };
}

/** 디코딩된 message → TranscribeEvent JSON. event-type 이 TranscriptEvent 일 때만 호출. */
export function parseTranscriptEvent(msg: DecodedMessage): TranscribeEvent | null {
  if (msg.headers[':event-type'] !== 'TranscriptEvent') return null;
  const text = dec.decode(msg.payload);
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** message 가 exception (server error) 인지 + 에러 메시지. */
export function getExceptionMessage(msg: DecodedMessage): string | null {
  const type = msg.headers[':message-type'];
  if (type !== 'exception') return null;
  const text = dec.decode(msg.payload);
  try {
    const data = JSON.parse(text);
    return data.Message || data.message || text;
  } catch {
    return text;
  }
}
