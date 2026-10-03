# 관리자 글쓰기 성능·UX 점검 및 개선안

작성일: 2026-10-03

이 문서는 변경 전 점검 기록이다. 2026-10-04 수정 내용과 실제 브라우저 검증은 [수정 및 검증 결과](admin-editor-validation.md)를 참조한다.

## 결론

긴 글 입력의 병목은 전체 문서 문자열 동기화, 전체 미리보기 재생성, 중복 저장에 있다. 라이브 모드의 커서·선택 문제는 수식/문법을 상시 치환하는 atomic range, 잘못된 여러 줄 decoration 공급 방식, 문맥을 잃는 부분 문자열 파싱이 주요 원인 후보다. 단순히 debounce 시간을 늘리는 것으로는 해결되지 않는다.

우선 라이브 decoration의 정확성을 고치고, CodeMirror를 문서 상태의 기준으로 통합한 뒤, 미리보기와 저장을 입력 처리에서 분리하는 순서를 권장한다. 에디터 라이브러리를 교체하기 전에 현재 연결 구조를 개선하는 편이 범위와 위험을 줄인다.

## 점검 범위와 증거 수준

- `/admin`: `admin/index.html`, `admin/admin.js`. 네이티브 textarea + 우측 미리보기이며 CodeMirror를 설치하지 않는다.
- `/write`: 위 관리자 HTML/로직을 재사용하며 `write/editor.js`에서 CodeMirror를 설치한다. 분할/텍스트/라이브 모드, IndexedDB 백업, PDF, fallback, service worker까지 검토했다.
- 공통: `components/content-dependencies.js`, `components/mastodon.js`, `components/mastodon_oauth.js`의 의존성 로딩, 원문 복원 및 긴 글 타래 처리.
- 코드 읽기와 Node에서 기존 함수를 추출한 재현을 수행했다. 실제 인증된 브라우저 조작, IME 입력, Performance trace, 메모리 측정은 수행하지 않았다. 아래 성능 영향은 코드 경로 분석이며 측정된 ms/FPS가 아니다.
- 따라서 `/admin`에서 보고된 좌표 문제를 `/write`의 라이브 decoration 결함으로 단정할 수 없다. 실제 사용하는 URL/모드별 재현이 필요하다.

## 1. 커서·선택·라이브 렌더링

### P0 — 여러 줄 수식 replacement가 CodeMirror의 공급 제약과 충돌

근거: `write/editor.js:88–91`, `196–218`, `298–314`.

`ViewPlugin`이 `$$ ... $$` 전체를 `Decoration.replace`로 제공한다. `$$\na+b\n$$`는 줄바꿈까지 replacement에 포함한다. 위젯 span을 CSS `display:block`으로 바꾸는 주석상의 우회는 replacement가 줄바꿈을 덮는 문제를 해결하지 못한다.

CodeMirror는 수직 구조를 바꾸는 block widget 및 줄바꿈 replacement를 직접 공급해야 한다고 명시한다. 현재 방식은 문서 형태에 따라 플러그인 오류 또는 잘못된 렌더링을 일으킬 수 있다. 실제 설치 버전에서의 오류 로그·좌표 증상은 브라우저 확인이 필요하다.

개선: 여러 줄 수식은 StateField를 통한 직접 decoration으로 관리하고, 변경 범위를 mapping한 뒤 영향받는 블록을 갱신한다. block widget의 높이와 변경 측정을 지원한다. 첫 수정에서 구조 변경을 최소화하려면 여러 줄 수식의 치환을 중단하고 원문을 표시하는 것도 가능하다.

