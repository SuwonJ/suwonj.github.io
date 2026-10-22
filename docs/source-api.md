# Raspberry Pi Source API

## 구현과 실제 인증 확인

Node.js 22 이상, 내장 HTTP/fetch만 사용한다. DB, Workers, Rails 패치, 서버 Typst 컴파일은 없다.
`services/source-api/server.mjs`는 **127.0.0.1:8788**에만 바인딩한다.

2026-10-23 실제 `maximux.suwonmars.com`의 `/api/v2/instance`는 **4.7.2**, 글자 한도 **2300**을 반환했다.
`read:statuses`로 앱 등록 → Client Credentials Grant → 본인 public status
`116984251565200173/source` 조회가 **HTTP 200**, 문자열 원문 1321 UTF-16 code unit으로 성공했다.
검증 토큰은 즉시 revoke(200)했고 토큰/클라이언트 시크릿은 출력·저장하지 않았다.
검증용 OAuth 앱 등록은 이루어졌으나 글을 작성·수정·삭제하지 않았다.
사용자 계정 또는 사용자 토큰이 필요하지 않다.
[공식 source API](https://docs.joinmastodon.org/methods/statuses/#source)도 App token + read:statuses를 명시한다.

다른 버전에서 실패하면 먼저 HTTP 401(토큰/범위), 403(정책), 404(존재/공개 범위/로컬 원문)를 구분한다.
앱 토큰 실패만으로 사용자 토큰으로 전환하지 않는다. 해당 버전의 source controller와 실제 응답을
확인하고, 사용자 인증이 정말 필요한 버전에 한해서 기존 작성자 계정의 **read:statuses만** 부여한
토큰을 서버 credential로 쓰는 것이 최소 대안이다. 별도 계정이나 write 권한은 필요 없다.

## API

```sh
curl https://source.suwonmars.com/status/116984251565200173
curl https://source.suwonmars.com/health
```

`GET /status/:id` → `{"id":"…","text":"Mastodon에 저장된 정확한 원문"}`.
각 요청은 **단일 status**를 반환한다(경계·태그를 포함한 저장 원문).
브라우저 `components/source-api.js`가 root와 reply를 각각 조회하고 v2 경계로 조립한다.
목록/태그/미디어/댓글/타래 관계는 계속 Mastodon 공개 API를 쓴다.
기존 Markdown 표시 경로와 Base64 v1 읽기는 유지한다. 기존 글은 자동 변환하지 않는다.

- 고정 Mastodon 호스트. redirect 거부. 숫자 ID(최대 20자리)만 허용.
- 토큰 없는 공개 status API로 작성자 ID, public, non-reblog 검사 → 인증된 source → 공개 status 재검사.
- root/reply에 같은 규칙. unlisted/private/direct/타인/삭제는 404. 수정 경합은 409.
- GET만 허용. CORS는 `https://suwonmars.com`만. Origin 없는 curl도 동일한 서버 권한 검사를 통과해야 한다.
- 캐시 없음, 모든 응답 `Cache-Control: no-store`. Cloudflare에서도 이 호스트의 캐시를 우회한다.
- 전체 600 요청/분, 동시 upstream 작업 8개, 연결 64개, upstream 총 8초, 응답 256 KiB 제한.
  IP 헤더를 신뢰하지 않는 단순 전역 제한이며 초과는 429 + Retry-After. 장문/동시 방문자는 재시도가 필요할 수 있다.
- upstream 상세 오류나 인증 헤더/토큰을 로그·응답에 쓰지 않는다.
- `/health`는 **기존 본인 public 원문**을 매번 읽어 설정한 SHA-256과 비교해야 ready가 된다.
  설정 없음, upstream 장애, probe 삭제/편집/공개 범위 변경은 ready 실패다.

## 원문 프로토콜

신규 Markdown/Typst 모두 동일하게 일반 텍스트로 게시한다.
root는 U+2063 하나, reply는 기존 continuation marker U+2063 두 개 뒤에 U+2063 하나를 붙인다.
그 뒤는 원문 그대로이며 끝에는 `\nU+2063SULOG-TEXT/2 순번/총개수 UTF16길이 FNV1a검증값` 한 줄만 추가한다.
카테고리/사용자 태그는 root의 manifest **뒤**에 둔다. 형식 해시태그는 없다.
이 양끝 표시로 Mastodon 4.7.2 `Status#prepare_contents`의 `strip!`에 의한 공백 손실을 막는다.
CRLF, 탭, 빈 줄, 들여쓰기, 코드, 수식, 이모지는 payload 그대로다.
CodeMirror도 LF만 줄 경계로 사용하여 CRLF/LF가 섞인 원문의 CR을 보존하고 초안에 그대로 저장한다.
분할은 surrogate pair를 가르지 않고, 결합은 구분자 없는 `join('')`이다.
원문에 포함된 U+2063 또는 #blog를 전역 삭제하지 않는다.
목록의 카테고리·사용자 태그도 명시적인 마지막 메타데이터 줄에서 읽는다.
코드나 Typst 본문의 #tmp 같은 문자열이 카테고리를 바꾸지 않는다.
검증값은 손상/수정 중 혼합 감지용이며 보안 인증 수단이 아니다.

최대 256청크. 누락, 중복 분기, 순서 오류, 경계/길이/검증값 불일치는 렌더링을 중단한다.
Mastodon UI에서는 본문이 읽히고, 청크당 짧은 manifest 한 줄만 보인다.
기존 경계 없는 Markdown 타래의 이미 잃어버린 공백은 소급 복원할 수 없다.
기존 Base64 글은 기존 방식으로 읽되 신규 인코더는 제거했다.

신규 글은 root와 reply 모두 명시적으로 public으로 발행한다.
Mastodon은 기존 글의 visibility 변경을 지원하지 않으므로 기존 unlisted/private 글의 v2 수정은
쓰기 전에 차단한다. 기존 글은 자동 재발행하지 않는다. root와 재사용 가능한 reply ID는 유지한다.
발행/수정 전 ready 확인, 완료 뒤 Source API로 원문을 다시 읽어 비교한다.
후검증 실패나 중간 네트워크 실패 시 초안을 보관한다. Mastodon 다중 status 쓰기는 원자적이지 않으므로
일부 타래가 남을 수 있으며 무조건 다시 발행하지 말고 root를 확인하여 수정/삭제해야 한다.

## 배포

2026-10-23 Pi에 `sulog-source.service`를 설치하고 활성화했다. Node.js 24.18.0의
`/usr/bin/node`를 사용하며, 서버는 비특권 `sulog-source` 사용자로 실행한다.
기존 public 글의 PostgreSQL 저장 원문을 일회성 읽기 전용 쿼리로 추출해
공식 `/source` 응답과 바이트 단위로 비교했다. 비교는 성공했으며 runtime은 DB에 접근하지 않는다.
원문 검증 파일은 `/etc/sulog-source/probe-source.txt`, 토큰은 systemd credential로 보관한다.
설정 디렉터리는 root 소유 0700, 설정·토큰 파일은 0600이다.
Pi 내부 health/원문 일치/CORS/잘못된 ID/POST 거부와 loopback 바인딩을 검증했다.
공개 `https://source.suwonmars.com/health`와 `/status/116984251565200173`도
HTTPS 200, 원문 일치, 허용 Origin 제한, `Cache-Control: no-store`,
Cloudflare `CF-Cache-Status: DYNAMIC`을 확인했다.
기존 Mastodon과 cloudflared 서비스를 재시작하거나 교체하지 않았다.
사이트 코드는 최신 main의 편집기 UI·미디어 vault·context 분할 조회를 유지하면서 통합했다.
새 클라이언트 및 오프라인 자산은 v26으로 함께 갱신한다.
아래는 새 Pi나 복구 설치를 위한 명령이다. 기존 파일은 덮어쓰지 않는다.
기존 cloudflared/Mastodon 서비스나 ingress를 교체하지 않는다.
Pi에서 Node.js 22+와 실제 `/usr/bin/node` 위치를 확인한다.
아래 명령은 Pi에 이 저장소를 복사한 후 저장소 루트에서 실행한다.

```sh
node --version
sudo useradd --system --user-group --home-dir /nonexistent --shell /usr/sbin/nologin sulog-source
sudo install -d -m 0755 /opt/sulog-source
sudo install -m 0644 services/source-api/server.mjs services/source-api/package.json /opt/sulog-source/
sudo install -d -m 0700 /etc/sulog-source
```

기존 본인 public 글 하나의 **정확한 저장 원문**을 `known-source.txt`로 준비한다.
Mastodon 편집 화면/이미 보유한 원본과 대조한다. 태그와 마지막 개행도 실제 저장값과 같아야 한다.
표시 HTML이나 이 API에서 받은 값만 해시하여 검증으로 간주하지 않는다.
public 글 `116984251565200173`을 쓸 수 있지만 내용이 바뀌면 해당 원문으로 다시 검증해야 한다.
테스트 게시물을 만들 필요는 없다.

```sh
sudo node services/source-api/provision.mjs 116984251565200173 /absolute/path/known-source.txt
sudo install -m 0644 services/source-api/sulog-source.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now sulog-source
curl --fail http://127.0.0.1:8788/health
sudo systemctl status sulog-source --no-pager
```

provision은 앱 등록 및 최소 범위 앱 토큰 발급 후 입력 파일과 `/source`를 비교한다.
성공할 때만 `/etc/sulog-source/mastodon-token`과 `config`를 0600으로 생성한다.
기존 파일은 덮어쓰지 않는다. 실패 시 발급 토큰을 revoke하고 이번 실행에서 만든 파일만 정리한다.
systemd는 LoadCredential로 비특권 프로세스에 토큰을 전달한다. `.env.example`는 설정 이름 참고용이다.
수동 실행은 같은 설정을 환경 변수로 제공할 수 있지만 셸 기록/저장소에 토큰을 남기지 않는다.

현재 Pi의 Tunnel은 **Cloudflare 대시보드에서 관리하는 원격 관리형**이다.
기존 Tunnel의 Published application에 `source.suwonmars.com`, HTTP,
`127.0.0.1:8788` 경로를 추가한다. 기존 Mastodon 경로는 유지한다.
로컬 config.yml을 새로 만들어 기존 원격 관리형 서비스를 교체하지 않는다.

아래 YAML과 CLI는 로컬 관리형 Tunnel을 쓰는 경우에만 해당한다.
그 경우 기존 ingress의 마지막 catch-all **앞**에 규칙 하나를 삽입한다.
기존 tunnel ID, credentials-file, Mastodon 규칙과 마지막 catch-all은 유지한다.

```yaml
- hostname: source.suwonmars.com
  service: http://127.0.0.1:8788
```

```sh
# 실제 기존 터널 이름과 설정 경로로 실행
cloudflared tunnel route dns EXISTING_TUNNEL_NAME source.suwonmars.com
cloudflared tunnel --config /etc/cloudflared/config.yml ingress validate
sudo systemctl restart cloudflared
curl --fail -H 'Origin: https://suwonmars.com' https://source.suwonmars.com/health
```

Cloudflare의 Cache Everything 규칙에서 source 호스트를 제외하고 캐시 우회를 설정한다.
cloudflared가 컨테이너이면 컨테이너의 127.0.0.1은 Pi 호스트가 아니므로 기존 네트워크 구성을 먼저 확인한다.
포트 포워딩/라우터 포트 개방은 하지 않는다.
공개 health까지 통과한 다음 사이트 변경과 `npm run build` 산출물을 기존 배포 방식으로 배포한다.
현재 준비 상태가 검증되지 않으면 Markdown/Typst 신규 발행 모두 차단된다(미리보기/초안은 계속 가능).
공개범위가 비목록/팔로워 전용이면 public으로 강제 변경하지 않고 발행을 차단한다.
기존 `/p`의 `#page` 선택은 비목록을 기본값으로 선택하므로 공개 페이지로 발행하려면
공개범위를 명시적으로 공개로 바꿔야 한다. 비공개 글은 API에 노출하지 않는다.

## 검증

```sh
npm test
npm run build
npm run test:browser
```

실제 앱 토큰 조회 외의 게시·수정·삭제 검증은 모두 모의 API만 사용한다.
유닛 테스트는 public/타인/non-public/삭제/수정/경합, CORS/ID/메서드/크기/속도 제한,
한글/CRLF/탭/빈 줄/긴 타래/경계 손상과 v1 읽기를 검증한다.
브라우저 테스트는 실제 Typst WASM 및 Markdown/KaTeX, 편집기/초안, 신규 타래 발행·조회·수정을 검증한다.
실제 Pi systemd 실행, Tunnel DNS/TLS 연결과 기존 public 글 원문 조회를 검증했다.
실제 신규 게시 저장 왕복은 요청에 따라 수행하지 않았다. 신규 발행·수정·삭제는 모의 API로만 검증했다.
