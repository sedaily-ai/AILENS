import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';
import type { CompareCardData } from './compareCard';

// 비교 카드 PNG 렌더러(next/og). 두 크기:
//  · og    1200×630  — 링크 미리보기(카카오톡·페이스북·X)용. card/[id] 페이지의 og:image.
//  · story 1080×1350 — 저장·인스타그램 업로드용 세로 카드.
// 글꼴은 public/fonts/card의 Pretendard OTF(SIL OFL, 같은 폴더 LICENSE.txt). next/og는 woff2를 못 읽어 사이트용 woff2 서브셋 대신 OTF를 둔다.
// Dockerfile이 public/을 그대로 복사하므로 컨테이너에서도 process.cwd()/public 아래에 있다.

export type CardVariant = 'og' | 'story';

export const CARD_SIZES: Record<CardVariant, { width: number; height: number }> = {
  og: { width: 1200, height: 630 },
  story: { width: 1080, height: 1350 },
};

/** 형식별 첫 마디에 허용하는 글자 수(칸 크기에 맞춘 값). */
export const CARD_TEXT_MAX: Record<CardVariant, number> = { og: 62, story: 110 };

type CardFont = { name: string; data: ArrayBuffer; weight: 500 | 700; style: 'normal' };
let fontsPromise: Promise<CardFont[]> | null = null;

function loadFonts(): Promise<CardFont[]> {
  if (!fontsPromise) {
    const read = async (file: string, weight: 500 | 700): Promise<CardFont> => {
      const buf = await readFile(join(process.cwd(), 'public', 'fonts', 'card', file));
      const data = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
      return { name: 'Pretendard', data, weight, style: 'normal' };
    };
    fontsPromise = Promise.all([read('Pretendard-Medium.otf', 500), read('Pretendard-Bold.otf', 700)]).catch((e) => {
      fontsPromise = null; // 실패를 굳히지 않는다 — 다음 요청이 다시 읽는다.
      throw e;
    });
  }
  return fontsPromise;
}

const INK = '#111827';
const MUTED = '#6b7280';
const BRAND = '#1d4ed8';

function Box({ e, variant }: { e: CompareCardData['entries'][number]; variant: CardVariant }) {
  const story = variant === 'story';
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        minWidth: 0,
        padding: story ? '26px 28px' : '16px 20px',
        borderRadius: story ? 26 : 18,
        background: e.tint,
        overflow: 'hidden',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ width: story ? 14 : 10, height: story ? 14 : 10, borderRadius: 999, background: e.color }} />
        <span style={{ fontSize: story ? 34 : 24, fontWeight: 700, color: e.color }}>{e.label}</span>
        <span style={{ fontSize: story ? 20 : 15, fontWeight: 500, color: MUTED }}>{e.who}</span>
      </div>
      <div style={{ display: 'flex', marginTop: story ? 14 : 8, fontSize: story ? 27 : 19, lineHeight: 1.5, fontWeight: 500, color: INK, wordBreak: 'keep-all' }}>
        {`“${e.text}”`}
      </div>
    </div>
  );
}

export async function renderCompareCard(card: CompareCardData, variant: CardVariant, headers: Record<string, string>) {
  const { width, height } = CARD_SIZES[variant];
  const story = variant === 'story';
  const rows = [card.entries.slice(0, 2), card.entries.slice(2, 4)].filter((r) => r.length > 0);
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: '#ffffff',
          padding: story ? '64px 52px 52px' : '36px 52px 30px',
          fontFamily: 'Pretendard',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: story ? 30 : 22, fontWeight: 700, color: BRAND, letterSpacing: 1 }}>AI LENS</span>
            <span style={{ fontSize: story ? 24 : 17, fontWeight: 700, color: INK }}>같은 뉴스, 4가지로 비교</span>
          </div>
          <span style={{ fontSize: story ? 22 : 16, fontWeight: 500, color: MUTED }}>
            {[card.category, card.date].filter(Boolean).join(' · ')}
          </span>
        </div>
        <div
          style={{
            display: 'flex',
            marginTop: story ? 30 : 14,
            fontSize: story ? 50 : 34,
            lineHeight: 1.32,
            fontWeight: 700,
            color: INK,
            letterSpacing: -1,
            wordBreak: 'keep-all',
          }}
        >
          {card.headline}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, gap: story ? 20 : 14, marginTop: story ? 36 : 16 }}>
          {rows.map((row, ri) => (
            <div key={ri} style={{ display: 'flex', flex: 1, minHeight: 0, gap: story ? 20 : 16 }}>
              {row.map((e) => (
                <Box key={e.format} e={e} variant={variant} />
              ))}
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', marginTop: story ? 30 : 16, alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: story ? 24 : 16, fontWeight: 500, color: MUTED }}>
            사실은 같고, 전하는 방식만 달라요 · 서울경제 기사 바탕
          </span>
          <span style={{ fontSize: story ? 26 : 18, fontWeight: 700, color: BRAND }}>ailens.sedaily.ai</span>
        </div>
      </div>
    ),
    { width, height, fonts: await loadFonts(), headers },
  );
}
