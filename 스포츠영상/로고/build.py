"""야포츠 로고 — 추적한 제비 패스로 쓰임새별 SVG 를 만든다.

모양은 실행 #100 의 '단순' 을 trace.py 로 벡터 추적한 것이다. 손으로 그리지
않는다 — 여섯 번 실패한 자리다.

⚠️ 잉크의 실제 범위로 가운데를 맞춘다. 패스 뷰박스로 맞추면 한쪽으로 쏠린다.
⚠️ 판화톤은 feTurbulence 로 가장자리만 흔든다. **가는 부분이 흔들림에 약하다** —
   1.5/1.3 으로는 꼬리 끝과 날개 끝이 갉아먹힌 것처럼 부서졌다. 네 단계를
   나란히 놓고 골랐다. 2.0/0.5 가 판화 느낌은 살리면서 꼬리를 안 먹는다.
   ⚠️ scale 을 0.5 보다 키우지 않는다. 굵은 몸통은 멀쩡해 보여도 꼬리가 먼저 깨진다.
"""
import re, sys

vb, D = open('제비.path').read().split('\n', 1)
BX, BY, BW, BH = [float(v) for v in open('제비.bbox').read().split()]

INK, BG = '#ffffff', '#0d0d0d'

def grain(gid, freq, scale, seed=11):
    return (f'<filter id="{gid}" x="-15%" y="-15%" width="130%" height="130%">'
            f'<feTurbulence type="fractalNoise" baseFrequency="{freq}" numOctaves="4" '
            f'seed="{seed}" result="n"/>'
            f'<feDisplacementMap in="SourceGraphic" in2="n" scale="{scale}" '
            f'xChannelSelector="R" yChannelSelector="G"/></filter>')

def bird(size, cx, cy):
    """잉크 범위를 size 에 맞춰 (cx, cy) 를 중심으로 놓는다."""
    s = size / max(BW, BH)
    return (f'<g transform="translate({cx - BW*s/2 - BX*s:.3f} {cy - BH*s/2 - BY*s:.3f}) '
            f'scale({s:.5f})"><path fill="{INK}" fill-rule="evenodd" d="{D}"/></g>')

def word(y, size, length):
    return (f'<text x="50" y="{y}" fill="{INK}" font-family="Arial Black, Arial, sans-serif" '
            f'font-weight="900" font-size="{size}" textLength="{length}" '
            f'lengthAdjust="spacingAndGlyphs" text-anchor="middle">YAPORTS</text>')

def logo(*, text=True, print_tone=True, round_bg=False, transparent=False):
    g = grain('g', 2.0, 0.5)
    inner = bird(62, 50, 40) + word(86, 15, 56) if text else bird(78, 50, 50)
    if print_tone:
        inner = f'<g filter="url(#g)">{inner}</g>'
    # 영상 안 워터마크는 배경이 없어야 한다. 화면 위에 제비만 얹힌다.
    bgshape = ('' if transparent else
               f'<circle cx="50" cy="50" r="50" fill="{BG}"/>' if round_bg
               else f'<rect width="100" height="100" fill="{BG}"/>')
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">'
            f'<defs>{g}</defs>{bgshape}{inner}</svg>')

if __name__ == '__main__':
    out = {
        'yaports-logo.svg':        logo(),                      # 기본: 글자 + 판화톤
        'yaports-mark.svg':        logo(text=False),            # 제비만 — 작은 자리·워터마크
        'yaports-logo-plain.svg':  logo(print_tone=False),      # 판화톤 없이
        'yaports-mark-plain.svg':  logo(text=False, print_tone=False),
        # 영상 안 워터마크용 — 배경 없이 제비만
        'yaports-watermark.svg':   logo(text=False, transparent=True),
    }
    for name, svg in out.items():
        open(name, 'w').write(svg)
        print(name, len(svg), '자')
