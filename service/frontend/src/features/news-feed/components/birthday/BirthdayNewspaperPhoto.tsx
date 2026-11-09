'use client';

import { useEffect, useRef, useState } from 'react';
import { dateLabel } from './lib/birthdayModel';
import { newspaperImageUrl, newspaperPreviewUrl } from './lib/birthdayNewspaper';
import type { PhotoState } from './lib/birthdayNewspaperView';
import { BirthdayNewspaperViewer } from './BirthdayNewspaperViewer';
import styles from './birthdayStory.module.css';

/**
 * 그날 서울경제 1면 사진(축소 미리보기를 먼저 불러온다). 사진을 누르면 크게 볼 수 있고, 사진 아래 안내 문구가 그렇게 알려 준다(따로 버튼은 없다).
 * 사진이 뜨기 전에는 가로세로 비율대로 자리를 잡아 화면이 튀지 않게 하고, 못 찾으면(없음·네트워크 문제 구분 불가) 자리를 비운다.
 * 크게 보기는 기존 모달과 같은 네이티브 <dialog>(showModal)다. 안쪽(전체 맞춤·확대·원본 받기)은 BirthdayNewspaperViewer가 맡고,
 * 여기서는 열고 닫기만 한다. Esc나 닫기 버튼으로 닫으며, 닫으면 눌렀던 사진 버튼으로 포커스가 돌아온다.
 * onStatus는 같은 날짜에서 바뀌지 않는 함수여야 한다(바뀔 때마다 현재 사진 상태를 다시 알린다). 날짜가 바뀌면 호출하는 쪽이 key로 처음부터 다시 시작한다.
 */
export function BirthdayNewspaperPhoto({ date, status, size = 'full', onStatus }: {
  date: string; status: PhotoState; size?: 'compact' | 'full'; onStatus: (status: 'ok' | 'missing') => void;
}) {
  const imageRef = useRef<HTMLImageElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [zoomed, setZoomed] = useState(false);
  const [useOriginal, setUseOriginal] = useState(false);
  const src = newspaperImageUrl(date);
  const preview = useOriginal ? src : newspaperPreviewUrl(date);
  const label = `${dateLabel(date)} 서울경제 1면`;
  const open = () => { setZoomed(true); dialogRef.current?.showModal(); };

  // 이벤트보다 먼저 끝난 요청(캐시)도 결과를 알린다.
  useEffect(() => {
    const image = imageRef.current;
    if (image?.complete && image.naturalWidth > 0) onStatus('ok');
    else if (image?.complete && useOriginal) onStatus('missing');
  }, [onStatus, useOriginal]);

  if (status === 'missing') return null;
  // 사진을 불러온 뒤에는 사진을 눌러 크게 볼 수 있다. 키보드는 사진 버튼에 Tab으로 가서 Enter로 연다. <img>는 항상 같은 버튼 안, 같은 자리에 둔다 —
  // 상태에 따라 <img>를 다른 부모로 옮기면 요소가 다시 만들어져 사진이 깜박이고 onLoad가 되풀이된다.
  // 사진을 불러오는 동안에는 열 게 없어 disabled다. 그 몇 초 동안은 안내 문구도 보이지 않으므로 누를 수 있는 척하지 않는 것이 일관된다.
  const ready = status === 'ok';
  return <figure className={styles.photo} data-status={status} data-size={size}>
    <button type="button" className={styles.photoButton} disabled={!ready} aria-haspopup="dialog" aria-label={ready ? `${label} 크게 보기` : undefined} onClick={open}>
      {/* eslint-disable-next-line @next/next/no-img-element -- 축소 미리보기를 쓰고 오류면 원본으로 대체한다. */}
      <img ref={imageRef} src={preview} alt={ready ? '' : label} loading="lazy" decoding="async" onLoad={() => onStatus('ok')} onError={() => { if (useOriginal) onStatus('missing'); else setUseOriginal(true); }} />
    </button>
    {/* 안내 문구는 사진을 기다리는 동안에도 같은 자리를 차지한다(보이지 않는다). 사진이 뜨는 순간 아래 내용(링크·출처)이 밀려 내려가 화면이 튀지 않게 하려는 것이다. */}
    <p className={styles.photoHint} data-held={!ready || undefined} aria-hidden={!ready || undefined}>사진을 누르면 크게 볼 수 있어요</p>
    <dialog ref={dialogRef} className={styles.zoom} aria-label={`${label} 크게 보기`} onClose={() => setZoomed(false)}>
      {zoomed && <BirthdayNewspaperViewer src={src} label={label} fileName={`서울경제-1면-${date.replaceAll('-', '')}.jpg`} onClose={() => dialogRef.current?.close()} />}
    </dialog>
  </figure>;
}
