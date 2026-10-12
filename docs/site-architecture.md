# suwonmars.com 구조 지도

> 2026-10-12 기준, GitHub 저장소의 코드를 기준으로 작성. 라이브 서버의 동작을 모두 검증한 문서는 아님.

## 사이트의 역할

| 경로 | 목적 | 주요 코드 |
| --- | --- | --- |
| `/` | 소개형 랜딩, 하프톤 배경 | `index.html`, `components/halftone.js` |
| `/blog/` | 제작·탐구를 기록하는 블로그 | `blog/blog.js` |
| `/research/` | IA/EE 등 연구 문서, PDF | `research/research.js` |
| `/log/` | 개인 기록 (검색 제외 요청) | `blog/blog.js` 재사용 |
| `/p/` | 링크로 공유하는 개별 페이지 (검색 제외 요청) | `p/p.js` |
| `/profile/` | 프로필 | `profile/profile.js` |
| `/projects/node/` | 제품 소개 랜딩 | `projects/node/index.html` |
| `/write/` | 콘텐츠 작성·수정·발행 | `write/write.js`, `admin/admin.js`, `write/editor.js` |

`components/post-list.js`가 `/blog/`, `/research/`, `/log/`의 목록·태그 필터를 공통으로 제공한다. 분류별 글 목적과 URL은 그대로 분리한다.

이 경로들은 서로 다른 공개 목적이 있으므로 억지로 합치지 않는다. `/admin/`은 폐쇄됐지만 `admin/admin.js`는 현재 `/write/`에서 사용 중이다.

## 가장 중요한 데이터 흐름

**읽기:** 방문자가 `/blog/`, `/log/`, `/research/`을 연다 → Mastodon API 조회(`components/mastodon.js`) → 원본·답글 조각 복원(`components/mastodon_document.js`) → Markdown/KaTeX 변환 → 화면 및 댓글 출력.

**쓰기:** `/write/` → CodeMirror 편집(`write/editor.js`) → IndexedDB 로컬 초안(`components/drafts.js`) → 사용자 발행 명령 → OAuth/Mastodon API(`components/mastodon_oauth.js`) → 긴 글은 답글 타래로 분할해 저장.

**미리보기:** 편집기 본문 → `components/preview.js` → Web Worker(`components/preview-worker.js`) → Markdown/KaTeX 파싱 → DOMPurify 정화 → 화면 갱신.

**빌드:** `npm run build` → esbuild가 `assets/editor.js`, `assets/preview.js`, `assets/preview-worker.js`를 생성 → KaTeX 자산 복사 → `write/precache.json` 작성. `write/sw.js`는 이 목록을 이용해 오프라인 글쓰기 앱의 셸을 캐시한다.

## 앞으로 점검할 주제 (결함 확정과 설계 개선을 구분)

1. **보안:** 읽기 화면의 Markdown·댓글·태그·미디어가 HTML에 삽입되는 경로를 검증. 편집기 미리보기의 DOMPurify 사용과 공개 화면의 처리가 다름.
2. **목록 조회:** `fetchPostsByTag`의 40개 조회 제한과 태그 탐색, `/write/` 게시글 관리 목록의 페이지네이션.
3. **중복 코드:** `blog/blog.js`와 `research/research.js`의 공통 목록·본문 렌더링과 PDF 전용 기능을 구분.
4. **기술 부채:** `/write/`에서 여전히 불러오는 `admin/admin.js`, 전역 fetch 래핑, 스타일의 여러 소유자. 문제를 재현한 뒤 작은 단위로 제거.
5. **콘텐츠 경로:** `content/blog/`, `content/research/`의 기존 Markdown/JSON 자산이 현재 Mastodon 기반 페이지에 사용되는지 확인 후 유지·보관 결정. 무작정 삭제하지 않음.
6. **테스트:** 현재 편집기 위주 회귀 테스트에 방문자 페이지, 수식, 댓글, 링크, 모바일 화면을 추가.
7. **체감 성능:** 하프톤 프레임 비용, 외부 폰트/CDN 로딩, 장문 렌더링을 실제 측정 후 변경.

