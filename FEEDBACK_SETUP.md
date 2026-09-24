# 개발자에게 한마디 — 받는 곳 연결하기

앱 설정에 **💬 개발자에게 한마디**가 생겼습니다. 사용자가 쓴 글은
`deepseek-worker.js`(이미 배포해둔 Cloudflare Worker)의 `/feedback` 경로로 갑니다.
그 글을 **어디로 받을지**만 정하면 됩니다.

> Worker를 다시 붙여넣기 전까지는 앱이 글을 폰에 보관해뒀다가, 나중에 앱을 열 때
> 자동으로 다시 보냅니다. 급하게 안 해도 글이 사라지지 않습니다.

## 0. Worker 코드 갱신 (공통, 1분)

1. Cloudflare → **Workers & Pages → maumjaro-ai → Edit code**
2. 에디터 내용을 전부 지우고 이 저장소의 `deepseek-worker.js`를 그대로 붙여넣기
3. **Save and deploy**

이것만 하면 AI 맘운은 그대로 돌아가고, `/feedback` 경로가 새로 열립니다.
단, 아직 받을 채널이 없으므로 앱은 계속 "보관"만 합니다. 아래에서 하나를 고르세요.

---

## 어떤 채널로 받을까

| 방법 | 설정 시간 | 폰 알림 | 사업자등록 | 끊길 위험 |
|---|---|---|---|---|
| **A. 카카오톡 "나에게 보내기"** | 15분 | ⭕️ 카톡으로 옴 | **불필요** | 60일 이상 한마디가 0건이면 토큰 만료 |
| **B. 웹훅(디스코드 등)** | 3분 | ⭕️ 앱 알림 | 불필요 | 거의 없음 |
| **C. 아무것도 안 함 + KV 보관** | 5분 | ❌ 직접 확인 | 불필요 | 없음 |

**추천: A + C를 같이 켜기.** 카톡으로 바로 받고, KV에도 쌓아둬서 토큰이 만료돼도
글은 한 건도 안 잃습니다. 아래 세 절은 서로 배타적이지 않고, 설정한 것만 동시에 작동합니다.

---

## A. 카카오톡 "나에게 보내기"

카카오톡 채널·알림톡은 사업자등록과 검수가 필요하지만, **"나에게 보내기"는 둘 다 필요 없습니다.**
내 카카오 계정으로 내 카톡에 메시지를 보내는 기능이라 개발 단계에서 바로 쓸 수 있습니다.

### A-1. 카카오 앱 만들기