공식 근거: [Decoration sources](https://codemirror.net/examples/decoration/), [Reference manual](https://codemirror.net/docs/ref/).

### P1 — 현재 편집 중인 문법도 항상 숨김

근거: `write/editor.js:180–315`, `344`.

모드 설명은 “현재 위치 외 문법과 수식을 렌더”라고 하지만 장식 생성은 selection 위치나 조합 상태를 읽지 않는다. 수식 전체와 제목·인용·강조 기호를 무조건 replace하고 atomic range로 등록한다. 화살표 이동은 해당 범위를 건너뛰며 수식 내부 직접 편집이나 기호를 포함한 선택이 어렵다. 선택 변경 때 재계산하지만 활성 부분을 원문으로 드러내는 로직은 없다.

개선: 커서/선택이 걸친 구문은 원문으로 표시한다. 빈 selection도 경계 판정에 포함하고, 선택 방향과 다중 selection을 보존한다. 위젯 클릭 시 해당 수식의 원문 편집 상태로 전환한다. 한국어 조합 중에는 원문/위젯 전환을 유예한다.

공식 근거: [Atomic ranges의 이동 동작](https://codemirror.net/examples/decoration/), [Selection anchor/head](https://codemirror.net/examples/selection/).

### P1 — viewport ±5,000자 파싱이 코드·수식 문맥을 잃음

근거: `write/editor.js:124–178`, `185–190`, `235–257`.

문자 단위로 자른 구간에 `findCodeRanges`를 적용하므로 긴 fence의 시작이 구간 밖이면 내부 텍스트를 일반 Markdown으로 해석한다. 제목·인용 처리에는 code/math 제외 검사 자체도 없다. 결과적으로 코드 내부 `# heading`, `> quote`가 라이브 스타일을 받으며 기호가 사라질 수 있다. 수식 delimiter가 구간 경계 밖에 있으면 스크롤 위치에 따라 수식 치환 결과가 달라질 수 있다.

재현: 기존 `findCodeRanges`를 Node에서 그대로 실행했다. 600줄짜리 fenced code의 전체 검사 결과는 `[0,7839)` 코드블록인데, 내부 제목 앞 5,000자부터 자른 검사 결과는 닫는 fence `[7835,7839)`만 코드로 분류한다.

개선: 이미 설치된 Markdown parser의 syntax tree에서 fence, inline code, 제목, 강조 문맥을 얻는다. 수식은 문서 문맥을 유지하는 별도 parser/state로 관리한다. 단순히 앞뒤 여유 문자를 더 늘리는 방식은 정확성을 보장하지 않는다.

### P1 — 라이브 레이아웃의 높이 변경과 강제 CSS

근거: `write/editor.js:45–70`, `write/editor-guard.js:8–46`.

큰 제목 글꼴과 margin, block처럼 보이는 inline widget, mode별 폭/폰트 변경이 줄 높이를 바꾼다. guard는 host/scroller/content에 모두 320px 최소 높이를 강제하고, 기존 editor CSS와 서로 다른 높이 정책을 적용한다. 작은 창에서는 하단 영역이 잘릴 가능성이 있다. 선택 layer의 z-index도 강제한다.

이는 좌표 오차의 확정 증거는 아니다. 개선 시 editor-container/host의 `min-height:0`과 단일 scroll owner를 정하고, widget과 font 로딩 후 측정, resize/zoom/mode 전환의 좌표 일치를 확인한다. native placeholder extension으로 guard placeholder를 대체하면 별도 좌표 CSS도 줄일 수 있다.

## 2. 입력·미리보기 성능

### P1 — CodeMirror 입력마다 전체 문서를 hidden textarea에 복사

근거: `write/editor.js:390–412`, `424–430`.

매 docChanged에 `doc.toString()` → textarea 전체 value 대입 → 합성 input event를 실행한다. CodeMirror의 변경 단위 처리를 사용하면서도 입력마다 전체 문서를 직렬화하는 비용이 남는다. 반대 방향은 문서 전체 replace라서 작은 외부 수정도 전체 교체 transaction이 된다. 포스트 전환도 같은 view/history를 계속 써 이전 글과 undo 기록이 섞일 위험이 있다.

개선: 문서 상태의 기준을 EditorState로 통일한다. `getDocument`, `replaceDocument`, `insertAtSelection`, `onDocumentChange` 같은 adapter를 통해 admin 로직을 연결한다. 전체 문자열은 미리보기/저장/발행 snapshot이 필요할 때 생성하고 revision별로 공유한다. 글 전환은 새 state/history로 초기화한다. textarea는 fallback에 사용한다.

### P1 — 미리보기 전체 재생성

근거: `admin/admin.js:220–324`.

입력 후 250ms 쉬면 본문 전체 수식 정규화, marked/KaTeX parse, innerHTML 교체, 모든 코드 highlighting, 모든 table wrapper 생성을 수행한다. 제목/태그 수정도 본문 전체를 같은 경로로 렌더한다. 정규화는 코드 밖 텍스트를 스캔하고, 수식마다 앞뒤 문자열을 slice한다. 수식이 많을 때 추가 비용 가능성이 있다.

debounce는 실행 횟수를 줄일 뿐 실행 중 메인 스레드 정지를 분할하지 않는다. 미리보기 DOM을 계속 교체하면 그 안의 선택, 이미지 layout, 읽던 위치도 불안정해질 수 있다. 현재 source/live에서 본문 미리보기를 건너뛰는 최적화와 renderVersion 검사는 유효하므로 유지한다.

개선 순서:

1. 제목/태그/카테고리 갱신과 본문 렌더 분리. 본문 revision이 같으면 parse 생략.
2. 긴 문서에서 자동 미리보기 간격을 늘리고 수동 갱신 옵션 제공. 사용자 입력이 진행 중이면 무거운 작업 유예.
3. 변경되지 않은 블록 DOM 보존. Markdown의 앞뒤 문맥에 따라 영향받는 범위가 넓어질 수 있으므로 단순 줄별 독립 파싱은 피한다.
4. trace에서 파싱 비중이 크면 worker에서 직렬화 가능한 HTML 생성. DOM 교체·highlighting은 별도로 분할/지연해야 한다.
5. 이미지 크기 예약, 코드 highlighting 지연, 필요한 경우 변경 블록과 viewport 주변 우선 렌더.

### P1 — 선택 이동까지 live decoration 전체 재계산

근거: `write/editor.js:306–309`, `115–116`, `260–296`.

docChanged/viewportChanged/selectionSet 모두 같은 검사·정규식·range 생성·정렬을 실행한다. 현재 selection은 생성 결과에 영향을 주지 않으므로 selectionSet 계산은 불필요하다. 여러 match가 code/math range 배열을 반복 검색해 밀도가 높은 구간에서 비용이 커질 수 있다. viewport 길이는 고정이 아니므로 처리량이 항상 10,000자로 제한되는 것도 아니다.

개선: 파싱 결과 캐시와 변경 mapping을 이용한다. 현재 구문 원문 노출을 도입한 뒤 selection 변경은 활성 구문 상태가 달라질 때만 해당 범위를 갱신한다. KaTeX 결과는 tex/displayMode 및 로더 준비 상태를 키로 제한된 캐시에 저장한다.

### P2 — 미리보기 최신성 검사의 누락 경로

근거: `admin/admin.js:233–241`, `289`, `310–322`.

revision은 input 발생 시가 아닌 다음 updatePreview 실행 시 증가한다. 새 입력의 debounce가 대기하는 동안 이전 비동기 렌더가 commit될 수 있다. 실패 catch 경로에도 최신성 검사가 없어 예전 snapshot의 fallback을 쓸 수 있다.

개선: input 단계에서 revision을 증가시키고 성공/실패 모두 commit 직전 검사한다. 같은 revision의 메타·본문을 함께 적용한다. 이는 오래된 결과 노출 방지이며 전체 parse 비용을 해결하는 조치는 아니다.

## 3. 저장·문서 전환·복원

### P1 — 저장 구현이 둘이며 수정 글 복구 정책이 없음

근거: `admin/admin.js:866–920`, `write/write.js:17–45`, `49–55`, `124–153`.

새 글은 localStorage에 1초, `/write`는 별도로 IndexedDB에 250ms debounce 저장한다. 저장마다 DB를 다시 열고 connection을 닫지 않는다. localStorage 경로는 동기 직렬화/저장이며 quota 오류 처리가 없다. 기존 글 수정은 admin 저장이 아예 제외되어 Ctrl+S도 실제 저장 없이 저장 성공 toast를 보여준다. `/write` 백업은 수정 글을 post ID 없이 단일 current-draft로 저장하므로 복원 시 원래 글과의 관계를 알 수 없다.

복원은 localStorage가 있으면 IndexedDB의 최신 데이터를 비교하지 않고 건너뛴다. 새 글 전환/글 불러오기/발행 후 value 대입은 draft mirror의 input을 발생시키지 않을 수 있어 IndexedDB에 이전 초안이 남을 수 있다. 발행 시 제거하는 것은 localStorage뿐이다.

개선: 하나의 draft service로 통합하고 `new` 또는 post ID별 초안, revision, savedAt을 저장한다. DB connection promise를 재사용한다. 복원은 시간/revision과 문서 ID 기준으로 판단한다. 저장 상태는 transaction 완료 후 표시하고 실패를 알린다. 글 전환 전 flush, 발행 성공 후 해당 초안 정리, pagehide/visibilitychange에서 가능한 저장을 시도한다. Ctrl+S는 동일 저장 service로 연결한다.

### P1 — 기존 글을 다시 열 때 본문이 변형됨

근거: `components/mastodon.js:34–57`, `196–214`.

태그 제거 정규식 `/(^|\s)#[^\s#]+/g`가 본문 전체에 적용된다. Node 재현에서 Python `#comment`가 삭제됐다. spoiler title이 없는 일부 글은 모든 줄 trim/빈 줄 제거 후 join되어 indentation과 문단도 사라질 수 있다. 타래 본문 HTML을 합친 뒤 같은 변환을 적용하므로 긴 글도 영향받는다.

개선: 가능하면 Mastodon source API의 원문을 사용하되 권한/지원 여부를 확인한다. HTML fallback에서는 문서 메타로 식별한 마지막 태그 블록만 제거하고 코드/본문을 보존한다. 제목 추출은 본문 전체를 재구성하지 않는다. 게시→재열기→재저장 round trip에서 원문 차이를 검사한다.

### P1 — 비동기 글 열기와 unsaved 문서 전환

근거: `admin/admin.js:719–784`, `786–818`.

타래 로딩 중 다른 글을 열거나 새 글로 전환해도 먼저 시작한 요청의 결과가 나중에 폼을 덮어쓸 수 있다. 선택 요청 ID/취소 검사가 없다. 문서 전환 전 수정 초안 저장/dirty 보호도 없다.

개선: 문서 전환 token을 도입해 최신 요청만 적용하고 가능한 요청을 취소한다. 전환 전에 현재 초안을 저장하고, 저장 실패 시 변경사항을 보존하는 선택지를 제공한다.

## 4. 입력 명령·첨부·초기화·기타 UX

- **P1 첨부 위치:** `admin/admin.js:327–368`은 파일을 항상 본문 끝에 추가한다. `/write`도 drop을 hidden textarea로 전달한다. drop 좌표/selection을 transaction 위치로 저장하고, 업로드 중 편집 변화에 따라 위치를 mapping한다. 다른 문서로 전환한 뒤 완료된 업로드가 새 문서에 들어가지 않도록 문서 ID를 확인한다. 파일이 없는 텍스트 drop은 현재 preventDefault 후 반환하므로 native 이동/붙여넣기 동작도 검증한다.
- **P2 서식·undo:** `admin/admin.js:159–217`은 value 전체 대입 방식이다. `/write` 툴바 연결도 selection을 textarea에 복사하고 전체 sync한다. 다만 `/write`는 서식 버튼을 제거하므로 해당 toolbar 경로는 기본 UI에서 활성화되지 않는다. 단축키/버튼을 에디터 transaction과 keymap으로 통일하고 undo 단위, 선택 방향, 다중 selection을 보존한다.
- **P2 한국어 IME:** composition을 고려하는 live 전환/preview 스케줄 정책이 없다. 이것만으로 IME 버그를 확정할 수 없지만 반드시 회귀 검증한다. 조합 중 장식 재구성을 유예하고 native composition 흐름을 유지한다.
- **P2 로딩/fallback:** `write/index.html`은 HTML을 fetch 후 문자열 치환/document.write로 재사용한다. `write/write.js:179–195`는 auth DOM + 2 frames를 준비 신호로 사용한다. 정식 init Promise와 HTML template을 제공하면 초기화 추론과 치환 의존을 제거할 수 있다. 로더 지연 중 이미 입력한 글의 보존을 확인한다.
- **P2 수식 준비:** source/live에서는 ensureMarkdown을 건너뛰고, KaTeX는 별도의 defer script다. 로드 전 만들어진 MathWidget은 fallback text를 표시하며 로더 준비 시 refresh가 없다. 명시적인 ready 상태와 재렌더 신호가 필요하다.
- **P2 작은 화면:** sidebar 320px, pane 최소 320px 두 개, body overflow hidden/100vh이며 responsive media query가 없다. 모바일/작은 창에서는 숨는 영역과 가상 키보드를 점검한다. 좁은 화면은 단일 pane과 drawer, `100dvh` 중심으로 설계한다.
- **P2 렌더 안전성:** 본문 marked HTML과 태그를 innerHTML로 넣지만 sanitization/escaping 정책이 없다. 미리보기 DOM에 입력 HTML이 들어오는 만큼 일관된 sanitize 정책을 마련한다. 문자열을 DOM에 넣을 필요가 없는 태그는 textContent 사용을 권장한다.
- **P2 배포 일관성:** marked/marked-katex CDN 버전이 고정되어 있지 않고 일부 KaTeX 경로도 다르다. editor esm import는 순차 로딩한다. 재현 가능한 버전으로 bundle/self-host하고 cache version을 일괄 관리한다. service worker의 network-first 정책과 전체 cache 삭제 범위도 좁힌다.
- **P2 PDF:** 렌더 DOM 복제 후 두 frame만 기다리고 인쇄하며 이미지/font 준비 검사는 없다. 미리보기 최신성 보장과 asset readiness를 기다리고 timeout을 제공한다. PDF 전체 렌더는 입력 경로에서 분리된 on-demand 동작으로 유지한다.

## 5. 권장 실행 순서

| 순서 | 변경 묶음 | 완료 조건 |
|---|---|---|
| 1 | 여러 줄 decoration 공급 수정, 활성 구문 원문 노출, 코드 문맥 보존 | 코드/수식 포함 글에서 오류 없이 클릭·선택·화살표·삭제 가능 |
| 2 | editor adapter, CM state 기준, 문서별 history, 첨부 transaction | 작은 수정이 전체 문서 교체로 가지 않고 문서 간 undo/업로드가 섞이지 않음 |
| 3 | 미리보기 메타/본문 분리, revision 검사, 무거운 작업 지연 | 제목 변경은 본문 parse 0회, 숨겨진 미리보기 parse 0회 |
| 4 | draft service 통합, 수정 글 복구, 전환 token, 원문 복원 수정 | 새 글·수정 글 모두 복구 가능, stale fetch 적용 0회, 원문 round trip 보존 |
| 5 | trace 기반 incremental render/worker, 반응형, 로더·캐시·PDF 정리 | 긴 글 목표치 충족 및 작은 화면/오프라인 회귀 통과 |

worker나 대규모 렌더 재설계는 실제 trace에서 병목을 나눠 본 뒤 범위를 결정한다. 이미 존재하는 viewport 제한, hidden preview 생략, 지연 타래 로드는 유지할 가치가 있다.

## 6. 실제 브라우저 검증 계획

문서 크기: 1만/5만/20만자와 50만자 스트레스. 일반 문단, 1만자 단일 줄, 5,000자보다 긴 fenced code, inline/block 수식 다량, 표/이미지 혼합을 각각 준비한다. 같은 머신에서 `/admin` 및 `/write` 세 모드를 분리 측정하고 브라우저 버전을 기록한다.

| 영역 | 재현 동작 | 판정 |
|---|---|---|
| 입력 | 문서 시작/중간/끝에서 연속 한국어·영문 입력 | 문자 누락/중복 0, 조합 보존 |
| 커서 | 줄바꿈·제목·수식 경계 클릭, Home/End/좌우 이동 | 실제 선택 offset과 표시 위치 일치 |
| 선택 | 순/역방향 drag, Shift 선택, Ctrl+A, 수식 걸친 복사 | 선택한 원문 정확, 예기치 않은 축소 없음 |
| 라이브 | 긴 fence 내부로 스크롤, 활성 구문 이동 | 코드 스타일 보존, viewport 변화로 문법 오판 없음 |
| 레이아웃 | zoom 80/125/150%, resize, sidebar/mode toggle, font 로딩 | 재측정 후 caret/selection 정렬 및 하단 접근 가능 |
| 명령 | 서식 후 undo/redo, 다중 selection, 텍스트 drop | 정확한 변경 범위와 일관된 history |
| 저장 | 수정 글 Ctrl+S/새로고침, quota 실패, 글 전환, 발행 후 복원 | 실제 성공/실패 표시, 잘못된 문서 복구 없음 |
| 비동기 | A 타래 로딩 중 B/새 글 선택, 첨부 업로드 중 전환 | 과거 응답이 현재 문서 변경하지 않음 |
| 원문 | Python 주석·태그·빈 줄·indentation 게시 후 재열기 | 본문 손실 없음 |
| 출력 | 이미지/font 로드 지연 중 PDF | 최신 본문과 준비된 asset 출력 |

Performance trace에서 input→paint, CM transaction, decoration build, normalize/marked/KaTeX, DOM commit/highlight, draft serialization을 구분한다. Long Task와 메모리도 함께 기록하고 일반 타이핑/선택 이동/스크롤을 따로 비교한다.

제안 목표(현재 측정치 아님): 20만자에서 input→paint p95 50ms 이하, 선택 이동 p95 32ms 이하, 타이핑에 따른 50ms 초과 메인 스레드 작업 최소화, 미리보기는 입력 정지 후 1초 이내 최신 결과 표시. 초안 저장은 확정 입력 후 2초 이내 완료를 목표로 한다. 측정 머신과 문서 종류에 따라 예산을 조정한다.

## 검증 한계

이번 결과는 소스 점검과 두 순수 함수 재현, 공식 CodeMirror 계약 확인에 기반한다. caret 좌표 오류·IME·실제 처리 시간은 브라우저에서 아직 재현하지 않았다. 점검 당시 구현은 변경하지 않았으며 이 문서는 후속 수정의 범위와 검증 기준을 정의했다. 현재 구현·검증 상태는 위의 수정 결과 문서에 기록했다.
