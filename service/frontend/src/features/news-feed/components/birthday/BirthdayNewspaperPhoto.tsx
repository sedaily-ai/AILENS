'use client';

import { useEffect, useRef, useState } from 'react';
import { dateLabel } from './lib/birthdayModel';
import { newspaperImageUrl } from './lib/birthdayNewspaper';
import type { PhotoState } from './lib/birthdayNewspaperView';
import { BirthdayNewspaperViewer } from './BirthdayNewspaperViewer';
import styles from './birthdayStory.module.css';

/**
 * 그날 서울경제 1면 사진(원본 JPEG을 날짜 주소로 바로 불러온다) + "1면 크게 보기".
 * 사진이 뜨기 전에는 가로세로 비율대로 자리를 잡아 화면이 튀지 않게 하고, 못 찾으면(없음·네트워크 문제 구분 불가) 자리를 비운다.
 * 크게 보기는 기존 모달과 같은 네이티브 <dialog>(showModal)다. 안쪽(전체 맞춤·확대·원본 받기)은 BirthdayNewspaperViewer가 맡고,
 * 여기서는 열고 닫기만 한다. Esc나 닫기 버튼으로 닫으며, 닫으면 눌렀던 버튼으로 포커스가 돌아온다.
 * onStatus는 같은 날짜에서 바뀌지 않는 함수여야 한다(바뀔 때마다 현재 사진 상태를 다시 알린다). 날짜가 바뀌면 호출하는 쪽이 key로 처음부터 다시 시작한다.
 */
export function BirthdayNewspaperPhoto({ date, status, size = 'full', onStatus }: {
  date: string; status: PhotoState; size?: 'compact' | 'full'; onStatus: (status: 'ok' | 'missing') => void;
}) {
  const imageRef = useRef<HTMLImageElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [zoomed, setZoomed] = useState(false);
  const src = newspaperImageUrl(date);
  const label = `${dateLabel(date)} 서울경제 1면`;
  const open = () => { setZoomed(true); dialogRef.current?.showModal(); };

  // 이벤트보다 먼저 끝난 요청(캐시)도 결과를 알린다.
  useEffect(() => {
    const image = imageRef.current;
    if (image?.complete) onStatus(image.naturalWidth > 0 ? 'ok' : 'missing');
  }, [onStatus]);

  if (status === 'missing') return null;
  // 사진을 불러온 뒤에는 사진 자체도 눌러서 크게 볼 수 있다(아래 "1면 크게 보기" 버튼과 같은 동작). <img>는 항상 같은 버튼 안, 같은 자리에 둔다 —
  // 상태에 따라 <img>를 다른 부모로 옮기면 요소가 다시 만들어져 사진이 깜박이고 onLoad가 되풀이된다.
  // 사진을 불러오는 동안에는 열 게 없어 disabled다. 그 몇 초 동안은 아래 "1면 크게 보기" 버튼도 아직 없으므로 누를 수 있는 척하지 않는 것이 일관된다.
  const ready = status === 'ok';
  return <figure className={styles.photo} data-status={status} data-size={size}>
    <button type="button" className={styles.photoButton} disabled={!ready} aria-haspopup="dialog" aria-label={ready ? `${label} 크게 보기` : undefined} onClick={open}>
      {/* eslint-disable-next-line @next/next/no-img-element -- 같은 출처의 원본 JPEG을 자르지 않고 그대로 보여 준다(이미지 최적화 대상 아님). */}
      <img ref={imageRef} src={src} alt={ready ? '' : label} loading="lazy" decoding="async" onLoad={() => onStatus('ok')} onError={() => onStatus('missing')} />
    </button>
    {/* 안내 문구와 버튼 줄은 사진을 기다리는 동안에도 같은 자리를 차지한다(보이지 않고 누를 수 없다). 사진이 뜨는 순간 아래 내용(버튼·출처)이 밀려 내려가 화면이 튀지 않게 하려는 것이다. */}
    {size === 'compact' && <p className={styles.photoHint} data-held={!ready || undefined} aria-hidden={!ready || undefined}>사진을 누르면 크게 볼 수 있어요</p>}
    <div className={styles.photoActions} data-held={!ready || undefined} aria-hidden={!ready || undefined}>
      <button type="button" className={styles.sceneAction} aria-haspopup="dialog" disabled={!ready} tabIndex={ready ? undefined : -1} onClick={open}>1면 크게 보기</button>
    </div>
    <dialog ref={dialogRef} className={styles.zoom} aria-label={`${label} 크게 보기`} onClose={() => setZoomed(false)}>
      {zoomed && <BirthdayNewspaperViewer src={src} label={label} fileName={`서울경제-1면-${date.replaceAll('-', '')}.jpg`} onClose={() => dialogRef.current?.close()} />}
    </dialog>
  </figure>;
}
