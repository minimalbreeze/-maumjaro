#!/bin/sh
# 스윙자로 격리 검사
#
# 이 앱은 맘운자로와 완전히 분리되어야 한다. 한 번 실수로 저장소 루트의
# index.html(맘운자로 본체)을 건드린 적이 있어서, 말로 조심하는 대신 검사로 막는다.
# 커밋 전에 반드시 이 스크립트를 돌린다.
#
#   sh swing/check-isolation.sh
#
# swing/ 밖의 파일이 하나라도 바뀌어 있으면 1을 돌려주고 그 목록을 보여준다.

cd "$(dirname "$0")/.." || exit 2

BASE="${1:-origin/main}"
FAIL=0

echo "== 스윙자로 격리 검사 (기준: $BASE) =="

# 1) 아직 커밋하지 않은 변경
DIRTY=$(git status --porcelain | awk '{print $NF}' | grep -v '^swing/' || true)
if [ -n "$DIRTY" ]; then
  echo
  echo "[실패] swing/ 밖에 커밋되지 않은 변경이 있습니다:"
  echo "$DIRTY" | sed 's/^/    /'
  FAIL=1
fi

# 2) 이 브랜치가 기준 브랜치 대비 건드린 파일
CHANGED=$(git diff --name-only "$BASE"...HEAD 2>/dev/null | grep -v '^swing/' || true)
if [ -n "$CHANGED" ]; then
  echo
  echo "[실패] 이 브랜치가 swing/ 밖의 파일을 바꿨습니다:"
  echo "$CHANGED" | sed 's/^/    /'
  FAIL=1
fi

# 3) 맘운자로 본체 파일은 이름을 직접 찍어 한 번 더 본다
for f in index.html app.js prescriptions.js prescriptions-data.js manifest.json \
         style.css sitemap.xml CNAME icon.svg icon-192.png icon-512.png \
         icon-180.png icon-512-maskable.png icon-maskable.svg robots.txt; do
  if ! git diff --quiet "$BASE"...HEAD -- "$f" 2>/dev/null; then
    echo "[실패] 맘운자로 본체 파일이 수정되었습니다: $f"
    FAIL=1
  fi
done

# 4) 스윙자로가 맘운자로 파일을 불러 쓰지는 않는지 (상위 경로 참조 금지)
LEAK=$(grep -rn '\.\./' swing/*.html swing/*.js swing/*.css 2>/dev/null || true)
if [ -n "$LEAK" ]; then
  echo
  echo "[실패] swing/ 안에서 상위 폴더를 참조합니다. 스윙자로는 자기 폴더 안에서만 동작해야 합니다:"
  echo "$LEAK" | sed 's/^/    /'
  FAIL=1
fi

echo
if [ "$FAIL" -eq 0 ]; then
  echo "통과 — swing/ 밖은 하나도 건드리지 않았습니다."
else
  echo "위 항목을 되돌린 뒤 다시 검사하세요:  git checkout -- <파일>"
fi
exit "$FAIL"
