# AI 맘운 — DeepSeek 연동 배포 가이드

`deepseek-worker.js`를 Cloudflare Worker로 배포하면, `fortune.js`의 AI 맘운이
템플릿 기반 유사 AI 대신 실제 DeepSeek API로 답변합니다. API 키는 Worker
안에서만 다뤄지고 GitHub Pages(정적 사이트) 코드에는 전혀 노출되지 않습니다.

## 왜 이렇게 하는가

DeepSeek 같은 API는 매 요청마다 비밀 키를 헤더에 실어 보내야 합니다.
GitHub Pages는 서버가 없는 정적 사이트라, 키를 클라이언트 JS에 넣으면
배포된 코드 그대로 전 세계에 공개됩니다 — 봇들이 GitHub를 실시간으로
스캔해 이런 키를 찾아내 도용합니다. Cloudflare Worker는 그 사이에서
"내 키를 들고 있는 대신 요청을 대신 전달해주는" 서버 역할을 합니다.
Worker 자체는 무료 티어로 충분합니다(하루 10만 요청).

## 1. DeepSeek 키 재발급 (필수)

공유해주신 키(`sk-c3d983...`)는 이미 이 대화에 평문으로 노출됐습니다.
[DeepSeek 대시보드](https://platform.deepseek.com/api_keys)에서 그 키를
폐기하고 새 키를 발급받으세요. 아래 단계에서는 그 **새 키**를 씁니다.

## 2. Cloudflare 계정 준비

1. [cloudflare.com](https://dash.cloudflare.com/sign-up)에서 무료 계정 생성(이미 있으면 생략).
2. 로그인 후 왼쪽 메뉴에서 **Workers & Pages** 클릭.

## 3. Worker 배포

**대시보드로 하는 방법(코드 설치 없이 가능)**:

1. **Workers & Pages → Create → Create Worker** 클릭.
2. 이름을 정합니다(예: `maumjaro-ai`). URL이 `https://maumjaro-ai.<your-subdomain>.workers.dev` 형태로 생깁니다 — 이 URL을 나중에 씁니다.
3. **Deploy** 후 **Edit code**로 들어가서, 에디터 내용을 전부 지우고 이 저장소의 `deepseek-worker.js` 파일 내용을 그대로 붙여넣습니다.
4. **Save and deploy**.

## 4. API 키를 Worker 비밀값으로 등록

1. 방금 만든 Worker의 **Settings → Variables and Secrets**로 이동.
2. **Add** → 이름 `DEEPSEEK_API_KEY`, 값에 새로 발급받은 DeepSeek 키 입력, **Encrypt**(Secret) 옵션으로 저장.
3. 저장 후 재배포(대시보드가 자동으로 다시 배포합니다).

## 5. fortune.js에 Worker 주소 연결

`fortune.js` 상단의 `AI_MAUMUN_PROXY_URL` 상수를 3단계에서 확인한 Worker
URL로 바꿔주세요:

```js
const AI_MAUMUN_PROXY_URL = 'https://maumjaro-ai.<your-subdomain>.workers.dev';
```

빈 문자열(`''`)로 두면 지금처럼 템플릿 기반 유사 AI로 자동 동작합니다 —
즉 Worker를 아직 안 만들었어도 앱은 정상 작동합니다.

## 6. 확인

배포 후 앱에서 AI 맘운에게 질문을 하나 던져보고, 매번 문장이 조금씩 달라지면
(템플릿 방식은 같은 질문·같은 날엔 항상 같은 답) 정상적으로 실제 AI가
붙은 것입니다.

## ⚠️ 이미 배포하신 분은 Worker를 다시 붙여넣어야 합니다

`deepseek-worker.js`가 바뀌었습니다. **답변 길이를 호출하는 쪽이 정하도록** 바꾼
것이라, 예전 Worker가 그대로 돌고 있으면 AI 맘운이 여전히 320토큰에서 잘립니다
(질문은 길게 받아놓고 답은 세 줄만 나오는 상태가 됩니다).

**Workers & Pages → 해당 Worker → Edit code**로 들어가서 내용을 전부 지우고
이 저장소의 `deepseek-worker.js`를 다시 붙여넣은 뒤 **Save and deploy** 하세요.
API 키(Secret)는 그대로 남아 있으므로 다시 넣지 않아도 됩니다.

무엇이 바뀌었는지:

| 항목 | 이전 | 이후 |
|---|---|---|
| 답변 길이 | 320토큰 고정 | 호출한 쪽이 지정 (64~1400 사이로 제한) |
| 온도 | 0.8 고정 | 호출한 쪽이 지정 (0~1.5 사이로 제한) |
| 질문 길이 | 1500자에서 자름 | 4000자에서 자름 |

값은 서버에서 다시 범위 안으로 깎기 때문에, 주소를 알아낸 사람이 큰 숫자를 보내도
과금이 터지지 않습니다.

## 참고 — 비용/오남용 관리

- Worker의 CORS를 `https://maumjaro.minimalbreeze.com`으로만 열어뒀지만, 이건
  브라우저에서의 직접 호출만 막을 뿐 완벽한 보안은 아닙니다. DeepSeek
  대시보드에서 **월 사용량 한도(spending limit)**를 걸어두는 걸 권장합니다.
- 질문 길이는 Worker에서 4000자로 제한해뒀습니다(과금 폭주 방지). 앱 화면에서는
  800자까지만 입력받으므로 실제로는 그 아래에서 끊깁니다.
- 답변 길이 상한은 Worker에서 1400토큰입니다. AI 맘운이 이 상한을 쓰고,
  스레드 공유 문구는 220토큰만 씁니다.
- 대략적인 비용 감각: AI 맘운 답변 1건이 약 0.002달러(3원 안팎)입니다.
  하루 100명이 한 번씩 물어봐도 하루 300원 수준입니다.
