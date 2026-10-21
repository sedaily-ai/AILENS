import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { BigKindsArticle } from '@/shared/lib/api/timelineApi';
import type { BirthdayResult, ViewMode } from './data/birthdayTypes';
import type { AssetBase, AssetCell } from './lib/birthdayAssets';
import { shareUrl } from './lib/birthdayModel';
import { drawShare, shareText, type ShareVariant } from './lib/birthdayShare';
import { nb } from './lib/keepTogether';
import styles from './birthdayStory.module.css';

const FONTS = ['800 60px Pretendard', '900 60px Pretendard', '900 64px "Noto Serif KR"', '700 36px "Noto Serif KR"'];

/** ⑥ 공유 — 결과 맨 아래. 9:16 생일 영수증·1면 카드. 휴대폰은 시스템 공유 창(카톡·인스타)으로 바로 보내고, 안 되면 이미지로 저장한다. */
export function BirthdayShare({ result, mode, assets, assetBase, front, variant, onVariant, onTryFriend }: {
  result: BirthdayResult; mode: ViewMode; assets: AssetCell[]; assetBase: AssetBase | null; front: BigKindsArticle[];
  variant: ShareVariant; onVariant: (variant: ShareVariant) => void; onTryFriend: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const blob = useRef<Blob | null>(null);
  const [includeDay, setIncludeDay] = useState(false);
  const [status, setStatus] = useState('');
  const current: ShareVariant = variant === 'front' && front.length ? 'front' : 'receipt';
  const dayShown = includeDay && mode !== 'year';
  const fileName = `lens-birthday-${result.date.year}${current === 'front' ? '-front' : ''}.png`;

  useEffect(() => {
    let active = true;
    // 공유 창은 누른 순간에 열어야 해서(브라우저의 사용자 동작 제한) 그릴 때마다 이미지를 미리 만들어 둔다.
    const paint = () => {
      if (!active || !canvas.current) return;
      drawShare(canvas.current, result, { variant: current, mode, includeDay: dayShown, front, assets, assetBase });
      canvas.current.toBlob(made => { if (active) blob.current = made; }, 'image/png');
    };
    paint();
    // 웹 글꼴은 글자 범위별로 나뉘어 내려오므로 카드에 들어갈 제목(한자 포함)을 넘겨 필요한 조각까지 받는다.
    const titles = front.slice(0, 5).map(article => article.title).join('') || '서울경제';
    void Promise.all(FONTS.map(font => document.fonts.load(font, titles))).then(paint, paint);
    return () => { active = false; };
  }, [result, current, mode, dayShown, front, assets, assetBase]);

  function save() {
    if (!blob.current) { setStatus('이미지를 만드는 중이에요. 잠시 뒤 다시 눌러 주세요.'); return; }
    const url = URL.createObjectURL(blob.current);
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = fileName; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStatus('이미지로 저장했어요.');
  }
  async function share() {
    const file = blob.current ? new File([blob.current], fileName, { type: 'image/png' }) : null;
    const data = { title: '내 생일 타임머신', text: shareText(result, current), url: shareUrl(window.location.origin, result) };
    if (file && navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ ...data, files: [file] }); setStatus('공유했어요.'); }
      catch (error) { if ((error as DOMException).name !== 'AbortError') { save(); setStatus('공유 창을 열 수 없어 이미지로 저장했어요.'); } }
      return;
    }
    save();
    setStatus('이 기기에서는 바로 공유할 수 없어 이미지로 저장했어요. 저장한 이미지를 올려 주세요.');
  }

  return <section id="birthday-share" className={styles.share} aria-labelledby="birthday-share-title">
    <h3 id="birthday-share-title" className={styles.title}>내 생일 영수증</h3>
    <div className={styles.shareBody}>
    <figure className={styles.preview}><canvas ref={canvas} width={1080} height={1920} role="img" aria-label="내 생일 타임머신 공유 카드" /></figure>
    <div className={styles.shareControls}>
    {front.length > 0 && <div className={styles.variants} role="group" aria-label="카드 종류">
      <button type="button" aria-pressed={current === 'receipt'} onClick={() => onVariant('receipt')}>생일 영수증</button>
      <button type="button" aria-pressed={current === 'front'} onClick={() => onVariant('front')}>1면 카드</button>
    </div>}
    {current === 'receipt' && mode !== 'year' && <label className={styles.checkbox}><input type="checkbox" checked={includeDay} onChange={event => { setIncludeDay(event.target.checked); setStatus(''); }} />내 생일 넣기</label>}
    <div className={styles.shareActions}>
      <button type="button" className={styles.primary} onClick={share}>공유하기</button>
      <button type="button" onClick={save}>이미지 저장</button>
      <button type="button" className={styles.friend} onClick={onTryFriend}>친구 생일로 해보기</button>
    </div>
    <p role="status" className={styles.status}>{status}</p>
    {/* 넓은 화면은 '무엇이 찍히나 / 누가 보나 / 그래서 동의' 세 줄로 끊는다(.lines). */}
    <p className={`${styles.source} ${styles.lines}`}>
      <span>{current === 'front' ? '1면 카드에는 생일 날짜가 들어가요.' : mode === 'year' ? '출생연도로 공유된 결과라 출생연도만 찍혀요.' : `내 생일을 넣으면 월·일${front.length ? '과 그날 1면 제목' : ''}이 찍히고, ${nb('넣지 않으면 출생연도만 보여요.')}`}</span>
      {(current === 'front' || dayShown) && <>{' '}<span>생일이 들어간 이미지는 {nb('받은 사람')} 누구나 {nb('볼 수 있으니')}</span>{' '}<span>다른 사람 생일이라면 먼저 동의를 {nb('받아 주세요')}.</span></>}
    </p>
    <Link className={styles.official} href="/onboarding#newsletter" prefetch={false}>서울경제 뉴스레터 받기</Link>
    </div>
    </div>
  </section>;
}
