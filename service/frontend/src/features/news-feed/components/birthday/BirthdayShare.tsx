import { useEffect, useId, useRef, useState } from 'react';
import type { BirthdayResult, ViewMode } from './data/birthdayTypes';
import { comparableAnnual, shareUrl } from './lib/birthdayModel';
import { drawShare } from './lib/birthdayShare';
import { selectShareComparisons } from './lib/birthdayShareSelection';
import { ChevronDown } from 'lucide-react';
import styles from './birthdayMarket.module.css';

export function BirthdayShare({ result, mode }: { result: BirthdayResult; mode: ViewMode }) {
  const id = useId();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [includeDay, setIncludeDay] = useState(false);
  const [status, setStatus] = useState('');
  const [link, setLink] = useState('');
  const { rising, falling, unchanged } = selectShareComparisons(comparableAnnual(result));
  useEffect(() => {
    let active = true;
    const paint = () => { if (active && canvas.current) drawShare(canvas.current, result, includeDay && mode !== 'year'); };
    paint();
    void document.fonts.ready.then(paint);
    return () => { active = false; };
  }, [result, includeDay, mode]);

  async function copy() {
    const url = shareUrl(window.location.origin, result);
    setLink(url);
    setStatus('아래 링크를 직접 복사할 수도 있어요.');
    try { await navigator.clipboard.writeText(url); setStatus('출생연도만 담은 링크를 복사했어요.'); }
    catch { setStatus('아래 링크를 선택해 직접 복사해 주세요.'); }
  }
  function download() {
    if (!canvas.current) return;
    canvas.current.toBlob(blob => {
      if (!blob) { setStatus('이미지를 만들지 못했어요. 다시 시도해 주세요.'); return; }
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url; anchor.download = `lens-birthday-${result.date.year}.png`; anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setStatus('공유 이미지를 저장했어요.');
    }, 'image/png');
  }
  return <section className={styles.share} aria-labelledby={`${id}-title`}>
    <div><h4 id={`${id}-title`}>내 생일의 경제 이야기를 공유해보세요</h4><p>내가 태어난 해부터 달라진 경제를 한 장에 담았어요. 이미지를 저장하거나 링크를 복사해 공유해보세요.</p>
      <p className={styles.note}>이번 이미지에는 상승 {rising.length}개·하락 {falling.length}개 지표를 담아요.{unchanged > 0 && ` 변화가 없는 지표 ${unchanged}개는 순위에서 제외했어요.`}</p>
      <label className={styles.checkbox}><input type="checkbox" checked={includeDay} disabled={mode === 'year'} onChange={event => { setIncludeDay(event.target.checked); setStatus(''); }} />공유 이미지에 내 생일 표시하기</label>
      <p className={styles.note}>{mode === 'year' ? '출생연도만으로 열린 결과예요. 월·일을 표시하려면 내 생일로 다시 조회해 주세요.' : '선택하면 이미지에 생일의 월·일까지 표시돼요.'} 링크에는 항상 출생연도만 담아요.</p>
      <details className={styles.shareCriteria}><summary>공유 항목은 어떻게 골랐나요?<ChevronDown size={16} aria-hidden="true" /></summary>
        <p>출생연도와 2025년의 연간 자료가 모두 있는 지표만 비교해요. 변화율은 (2025년 값 − 출생연도 값) ÷ 출생연도 값 × 100으로 계산해요.{result.date.year > 2025 && ' 2026년 출생은 연간 자료가 아직 없어 비교를 준비 중이에요.'}</p>
        <p>상승률이 큰 순서로 최대 3개, 하락률이 큰 순서로 최대 3개를 담고, 변화가 없는 지표는 제외해요. 자료가 적으면 확인된 항목만 담아요.</p>
        <p>현재 비교 후보는 소비자물가와 1인당 국민총소득 2개예요. 위 생일 시세와 기준 시점이 다를 수 있으며, 투자 수익률을 뜻하지 않아요.</p>
      </details>
      <div className={styles.actions}><button type="button" className={styles.primary} onClick={download}>이미지 저장</button><button type="button" className={styles.secondary} onClick={copy}>링크 복사</button></div>
      <p role="status" className={styles.note}>{status}</p>{link && <input className={styles.shareLink} aria-label="출생연도 공유 링크" value={link} readOnly onFocus={event => event.target.select()} />}
    </div><figure><canvas ref={canvas} width={1080} height={1350} role="img" aria-label="출생연도 기준 시세 공유 이미지" /><figcaption>공유 이미지 미리보기</figcaption></figure>
  </section>;
}
