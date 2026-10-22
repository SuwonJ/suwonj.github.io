# Markdown / Typst 첫 웹 출력

사이트는 계속 Mastodon을 저장소로 사용한다. `/write` 발행 시 서버 빌드나
GitHub 배포가 없고, 방문자의 브라우저가 공개 Mastodon API에서 글을 받아 렌더링한다.
`npm run build`는 기존 CodeMirror/Markdown 번들과 새 Typst 컴파일러 자산을 준비하는
개발 명령이며 글마다 실행하지 않는다. 생성된 `assets/` 파일도 배포 대상이다.

## 경로와 데이터

- `/write/write.js`는 계속 `admin/admin.js`를 공유한다. IndexedDB 자동 저장과
  기존 발행·수정·미디어 처리를 유지했다.
- `components/document.js`는 원문을 변경하지 않고 첫 비어 있지 않은 줄을 확인한다.
  `= 제목`이면 Typst, 그 외에는 Markdown이다. Markdown의 `# 제목`도 제목으로
  추출하지만 일반 Markdown 본문 heading으로 남긴다.
- 제목 입력칸은 본문에서 추출한 제목을 보여 주는 읽기 전용 표시다. 새 발행은
  `spoiler_text`에 제목을 저장하지 않는다. 이전 CW 제목은 조회할 수 있고,
  해당 글을 편집할 때 본문에 제목이 없으면 편집 원문 앞에 Markdown 제목을 넣는다.
- 게시글의 `source`가 원문이며 `markdown`은 기존 호출부를 위한 호환 별칭이다.
  HTML은 저장하지 않고 `assets/preview.js`의 `renderBody`로 생성한다.
- `/blog`, `/research`, 편집기 미리보기는 같은 파서·정제·표 래핑·수식·코드 강조
  경로를 쓴다. 기존 이미지 확대, 코드 복사, 목차, 댓글, research PDF 첨부는 유지한다.
  `/p`도 기존처럼 blog 상세 화면을 재사용한다. `/log`도 blog의 본문 렌더링을 공유한다.

## Typst 출력

[공식 HTML 출력](https://typst.app/docs/reference/html/)과
[typst.ts](https://github.com/Myriad-Dreamin/typst.ts/issues/663)를 검토했다.
이번에는 HTML 컴파일 API가 있는
[typst-wasm 1.0.0](https://typst-wasm.github.io/typst-wasm/packages/typst-wasm/getting-started/browser/)을 사용한다.

`components/typst-worker.js`는 사이트의 고정 템플릿과 제목을 제외한 본문을 결합해
실제 Typst HTML로 컴파일한다. 수식은 MathML이다. 원문에는 템플릿을 저장하지 않는다.
결과의 문서 head/CSS를 가져오지 않고 기존 페이지의 글꼴·폭·테마를 상속한다.
DOMPurify로 HTML을 정제하며 이벤트 속성, script/style/form 등을 허용하지 않는다.

컴파일은 별도 Worker에서 실행하고 30초를 초과하면 종료한다. 프로젝트 파일과
패키지 다운로드를 허용하지 않아 사용자 소스가 사이트 파일이나 인증 API를 읽지 못한다.
WASM 약 22 MiB와 수식 글꼴은 npm lockfile에 고정된 패키지에서 로컬 자산으로 복사한다.
`/write` 서비스 워커에 포함되어 한 번 캐시한 뒤 오프라인에서도 사용할 수 있다.

## 원문 타래

Markdown과 Typst 모두 읽을 수 있는 일반 텍스트와 짧은 `SULOG-TEXT/2` 경계 정보로 게시한다.
원문은 Raspberry Pi의 읽기 전용 Source API로 가져오며, 누락·순서·길이·검증값 오류는 렌더링을 중단한다.
기존 `SULOG-SOURCE/1` Base64 글은 읽기만 지원한다. 기존 글을 자동 수정하지 않는다.
브라우저 Typst WASM 컴파일과 Markdown/KaTeX 렌더러는 유지한다.

프로토콜, 인증 검증 결과, 발행 차단 조건과 Pi 배포 절차는 [Source API 문서](source-api.md)를 참고한다.

## 범위와 검증

현재 JSPI를 지원하는 브라우저가 필요하다. GitHub Pages에는 cross-origin isolation
헤더가 없으므로 SharedArrayBuffer를 요구하는 대체 backend는 사용하지 않는다.
미지원 브라우저와 컴파일 실패에는 오류를 표시한다. 소스를 Markdown으로 변환하지 않는다.

기본 Typst 본문·소제목·수식을 지원한다. 외부 패키지/import, 프로젝트 파일·이미지,
복잡한 PDF용 레이아웃의 완전한 HTML 대응, Typst 전용 PDF export는 이번 범위 밖이다.
기존 Mastodon 미디어 첨부는 사용할 수 있다. 이후에는 브라우저 지원 폭 확대와
필요한 문법·첨부파일 지원을 추가하면 된다.

검증: `npm run build`, `npm test`, `npm run test:browser`.
브라우저 테스트는 로컬 HTTP 서버와 모의 Mastodon 응답을 사용하며 공개 계정에 쓰지 않는다.
기존 Markdown 수식/코드/표/이미지 상호작용, 실제 blog/research Typst HTML,
미리보기 일치, 500자 제한 타래의 공개 조회·수정 원문 보존, 제목/CW/태그/미디어,
자동 저장·초안 복원·오프라인 편집을 확인한다.
