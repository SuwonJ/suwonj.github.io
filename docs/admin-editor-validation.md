# 관리자 에디터 수정 및 검증 결과

2026-10-04. 변경 전 점검: [admin-editor-audit.md](admin-editor-audit.md).

## 적용한 변경

- `/admin`과 `/write`의 편집 엔진을 공통 CodeMirror로 통합했다. 문서는 EditorState에서 관리하고 저장/미리보기/발행에서만 revision별 문자열 snapshot을 읽는다. 입력 때 hidden textarea 전체 value를 복사하지 않는다.
- 외부 value 대입, 서식, 첨부를 에디터 adapter로 연결했다. 서식은 transaction과 keymap을 사용하며 다중/역방향 선택과 undo를 지원한다. 글 전환은 새 state/history로 초기화한다.
- 라이브 Markdown은 Lezer syntax tree를 사용한다. 코드블록의 시작이 viewport 밖에 있어도 문맥을 유지한다. 여러 줄 수식은 직접 StateField decoration을 사용하며 활성 수식/구문은 원문으로 편집한다. 수식 위젯 클릭, 조합 상태, bounded KaTeX 캐시를 지원한다.
- 선택 이동의 활성 구문 상태가 같으면 장식을 재생성하지 않는다. 제목 margin과 selection layer 강제 z-index, 중복 높이/placeholder guard를 제거했다. 폰트 준비 후 좌표를 재측정한다.
- Markdown/KaTeX 파싱은 Worker로 옮겼다. Worker를 사용할 수 없으면 로컬 parser로 fallback한다. 본문과 메타 갱신을 분리하고, input 시점 revision으로 오래된 성공/실패 결과를 차단한다.
- Worker는 완전한 문서 문맥으로 파싱한 결과를 블록 단위로 전달한다. DOM 정화/갱신은 짧은 작업 구간으로 분할하고 동일 블록과 이미 로드된 이미지를 보존한다. 미리보기 코드 highlighting은 알려진 언어를 대상으로 보이는 영역에서 수행한다. 숨겨진 미리보기는 렌더하지 않는다.
- 초안은 하나의 IndexedDB service로 통합했다. 새 글과 post ID별 초안, 수정 대상 ID, 미디어 ID, revision/저장 시각을 보존한다. DB connection을 재사용하고 실패는 실패로 표시한다. Ctrl+S, 글 전환 flush, lifecycle 저장, 이전 초안 migration, 발행 후 삭제를 같은 경로로 처리한다.
- 비동기 글 열기는 최신 요청만 적용한다. 업로드는 drop 위치를 보관하고 편집 변경에 따라 mapping하며, 다른 문서로 전환된 뒤 완료된 업로드는 현재 글에 삽입하지 않는다. 텍스트 drag/drop은 CodeMirror 기본 동작을 사용한다.
- 글 수정은 최신 status와 인증된 source endpoint를 읽는다. HTML fallback도 Python 주석/indentation/본문 hashtag를 보존한다. 메타 태그는 마지막 category hashtag 문단에서만 제거하고, 타래 fallback은 root 메타와 reply 본문을 분리한다.
- 발행 snapshot과 편집 상태를 구분해 발행 중 추가된 변경을 보존한다. 새로 발행한 타래의 ID/본문도 반환해 이후 수정 시 기존 타래에 연결할 수 있다.
- `/write` HTML은 build 시 관리자 template에서 생성한다. document.write와 실행 시 문자열 치환, 준비 상태 polling을 제거하고 명시적인 `adminReady` Promise를 사용한다. 초기 복원 중 입력 필드는 잠시 비활성화한다.
- 작은 화면은 sidebar drawer와 한 pane을 사용한다. 별도의 미리보기 모드와 편집 복귀 버튼을 제공한다. scroll owner와 최소 높이를 정리하고 100dvh를 적용했다.
- PDF는 최신 미리보기와 이미지/font 준비를 기다린다. 출력 DOM은 afterprint 또는 print media 종료 시 정리한다.
- 에디터/렌더러 의존성은 lockfile과 로컬 번들로 고정했다. KaTeX CSS/font 및 third-party license도 배포 파일에 포함한다. service worker는 v20 shell manifest를 사용하며 이 앱 cache만 정리하고 외부 인증/API 응답을 cache하지 않는다.

