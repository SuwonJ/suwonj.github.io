import { joinSourceThread, isReadableSource, decodeSourceThread, readSourceChunk } from './source-thread.js?v=27';
const SOURCE_API = 'https://source.suwonmars.com';
async function request(path) {
  try {
    const response = await fetch(`${SOURCE_API}${path}`, { cache: 'no-store', credentials: 'omit', signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch {
    throw new Error('원문 API를 사용할 수 없습니다. 불완전한 문서는 표시하거나 발행하지 않습니다. 잠시 후 다시 시도해 주세요.');
  }
}
export async function fetchSourceText(id) {
  if (!/^[1-9]\d{0,19}$/.test(String(id))) throw new Error('잘못된 게시물 ID입니다.');
  const result = await request(`/status/${id}`);
  if (result.id !== String(id) || typeof result.text !== 'string') throw new Error('원문 API 응답이 올바르지 않습니다.');
  return result.text;
}
export async function assertSourceReady() {
  const health = await request('/health');
  if (health.ready !== true || health.protocol !== 'SULOG-TEXT/2' || health.accountId !== '116979319977947616')
    throw new Error('원문 API 검증과 배포를 완료한 뒤 발행할 수 있습니다.');
  return health.accountId;
}

export async function fetchSourceDocument(ids, { requireProtocol = true } = {}) {
  // Sequential requests avoid saturating the small Pi server for long documents.
  const texts = [];
  if (!ids.length || ids.length > 256) throw new Error('문서 타래 길이가 올바르지 않습니다.');
  for (const id of ids) texts.push(await fetchSourceText(id));
  if (isReadableSource(texts[0])) return joinSourceThread(texts);
  if (readSourceChunk(texts[0])) return decodeSourceThread(texts);
  if (requireProtocol) throw new Error('문서 원문 경계 정보가 누락되었습니다.');
  if (texts.length !== 1) throw new Error('기존 타래에는 정확한 원문 경계 정보가 없습니다.');
  return texts[0];
}
