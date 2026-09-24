# 개발자에게 한마디 — 카톡으로 받고, 앱에서 답장하기

앱 설정과 기록 탭에 **💬 개발자에게 한마디**가 생겼습니다. 한 번 보내고 끝이 아니라
**SNS 댓글처럼 계속 이어지는 1:1 대화**입니다.

```
사용자가 앱에서 한마디
      ↓  (즉시)
내 카톡 "나와의 채팅방"에 알림 + [답장하기] 버튼
      ↓  (버튼을 누르면)
운영자 화면이 열림 → 거기서 답장을 씀
      ↓
그 사람 앱에 말풍선으로 붙음 + 빨간 점 + "개발자 답장이 도착했어요"
      ↓
사용자가 또 답함 → 다시 내 카톡으로
```

사용자에게 **이메일·연락처를 묻지 않습니다.** 답장은 앱 화면 안에서만 오갑니다.

> 설정을 마치기 전까지는 앱이 글을 폰에 보관해뒀다가, 나중에 자동으로 다시 보냅니다.
> 급하게 안 하셔도 글이 사라지지 않습니다.

---

## 1. Worker 코드 갱신 (1분)

1. Cloudflare → **Workers & Pages → maumjaro-ai → Edit code**
2. 에디터 내용을 전부 지우고 이 저장소의 `deepseek-worker.js`를 그대로 붙여넣기
3. **Save and deploy**

AI 맘운(기존 기능)은 그대로 돌아갑니다.

## 2. 대화 저장소 만들기 — KV (필수, 3분)

대화를 이어가려면 저장할 곳이 있어야 합니다. 이건 선택이 아니라 필수입니다.

1. Cloudflare → **Storage & Databases → KV → Create namespace**, 이름 `maumjaro-feedback`
2. Worker → **Settings → Bindings → Add → KV namespace**
   - Variable name: **`FEEDBACK_KV`** ← 이름이 정확해야 합니다
   - KV namespace: 방금 만든 `maumjaro-feedback`
3. 저장(자동 재배포)

무료 플랜으로 충분합니다(하루 읽기 10만 / 쓰기 1천).

## 3. 운영자 열쇠 정하기 (1분)

답장 화면에 들어갈 때 쓰는 비밀번호입니다. **아무나 추측 못 할 긴 문자열**로 정하세요.

Worker → **Settings → Variables and Secrets → Add** →
이름 `ADMIN_KEY`, 값은 정한 문자열, **Encrypt(Secret)** 로 저장.

> 이 열쇠는 카톡 알림의 **[답장하기]** 버튼 주소에 들어갑니다.
> 그 주소는 효성님 본인 카톡에만 있으니 괜찮지만, 아무 데나 공유하지는 마세요.
> 유출된 것 같으면 값만 바꾸면 됩니다(다음 알림부터 새 주소가 옵니다).

## 4. 카카오톡 연결 (15분)

카카오톡 **채널·알림톡**은 사업자등록과 검수가 필요하지만,
**"나에게 보내기"는 둘 다 필요 없습니다.** 내 계정으로 내 카톡에 보내는 기능이라 바로 됩니다.

### 4-1. 카카오 앱 만들기