## 검증

`npm run build`, `npm test`, `npm run test:browser`, JavaScript syntax 검사, `git diff --check`를 수행했다. 설치 시 npm audit 결과는 취약점 0개였다.

회귀 테스트는 격리된 Chrome과 로컬 HTTP 서버에서 수행했다. Mastodon 읽기/쓰기/첨부 응답은 mock으로 대체해 실제 계정에 글을 발행하거나 변경하지 않았다. 외부 typography/icon 요청은 차단했고 에디터/KaTeX는 실제 로컬 번들을 사용했다.

통과 항목:

- 관리자·write 공통 초기화, 입력, 서식, 역방향 선택, Ctrl+A, undo, 문서별 history.
- 여러 줄 수식의 렌더/클릭 편집, 600줄 이상의 코드 fence 문맥 보존.
- 클릭 좌표↔문서 offset 일치, 확대된 editor 좌표, 작은 화면의 scroll 영역, 미리보기↔편집 전환.
- Worker preview, 입력 HTML 정화, 제목 변경 시 본문 DOM 보존, 큰 혼합 문서 렌더 완료.
- 새 글/수정 글의 저장·새로고침 복원, 문서 ID 보존, 저장 실패 표시 및 재시도.
- source 원문과 HTML 타래 fallback에서 주석/indentation 보존.
- 오래된 글 로딩 응답 무시, 첨부 위치의 concurrent-edit mapping, 발행 중 추가한 변경 복원.
- synthetic composition 이벤트 중 문서 보존, PDF 준비/cleanup.
- 실제 service worker를 통한 offline reload, 로컬 editor 사용 및 초안 저장.

약 234,000자, 6,000개 문단의 강조/inline math 혼합 문서에서 입력/선택을 측정했다. 입력은 dispatch부터 두 번의 requestAnimationFrame까지, 선택은 다음 frame까지 측정하므로 프레임 대기 시간도 포함한다. 텍스트 입력 30회, 라이브 입력/선택 각 20회 표본의 p95는 아래와 같았다.

| 측정 | p95 |
|---|---:|
| 텍스트 모드 입력→화면 갱신 | 약 34ms |
| 라이브 모드 입력→화면 갱신 | 약 34ms |
| 라이브 모드 선택 이동→다음 frame | 약 17ms |

이는 이 환경에서의 새 구현 결과이며 이전 버전 대비 배수 개선을 측정한 결과는 아니다. 테스트 결과와 screenshot은 `/tmp/sulog-editor-check/`에 생성된다.

## 재현 및 유지보수

Node 20 이상과 설치된 Chrome이 필요하다.

```sh
npm ci
npm run build
npm test
CHROME_PATH=/path/to/chrome npm run test:browser
```

배포는 기존 정적 사이트 방식을 유지한다. 번들 및 font 파일을 저장소에 포함하므로 서버가 npm을 실행할 필요는 없다. 원본 editor/preview/template 또는 의존성 변경 후 `npm run build`로 생성 파일을 함께 갱신한다. cache version이나 query version을 변경할 때 build shell manifest도 함께 갱신한다.

실제 OS 한국어 IME, Safari/Firefox, 실제 서버의 발행·대규모 타래·출력 dialog는 이번 자동 테스트 대상이 아니다. composition은 합성 이벤트, 출력 dialog는 print lifecycle mock으로 검사했다. 원문 API가 지원되지 않는 서버에서는 HTML fallback의 원래 표현 한계가 남는다.