1. [developers.kakao.com](https://developers.kakao.com) 로그인 → **내 애플리케이션 → 애플리케이션 추가하기**
2. 앱 이름 `맘운자로`, 회사명 아무거나 → 저장
3. **앱 설정 → 앱 키**에서 **REST API 키**를 복사해둡니다. (= `KAKAO_REST_API_KEY`)
4. **제품 설정 → 카카오 로그인** → 활성화 **ON**
5. 같은 화면의 **Redirect URI**에 `https://maumjaro.minimalbreeze.com/` 를 등록
6. **제품 설정 → 카카오 로그인 → 동의항목**에서 **카카오톡 메시지 전송(talk_message)** 을 "이용 중 동의"로 설정

### A-2. 리프레시 토큰 한 번 받기

브라우저 주소창에 아래를 넣고 엽니다(`REST키` 자리에 3번에서 복사한 키):

```
https://kauth.kakao.com/oauth/authorize?client_id=REST키&redirect_uri=https://maumjaro.minimalbreeze.com/&response_type=code&scope=talk_message
```

동의하면 주소가 `https://maumjaro.minimalbreeze.com/?code=XXXXXXXX` 로 바뀝니다.
이 **`code=` 뒤의 값**을 복사합니다. (10분 안에 다음 단계를 해야 합니다)

이제 그 코드를 토큰으로 바꿉니다. 컴퓨터 터미널에서:

```bash
curl -X POST https://kauth.kakao.com/oauth/token \
  -d "grant_type=authorization_code" \
  -d "client_id=REST키" \
  -d "redirect_uri=https://maumjaro.minimalbreeze.com/" \
  -d "code=복사한코드"
```

응답에 들어 있는 **`refresh_token`** 값을 복사합니다. (= `KAKAO_REFRESH_TOKEN`)

> 터미널이 번거로우면 [reqbin.com](https://reqbin.com) 같은 웹 도구에서 같은 POST를 보내도 됩니다.

### A-3. Worker에 등록

Worker → **Settings → Variables and Secrets → Add** 로 두 개를 **Secret(Encrypt)** 으로 저장:

| 이름 | 값 |
|---|---|
| `KAKAO_REST_API_KEY` | A-1의 REST API 키 |
| `KAKAO_REFRESH_TOKEN` | A-2의 refresh_token |

저장하면 자동 재배포됩니다. 앱에서 한마디를 하나 보내보세요 — 카톡 "나와의 채팅방"에 옵니다.

### 토큰이 끊기는 경우

리프레시 토큰은 쓸 때마다 만료가 미뤄집니다. 다만 **60일 넘게 한마디가 한 건도 안 들어오면**
만료돼서 A-2를 다시 해야 합니다. 아래 C(KV)를 같이 켜두면 Worker가 새 토큰을 자동으로
갈아 끼우므로 이 문제가 사실상 사라집니다.

---

## B. 웹훅으로 받기 (제일 빠름)

디스코드를 쓰신다면 3분이면 끝납니다.

1. 디스코드에서 개인 서버 하나 만들기 → 채널 하나 만들기
2. 채널 옆 **톱니바퀴 → 연동 → 웹후크 → 새 웹후크 → 웹후크 URL 복사**
3. Worker → **Settings → Variables and Secrets → Add** →
   이름 `FEEDBACK_WEBHOOK_URL`, 값은 복사한 URL, **Encrypt**로 저장

슬랙 Incoming Webhook, Make.com 웹훅도 같은 자리에 넣으면 그대로 작동합니다
(디스코드용 `content`, 슬랙용 `text`, 전체 데이터 `feedback`을 한 번에 보냅니다).

---

## C. Cloudflare KV에 쌓아두기 (보험)

전달이 실패해도 글 자체는 남기고, 카카오 토큰도 자동으로 갱신되게 합니다.

1. Cloudflare → **Storage & Databases → KV → Create namespace**, 이름 `maumjaro-feedback`
2. Worker → **Settings → Bindings → Add → KV namespace**
   - Variable name: `FEEDBACK_KV`  ← 이름이 정확해야 합니다
   - KV namespace: 방금 만든 `maumjaro-feedback`
3. 저장(자동 재배포)

쌓인 글은 KV namespace 화면에서 `fb:` 로 시작하는 키를 열어 보면 됩니다.

---

## 아무것도 설정하지 않으면

Worker가 500을 돌려주고, 앱은 그 글을 폰에 보관합니다(`maumjaro:feedbackOutbox`).
사용자에게는 "지금은 연결이 안 돼서 폰에 보관해뒀어요"라고 솔직하게 표시되고,
다음에 앱을 열 때 자동으로 다시 보냅니다. 즉 **설정이 늦어도 글은 잃지 않습니다.**

## 앱에서 보내는 정보

화면에 적어둔 것이 전부입니다 — 사용자가 쓴 글, 적어준 답장받을 곳(선택),
기기 종류(User-Agent), 화면 크기, 지금까지 주사를 놓은 횟수와 사용한 날짜 수.
이름·위치·연락처는 사용자가 직접 적은 것 외에는 보내지 않습니다.
바꾸려면 `feedback.js`의 `meta()`와 화면의 안내 문구(`.feedback-note`)를 **함께** 고쳐야 합니다.
