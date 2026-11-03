'use client';

import { useEffect, useRef, useState } from 'react';
import { dateLabel } from './lib/birthdayModel';
import { newspaperImageUrl } from './lib/birthdayNewspaper';
import type { PhotoState } from './lib/birthdayNewspaperView';
import styles from './birthdayStory.module.css';

/**
 * 그날 서울경제 1면 사진(원본 JPEG을 날짜 주소로 바로 불러온다) + "1면 크게 보기".
 * 사진이 뜨기 전에는 가로세로 비율대로 자리를 잡아 화면이 튀지 않게 하고, 못 찾으면(없음·네트워크 문제 구분 불가) 자리를 비운다.
 * 크게 보기는 기존 모달과 같은 네이티브 <dialog>(showModal)다. 화면 전체를 채워 스크롤로 이동하고, Esc나 닫기 버튼으로 닫으며,
 * 닫으면 눌렀던 버튼으로 포커스가 돌아온다.
 * onStatus는 같은 날짜에서 바뀌지 않는 함수여야 한다(바뀔 때마다 현재 사진 상태를 다시 알린다). 날짜가 바뀌면 호출하는 쪽이 key로 처음부터 다시 시작한다.
 */
export function BirthdayNewspaperPhoto({ date, status, onStatus }: { date: string; status: PhotoState; onStatus: (status: 'ok' | 'missing') => void }) {
  const imageRef = useRef<HTMLImageElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [zoomed, setZoomed] = useState(false);
  const src = newspaperImageUrl(date);
  const label = `${dateLabel(date)} 서울경제 1면`;

  // 이벤트보다 먼저 끝난 요청(캐시)도 결과를 알린다.
  useEffect(() => {
    const image = imageRef.current;
    if (image?.complete) onStatus(image.naturalWidth > 0 ? 'ok' : 'missing');
  }, [onStatus]);

  if (status === 'missing') return null;
  return <figure className={styles.photo} data-status={status}>
    {/* eslint-disable-next-line @next/next/no-img-element -- 같은 출처의 원본 JPEG을 자르지 않고 그대로 보여 준다(이미지 최적화 대상 아님). */}
    <img ref={imageRef} src={src} alt={label} loading="lazy" decoding="async" onLoad={() => onStatus('ok')} onError={() => onStatus('missing')} />
    {status === 'ok' && <div className={styles.photoActions}>
      <button type="button" className={styles.sceneAction} aria-haspopup="dialog" onClick={() => { setZoomed(true); dialogRef.current?.showModal(); }}>1면 크게 보기</button>
    </div>}
    {/* 안에서 누를 수 있는 것은 닫기 버튼 하나뿐이라 Tab이 주소창 쪽으로 빠지지 않게 그 버튼에 붙들어 둔다. */}
    <dialog ref={dialogRef} className={styles.zoom} aria-label={`${label} 크게 보기`} onClose={() => setZoomed(false)}
      onKeyDown={event => { if (event.key === 'Tab') { event.preventDefault(); event.currentTarget.querySelector('button')?.focus(); } }}>
      {zoomed && <>
        {/* 내용은 showModal() 뒤에 그려지므로 브라우저가 첫 버튼을 고르지 못한다 — 열릴 때 닫기 버튼에 포커스를 둔다. */}
        <button type="button" className={styles.zoomClose} autoFocus onClick={() => dialogRef.current?.close()}>닫기</button>
        {/* eslint-disable-next-line @next/next/no-img-element -- 위와 같은 사진(브라우저 캐시), 확대·이동을 위해 폭을 키워 보여 준다. */}
        <img className={styles.zoomImage} src={src} alt={label} />
      </>}
    </dialog>
  </figure>;
}
