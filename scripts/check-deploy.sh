#!/usr/bin/env bash
# 라이브 사이트가 리포와 같은 내용인지 확인한다.
#
# 왜 필요한가
#   Pages 배포는 새 푸시가 들어오면 진행 중이던 것을 취소한다. 그 자체는 정상이다 —
#   더 새로운 커밋이 옛 것의 내용까지 담아 올라가기 때문이다. 문제는 버스트의
#   **마지막** 배포가 실패했을 때다(2026-11-06 14:01에 한 건 있었다). 그러면
#   다음 머지가 들어올 때까지 옛 화면이 그대로 떠 있고, 아무도 모른다.
#
# 무엇으로 판단하는가
#   sitemap.xml 하나만 보면 부족하다. 그 파일은 검색용 페이지를 다시 만들 때만
#   바뀌어서, index.html이나 style.css만 고친 배포가 빠진 것을 못 잡는다.
#   그래서 사이트의 얼굴에 해당하는 파일 몇 개를 내용으로 비교한다.
set -uo pipefail

SITE="${SITE:-https://maumjaro.minimalbreeze.com}"
FILES="${FILES:-sitemap.xml index.html rss.xml robots.txt llms.txt manifest.json}"

stale=""
missing=""
for f in $FILES; do
  [ -f "$f" ] || continue
  code=$(curl -sS -o /tmp/live-$$-"$(basename "$f")" -w '%{http_code}' "$SITE/$f" || echo 000)
  if [ "$code" != "200" ]; then
    missing="$missing $f(HTTP $code)"
    continue
  fi
  if ! cmp -s "/tmp/live-$$-$(basename "$f")" "$f"; then
    stale="$stale $f"
  fi
done
rm -f /tmp/live-$$-*

if [ -n "$missing" ] || [ -n "$stale" ]; then
  echo "낡음:$stale"
  echo "없음:$missing"
  echo "stale=1"
  exit 1
fi
echo "라이브가 리포와 같다 ($FILES)"
echo "stale=0"
