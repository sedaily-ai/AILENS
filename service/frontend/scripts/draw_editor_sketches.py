#!/usr/bin/env python3
"""이미지가 없는 에디터 4명의 손그림풍 졸라맨 선화(SVG) 생성 — public/editors/{id}.svg.
- 선이 손으로 그은 것처럼 아주 조금씩 흔들리도록 점을 흩뜨린 곡선으로 그린다(시드 고정이라 다시 실행해도 같은 그림).
- 실제 일러스트가 준비되면 이 파일을 교체하고 editors.ts 의 image 경로만 바꾸면 된다.
"""
import math
import random
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "public" / "editors"
INK = "#2b3350"


def smooth(points, closed=False):
    """점들을 지나는 부드러운 3차 곡선 경로(Catmull-Rom → Bezier)."""
    pts = points + points[:3] if closed else points
    d = f"M{pts[1][0]:.1f},{pts[1][1]:.1f}" if closed else f"M{pts[0][0]:.1f},{pts[0][1]:.1f}"
    start = 1 if closed else 0
    end = len(points) + 1 if closed else len(pts) - 1
    for i in range(start, end - (0 if closed else 0)):
        p0 = pts[max(i - 1, 0)]
        p1 = pts[i]
        p2 = pts[min(i + 1, len(pts) - 1)]
        p3 = pts[min(i + 2, len(pts) - 1)]
        c1 = (p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6)
        d += f" C{c1[0]:.1f},{c1[1]:.1f} {c2[0]:.1f},{c2[1]:.1f} {p2[0]:.1f},{p2[1]:.1f}"
    return d


class Pen:
    def __init__(self, seed):
        self.r = random.Random(seed)
        self.paths = []

    def j(self, v, a=1.1):
        return v + self.r.uniform(-a, a)

    def circle(self, cx, cy, rad, w=3.2, fill="none"):
        n = 18
        pts = []
        for k in range(n):
            t = 2 * math.pi * k / n
            rr = rad + self.r.uniform(-1.3, 1.3)
            pts.append((cx + rr * math.cos(t), cy + rr * math.sin(t)))
        self.paths.append(f'<path d="{smooth(pts, closed=True)}" fill="{fill}" stroke="{INK}" stroke-width="{w}" stroke-linecap="round" stroke-linejoin="round"/>')

    def line(self, pts, w=3.2, fill="none"):
        jp = [(self.j(x), self.j(y)) for x, y in pts]
        if len(jp) == 2:  # 직선도 중간점을 하나 두어 살짝 휘게
            mx, my = (jp[0][0] + jp[1][0]) / 2, (jp[0][1] + jp[1][1]) / 2
            jp = [jp[0], (self.j(mx, 1.6), self.j(my, 1.6)), jp[1]]
        self.paths.append(f'<path d="{smooth(jp)}" fill="{fill}" stroke="{INK}" stroke-width="{w}" stroke-linecap="round" stroke-linejoin="round"/>')

    def dot(self, x, y, r=2.6):
        self.paths.append(f'<circle cx="{self.j(x, .6):.1f}" cy="{self.j(y, .6):.1f}" r="{r}" fill="{INK}"/>')

    def rect(self, x, y, w, h, wd=3.0, fill="none"):
        self.line([(x, y), (x + w, y), (x + w, y + h), (x, y + h), (x, y)], w=wd, fill=fill)

    def svg(self, accent):
        body = "\n  ".join(self.paths)
        return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200" role="img" aria-hidden="true">\n'
                f'  <circle cx="100" cy="112" r="78" fill="{accent}" opacity="0.55"/>\n  {body}\n</svg>\n')


def bust(p, face="smile"):
    """공통: 머리, 얼굴, 목, 어깨 선."""
    p.circle(100, 78, 30)
    p.dot(90, 74)
    p.dot(110, 74)
    if face == "smile":
        p.line([(90, 90), (100, 96), (110, 90)], w=2.6)
    elif face == "flat":
        p.line([(91, 92), (109, 92)], w=2.6)
    p.line([(100, 108), (100, 124)])                       # 목
    p.line([(58, 178), (66, 140), (100, 124), (134, 140), (142, 178)])  # 어깨와 몸통


def jihoon():  # AI·테크 — 둥근 안경 + 칩
    p = Pen(11)
    bust(p, "flat")
    p.circle(90, 74, 8, w=2.4)
    p.circle(110, 74, 8, w=2.4)
    p.line([(98, 74), (102, 74)], w=2.4)
    p.line([(66, 140), (50, 150), (46, 134)])               # 팔
    p.rect(30, 108, 28, 28, wd=2.8)                         # 칩
    for x in (36, 44, 52):
        p.line([(x, 108), (x, 101)], w=2.2)
        p.line([(x, 136), (x, 143)], w=2.2)
    p.circle(44, 122, 4, w=2.0)
    return p.svg("#e6defc")


def seoyeon():  # 정책·거버넌스 — 묶음 머리 + 서류
    p = Pen(23)
    bust(p, "flat")
    p.circle(100, 44, 8, w=2.8)                              # 묶음 머리
    p.line([(72, 70), (76, 52), (100, 46), (124, 52), (128, 70)], w=2.6)
    p.line([(134, 140), (150, 148), (156, 130)])
    p.rect(146, 96, 34, 44, wd=2.8)                          # 서류
    for y in (108, 116, 124):
        p.line([(152, y), (174, y)], w=2.0)
    return p.svg("#dde7fb")


def yerin():  # 국제·라이프 — 챙 넓은 모자 + 지구본
    p = Pen(37)
    bust(p, "smile")
    p.line([(62, 58), (78, 52), (100, 50), (122, 52), (138, 58)], w=3.0)   # 모자 챙
    p.line([(76, 54), (80, 40), (100, 36), (120, 40), (124, 54)], w=3.0)   # 모자 윗부분
    p.line([(66, 140), (48, 150), (44, 134)])
    p.circle(40, 112, 20, w=2.8)                              # 지구본
    p.line([(20, 112), (60, 112)], w=2.0)
    p.line([(40, 92), (34, 112), (40, 132)], w=2.0)
    p.line([(40, 92), (46, 112), (40, 132)], w=2.0)
    return p.svg("#fbe0e6")


def siu():  # 생활경제 — 체크리스트 + 연필
    p = Pen(41)
    bust(p, "smile")
    p.line([(134, 140), (150, 150), (154, 132)])
    p.rect(142, 92, 36, 48, wd=2.8)                           # 체크리스트판
    for k, y in enumerate((104, 116, 128)):
        p.line([(148, y), (152, y + 4), (158, y - 3)], w=2.2)  # 체크
        p.line([(162, y), (174, y)], w=2.0)
    p.line([(56, 172), (48, 150)], w=2.6)                     # 연필
    p.line([(48, 150), (44, 142), (52, 146)], w=2.2)
    return p.svg("#dff3e3")


if __name__ == "__main__":
    for name, fn in (("jihoon", jihoon), ("seoyeon", seoyeon), ("yerin", yerin), ("siu", siu)):
        (OUT / f"{name}.svg").write_text(fn(), encoding="utf-8")
        print("saved", name)
