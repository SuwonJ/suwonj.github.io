// Legacy Base64 envelopes are read-only compatibility.
function fingerprint(text) {
  let hash = 2166136261;
  for (const byte of new TextEncoder().encode(text)) hash = Math.imul(hash ^ byte, 16777619);
  return (hash >>> 0).toString(16).padStart(8, '0');
}
export function readSourceChunk(text) {
  const match = /^\s*(?:\u2063\u2063)?SULOG-SOURCE\/1\s+(\d+)\/(\d+)\s+([a-f0-9]{8})\s+([A-Za-z0-9+/=]+)/.exec(text);
  if (!match) return null;
  return { index: Number(match[1]), count: Number(match[2]), hash: match[3], payload: match[4] };
}
export function decodeSourceThread(texts, { partial = false } = {}) {
  const chunks = texts.map(readSourceChunk);
  if (!chunks[0]) return null;
  const root = chunks[0];
  if (chunks.some((chunk, i) => !chunk || chunk.index !== i + 1 || chunk.count !== root.count || chunk.hash !== root.hash) ||
      (!partial && chunks.length !== root.count)) throw new Error('문서 타래가 누락되었거나 수정 중입니다. 다시 불러와 주세요.');
  const bytes = Uint8Array.from(atob(chunks.map(chunk => chunk.payload).join('')), char => char.charCodeAt(0));
  const source = new TextDecoder('utf-8', { fatal: !partial }).decode(bytes);
  if (!partial && fingerprint(source) !== root.hash) throw new Error('문서 원문 검증에 실패했습니다.');
  return source;
}
export function statusPlainText(status) {
  const doc = new DOMParser().parseFromString(status?.sulog_root_content ?? status?.content ?? '', 'text/html');
  doc.querySelectorAll('br').forEach(br => br.replaceWith('\n'));
  doc.querySelectorAll('p').forEach(p => p.append('\n\n'));
  return doc.body.textContent || '';
}

// v2: readable payload protected from Mastodon's String#strip by an invisible
// leading boundary and a short trailing manifest. Length is UTF-16 code units.
export const TEXT_BOUNDARY = '\u2063';
export function isReadableSource(text) {
  return text.startsWith(TEXT_BOUNDARY) || text.includes('SULOG-TEXT/2 ');
}
export function splitSourceThread(source, tags, limit) {
  if (source.includes('\0') || /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(source))
    throw new Error('원문에 지원하지 않는 문자가 있습니다.');
  const suffix = tags ? `\n\n${tags}` : '';
  const size = limit - suffix.length - 100;
  if (size < 16) throw new Error('태그가 너무 길어 원문을 저장할 공간이 없습니다.');
  const pieces = [];
  let piece = '';
  for (const char of source) {
    if (piece.length + char.length > size) { pieces.push(piece); piece = ''; }
    piece += char;
  }
  pieces.push(piece);
  if (pieces.length > 256) throw new Error('문서는 최대 256개 청크까지 지원합니다.');
  const hash = fingerprint(source);
  return pieces.map((text, i) => `${TEXT_BOUNDARY}${text}\n${TEXT_BOUNDARY}SULOG-TEXT/2 ${i + 1}/${pieces.length} ${text.length} ${hash}${i === 0 ? suffix : ''}`);
}
export function readTextChunk(text) {
  if (!isReadableSource(text)) return null;
  const match = /\n\u2063SULOG-TEXT\/2 (\d+)\/(\d+) (\d+) ([a-f0-9]{8})(?:\n\n(#[^\r\n]*))?$/.exec(text);
  if (!match) throw new Error('문서 원문 경계가 손상되었습니다.');
  const prefix = +match[1] === 1 ? '\u2063' : '\u2063\u2063\u2063';
  if (!text.startsWith(prefix)) throw new Error('문서 경계 표시가 누락되었습니다.');
  const payload = text.slice(prefix.length, match.index);
  const chunk = { index: +match[1], count: +match[2], length: +match[3], hash: match[4], payload };
  if (payload.length !== chunk.length || chunk.count < 1 || chunk.count > 256 || chunk.index < 1 || chunk.index > chunk.count || (match[5] && chunk.index !== 1))
    throw new Error('문서 원문 길이 검증에 실패했습니다.');
  return chunk;
}
export function joinSourceThread(texts) {
  const chunks = texts.map(readTextChunk), root = chunks[0];
  if (!root || chunks.length !== root.count || chunks.some((c, i) => !c || c.index !== i + 1 || c.count !== root.count || c.hash !== root.hash))
    throw new Error('문서 타래가 누락되었거나 수정 중입니다. 다시 불러와 주세요.');
  const source = chunks.map(c => c.payload).join('');
  if (fingerprint(source) !== root.hash) throw new Error('문서 원문 검증에 실패했습니다.');
  return source;
}
// Display HTML is suitable only for list excerpts, never for v2 reconstruction.
export function readableExcerpt(text) {
  return text.replace(/^\u2063{1,3}/, '').replace(/\n\u2063SULOG-TEXT\/2 [\s\S]*$/, '');
}

// Mastodon also discovers hashtags inside code and Typst expressions. For v2,
// only the explicit metadata footer defines categories and user-selected tags.
export function readableMetadataTags(text) {
  const footer = /\n\u2063SULOG-TEXT\/2 \d+\/\d+ \d+ [a-f0-9]{8}(?:\n\n(#[^\r\n]*))?\s*$/.exec(text);
  return footer ? (footer[1]?.trim().split(/[ \t]+/).map(tag => tag.slice(1)) || []) : null;
}
