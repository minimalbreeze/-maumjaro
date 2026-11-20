"""야포츠 유튜브 채널 배너.

⚠️ **유튜브 배너는 기기마다 다르게 잘린다.** 2048×1152 로 올리지만 —

| 어디 | 보이는 영역 |
|---|---|
| 휴대폰 | 가운데 **1546×423** 만 |
| 태블릿 | 1855×423 |
| 데스크톱 | 2560×423 (좌우가 더 보임) |
| TV | **2048×1152 전부** |

그래서 로고·채널명·한 줄은 **반드시 1546×423 안**에 넣는다. 거기를 벗어나면
휴대폰에서 잘린다 — 보는 사람 대부분이 휴대폰이다.
바깥 영역은 TV 에서만 보이므로 **배경으로만** 쓴다.

제비 모양은 `제비.path` 하나에서 온다(로고와 같은 것). 손으로 다시 그리지
않는다 — 다시 그리는 순간 로고와 배너가 다른 새가 된다.
"""
import re

vb, D = open('제비.path').read().split('\n', 1)
BX, BY, BW, BH = [float(v) for v in open('제비.bbox').read().split()]

W, H = 2048, 1152
SAFE_W, SAFE_H = 1546, 423          # 휴대폰에서 보이는 가운데
SX, SY = (W - SAFE_W) / 2, (H - SAFE_H) / 2

INK, BG = '#ffffff', '#0d0d0d'
DIM = '#8c8c8c'                      # 검정 위 명암비 5.4 — 보조 문구용

def bird(size, cx, cy, fill=INK, opacity=1):
    """잉크 범위를 size 에 맞춰 (cx, cy) 중심으로."""
    s = size / max(BW, BH)
    o = f' opacity="{opacity}"' if opacity != 1 else ''
    return (f'<g transform="translate({cx - BW*s/2 - BX*s:.2f} {cy - BH*s/2 - BY*s:.2f}) '
            f'scale({s:.5f})"{o}><path fill="{fill}" fill-rule="evenodd" d="{D}"/></g>')

GRAIN = ('<filter id="g" x="-15%" y="-15%" width="130%" height="130%">'
         '<feTurbulence type="fractalNoise" baseFrequency="2.0" numOctaves="4" seed="11" result="n"/>'
         '<feDisplacementMap in="SourceGraphic" in2="n" scale="0.5" '
         'xChannelSelector="R" yChannelSelector="G"/></filter>')

def text(x, y, s, size, *, fill=INK, weight=900, anchor='middle', ls=0, family=None):
    fam = family or 'Arial Black, Arial, sans-serif'
    sp = f' letter-spacing="{ls}"' if ls else ''
    return (f'<text x="{x}" y="{y}" fill="{fill}" font-family="{fam}" '
            f'font-weight="{weight}" font-size="{size}" text-anchor="{anchor}"{sp}>{s}</text>')

KO = 'Noto Sans CJK KR, Noto Sans KR, sans-serif'

# ⚠️ 2026-11-18 효성님이 직접 정했다.
#    처음에 내가 '세어 보면 다르게 보입니다' 를 넣었는데 효성님:
#    "세어보먄 다르게 보입니다가 뭔소리야?"
#    맞는 지적이었다. '세어 본다' 는 내가 제목 만들 때 쓰는 내부 규칙에서
#    끌어온 말이라 처음 보는 사람에게는 아무 뜻이 없고, 더 나쁘게는
#    **그 한 줄에 야구도 KBO 도 없었다.** '야포츠' 만으로는 야구 채널인지
#    모른다. 배너 한 줄은 그걸 2초에 알려 주는 자리다.
TAG = '야알못의 야구 헛소리'

def banner(kind):
    cx, cy = W / 2, H / 2
    # 바깥(TV 에서만 보임)에 제비를 아주 흐리게 흩뿌린다. 안전 영역은 안 건드린다.
    # ⚠️ 처음엔 0.05~0.07 로 깔았는데 **화면에서 거의 안 보였다.** 검정 위
    #    흰색은 생각보다 빨리 묻힌다. 0.10~0.13 이 "있는 줄 아는" 정도다.
    far = (bird(170, 290, 240, INK, 0.12) + bird(110, 1770, 290, INK, 0.11) +
           bird(135, 230, 900, INK, 0.10) + bird(95, 1830, 865, INK, 0.12) +
           bird(78, 555, 150, INK, 0.10) + bird(88, 1490, 990, INK, 0.10) +
           bird(64, 980, 1050, INK, 0.08) + bird(58, 1120, 120, INK, 0.08))

    if kind == 'A':          # 가로형 — 왼쪽 제비, 오른쪽 글자
        body = (bird(250, cx - 420, cy, INK) +
                text(cx - 230, cy - 18, 'YAPORTS', 150, anchor='start', ls=10) +
                text(cx - 226, cy + 78, TAG, 58, fill=DIM, weight=500,
                     anchor='start', family=KO, ls=4))
    elif kind == 'B':        # 중앙 정렬 — 제비 위, 글자 아래
        body = (bird(190, cx, cy - 95, INK) +
                text(cx, cy + 75, 'YAPORTS', 130, ls=12) +
                text(cx, cy + 155, TAG, 52, fill=DIM, weight=500, family=KO, ls=6))
    else:                    # C — A 와 같은 가로형인데 제비를 크게, 글자를 작게
        # ⚠️ 처음 C안은 'YAPORTS' 를 end 로 정렬해 왼쪽으로 뻗게 했는데,
        #    안전영역 왼쪽(x 251) 밖으로 나갔다. 휴대폰에서 글자가 잘린다.
        body = (bird(330, cx - 430, cy, INK) +
                text(cx - 190, cy - 12, 'YAPORTS', 136, anchor='start', ls=9) +
                text(cx - 186, cy + 68, TAG, 54, fill=DIM, weight=500,
                     anchor='start', family=KO, ls=4))

    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">'
            f'<defs>{GRAIN}</defs><rect width="{W}" height="{H}" fill="{BG}"/>'
            f'{far}<g filter="url(#g)">{body}</g></svg>')

if __name__ == '__main__':
    for k in 'ABC':
        open(f'banner-{k}.svg', 'w').write(banner(k))
        print(f'banner-{k}.svg')