## 글쓰기 전에 스스로 확인할 네 가지 질문

- 이 사이트의 글은 **어디에** 저장되고, 어느 요청을 통해 화면에 나타나는가?
- Mastodon을 선택하면서 **얻은 점과 생긴 제약**은 무엇인가?
- 하프톤 배경과 Markdown·수식 처리에서 **어떤 역할을 라이브러리에 맡겼고**, 직접 조정한 부분은 어디인가?
- 지금은 **무엇을 알고 무엇은 아직 검증하지 못했는가**?

첫 글은 기술 보고서가 아닌 일상의 기록이어도 된다. 코드 지도는 글의 재료를 제공하는 용도로 유지한다.

## 공개 HTML 경계

방문자용 `/blog/`, `/research/`, `/log/`, `/p/`는 Mastodon에 저장된 Markdown을 렌더링한다. 출력 직전에 자체 호스팅한 DOMPurify 3.4.16(`assets/vendor/purify.min.js`)로 HTML을 정화하며, 날짜·제목·태그·미디어 URL 등 템플릿 문자열은 `components/safe-html.js`에서 처리한다. 댓글 역시 서버가 제공하는 HTML을 정화한 뒤 넣는다. 수식의 `semantics`와 `annotation` 태그는 유지한다.

DOMPurify는 [Cure53 DOMPurify v3.4.16](https://github.com/cure53/DOMPurify/tree/3.4.16) 배포본이다. 새 콘텐츠 표현을 추가할 때는 렌더러와 HTML 정화 경계를 함께 확인한다. 이 보안 조치가 곧 모든 사이트 위협을 제거한다는 뜻은 아니다.

## LaTeX 렌더링 회귀 사례

기존 IA의 `\\text{`ㄴㅗㄴ'}`는 짝이 맞지 않는 백틱을 포함한다. Markdown 정규화기가 여러 문단을 건너 다음 백틱까지 인라인 코드로 처리하면 그 사이의 `$$...$$` 수식이 렌더링되지 않는다. `components/content-dependencies.js`는 코드 구간 인식을 현재 문단으로 제한한다. `admin/admin.js`는 이미 배포된 미리보기 Worker 번들에도 정규화가 적용되도록 입력 경계에서 처리한다.

테스트: `npm test`(정규화·렌더링 단위 테스트), `npm run test:browser`(미리보기·공개 화면·목록). 브라우저 테스트는 자동화된 목 환경을 사용하므로 실제 Mastodon 서버에서의 엔드 투 엔드 점검을 대체하지 않는다.

## 현재 렌더러 책임 분리 (2026-10-12)

- `components/post-list.js`: `/blog/`, `/research/`, `/log/` 목록 조회·태그 필터·목록 HTML 공유. 카테고리와 페이지 주소는 호출자가 지정.
- `components/post-interactions.js`: 코드 하이라이트 및 복사, breadcrumb/목차, 이미지 확대 동작 공유.
- `blog/blog.js`: 블로그/개인 기록 글 본문 구성과 화면 초기화.
- `research/research.js`: 연구 글 본문 및 PDF 첨부 표시. PDF.js 렌더링은 별도로 유지.
- `components/content-dependencies.js`: 방문자 Markdown/KaTeX 외부 라이브러리 로딩, 수식 정규화, HTML 정화. 공개 페이지는 편집기와 동일한 Marked 15.0.12 / KaTeX 0.16.22 / marked-katex-extension 5.1.4 버전을 사용한다.

**남은 구조적 복잡성:** `/write/`가 여전히 `admin/admin.js`를 불러오는 호환 계층, 편집기 번들의 빌드 산출물 관리, Mastodon 게시글 커서 페이지네이션. 현재 동작을 망가뜨리면서 억지로 한 번에 합치지 않는다.