1. [developers.kakao.com](https://developers.kakao.com) 로그인 → **내 애플리케이션 → 애플리케이션 추가하기**
2. 앱 이름 `맘운자로`, 회사명 아무거나 → 저장
3. **앱 설정 → 앱 키**에서 **REST API 키** 복사 (= `KAKAO_REST_API_KEY`)
4. **제품 설정 → 카카오 로그인** → 활성화 **ON**
5. 같은 화면의 **Redirect URI**에 `https://maumjaro.minimalbreeze.com/` 등록
6. **제품 설정 → 카카오 로그인 → 동의항목**에서
   **카카오톡 메시지 전송(talk_message)** 을 "이용 중 동의"로 설정

### 4-2. 리프레시 토큰 한 번 받기

브라우저 주소창에 아래를 넣고 엽니다(`REST키` 자리에 3번에서 복사한 키):

```
https://kauth.kakao.com/oauth/authorize?client_id=REST키&redirect_uri=https://maumjaro.minimalbreeze.com/&response_type=code&scope=talk_message
```

동의하면 주소가 `https://maumjaro.minimalbreeze.com/?code=XXXXXXXX` 로 바뀝니다.
**`code=` 뒤의 값**을 복사합니다. (10분 안에 다음 단계를 해야 합니다)

터미널에서 그 코드를 토큰으로 바꿉니다:

```bash
curl -X POST https://kauth.kakao.com/oauth/token \
  -d "grant_type=authorization_code" \
  -d "client_id=REST키" \
  -d "redirect_uri=https://maumjaro.minimalbreeze.com/" \
  -d "code=복사한코드"
```

응답의 **`refresh_token`** 값을 복사합니다. (= `KAKAO_REFRESH_TOKEN`)

> 터미널이 번거로우면 [reqbin.com](https://reqbin.com) 같은 웹 도구로 같은 POST를 보내도 됩니다.

### 4-3. Worker에 등록

Worker → **Settings → Variables and Secrets → Add** 로 두 개를 **Secret(Encrypt)** 저장:

| 이름 | 값 |
|---|---|
| `KAKAO_REST_API_KEY` | 4-1의 REST API 키 |
| `KAKAO_REFRESH_TOKEN` | 4-2의 refresh_token |

끝입니다. 앱에서 한마디를 하나 보내보세요 — 카톡에 이렇게 옵니다:

```
💬 맘운자로 한마디 (새 대화)

감정 고르는 화면까지 가는 게 번거로워요

주사 12회 · 5일 · 홈화면앱
                        [ 답장하기 ]
```

**[답장하기]** 를 누르면 운영자 화면이 열리고, 거기서 쓴 답이 그 사람 앱에 바로 붙습니다.

### 토큰이 끊기나요?

리프레시 토큰은 쓸 때마다 만료가 미뤄지고, 카카오가 새 토큰을 내려주면
Worker가 **KV에 자동으로 갈아 끼웁니다**(2단계를 했으면 자동). 그래서 한동안
한마디가 없어도 안 끊깁니다. 혹시 알림이 안 오면 4-2만 다시 하면 됩니다.

---

## 운영자 화면 (`/admin`)

카톡 버튼으로 들어가지만, 주소를 즐겨찾기에 넣어두고 직접 열어도 됩니다:

```
https://maumjaro-ai.<서브도메인>.workers.dev/admin?key=정한열쇠
```

- 최근 대화가 위로 옵니다. **"답장 차례"** 딱지가 붙은 것이 아직 답 안 한 대화입니다
- 각 대화 아래 칸에 쓰고 **보내기** 를 누르면 그 사람 앱에 붙습니다
- 대화마다 기기 정보(주사 횟수·사용 일수·기기 종류)가 아래 작게 보입니다
- 검색엔진에 잡히지 않도록 `noindex` 가 걸려 있습니다

## 선택: 웹훅도 같이 (3분)

카톡 말고 디스코드·슬랙으로도 같이 받고 싶다면,
Worker에 `FEEDBACK_WEBHOOK_URL` 을 Secret으로 추가하세요. 둘 다 동시에 갑니다.
(디스코드용 `content`, 슬랙용 `text`, 전체 데이터 `feedback` 을 한 번에 보냅니다.)

---

## 설정을 안 하면 어떻게 되나

| 빠진 것 | 결과 |
|---|---|
| Worker 갱신 안 함 | 앱이 글을 폰에 보관. 갱신하는 순간 밀린 글이 한꺼번에 들어옴 |
| `FEEDBACK_KV` 없음 | Worker가 500을 돌려줌 → 앱이 보관. **대화가 성립하지 않음** |
| `ADMIN_KEY` 없음 | 카톡은 오지만 답장 화면에 못 들어감 |
| 카카오 설정 없음 | 저장은 되지만 알림이 안 옴. `/admin` 을 직접 열어야 함 |

어느 경우에도 **사용자가 쓴 글은 잃지 않습니다.**

## 앱이 보내는 정보

화면에 적어둔 것이 전부입니다 — 쓴 글, 기기 종류(User-Agent), 화면 크기,
지금까지 주사를 놓은 횟수와 사용한 날짜 수. **이름·이메일·연락처는 받지 않습니다.**

사용자 식별은 기기에서 만든 128비트 난수(대화 ID) 하나로만 합니다.
이 ID를 아는 것 자체가 그 대화의 열쇠라 로그인 없이도 남의 대화를 볼 수 없습니다.
ID는 `maumjaro:feedbackThreadId` 에 저장되고, 기기 기록을 지우면 대화도 새로 시작됩니다.

보내는 정보를 바꾸려면 `feedback.js`의 `meta()`와
화면 안내 문구(`.feedback-note`)를 **함께** 고쳐야 합니다.
