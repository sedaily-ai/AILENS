import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ASSET_SOURCE_INFO } from './data/birthdayAssets';
import type { BirthdayResult, ViewMode } from './data/birthdayTypes';
import { assetBase, assetCells, assetInflation, assetsAvailable, ecosOrgs } from './lib/birthdayAssets';
import { shareableFront, useFrontPage } from './lib/birthdayFrontPage';
import type { ShareVariant } from './lib/birthdayShare';
import { useBirthdayAssets } from './lib/useBirthdayAssets';
import { AgesScene, ArrivalScene, AssetScene, MoneyScene, WageScene } from './BirthdayScenes';
import { BirthdayFrontPage } from './BirthdayFrontPage';
import { BirthdayPension } from './BirthdayPension';
import { BirthdayShare } from './BirthdayShare';
import { nb } from './lib/keepTogether';
import styles from './birthdayStory.module.css';

/**
 * 결과 — 한 장면에 숫자 하나. 순서: 도착 → 100만 원 → 그날 1면 → 최저시급 → 1억 원
 * → 그때 나는 몇 살 → 연금 달력 → 공유(생일 카드). 공유는 화면 폭과 관계없이 맨 아래에 둔다.
 */
export function BirthdayResults({ result, mode, onEdit }: { result: BirthdayResult; mode: ViewMode; onEdit: () => void }) {
  // 100만 원 칸 — 기준일 연도 파일과 latest.json만 받아 이 기기에서 계산한다(기준일이 1964-05-04보다 앞서면 요청하지 않는다).
  const base = useMemo(() => assetBase(result.date), [result.date]);
  const assetLoad = useBirthdayAssets(assetsAvailable(base) ? Number(base.date.slice(0, 4)) : null);
  // ready 상태는 훅이 저장한 같은 객체라 의존성으로 쓸 수 있다.
  const assetsReady = assetLoad.state.status === 'ready' ? assetLoad.state : null;
  const cells = useMemo(() => assetsReady ? assetCells(base, assetsReady.file, assetsReady.latest) : [], [base, assetsReady]);
  // 물가 줄은 칸이 하나라도 있을 때만 장면에 보인다(칸이 0개면 안내 한 줄뿐).
  const inflation = useMemo(() => assetsReady && cells.length ? assetInflation(base, assetsReady.file, assetsReady.latest) : null, [base, assetsReady, cells.length]);
  const front = useFrontPage(mode === 'year' ? null : result.birthDate);
  // 공유 카드에는 생일 당일 1면만 넣는다. 대체한 신문이나 그날 기사를 "내가 태어난 날 1면"으로 찍지 않는다.
  const frontArticles = useMemo(() => shareableFront(front.state), [front.state]);
  const [variant, setVariant] = useState<ShareVariant>('receipt');

  function shareFront() {
    setVariant('front');
    const target = document.getElementById('birthday-share');
    target?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  }

  return <div className={styles.story}>
    <div className={styles.scenes}>
      <ArrivalScene result={result} mode={mode} />
      <AssetScene base={base} mode={mode} state={assetLoad.state} cells={cells} inflation={inflation} onRetry={assetLoad.retry} />
      <BirthdayFrontPage state={front.state} birthDate={result.birthDate} onRetry={front.retry} onUseBirthday={onEdit} onShare={shareFront} />
      <WageScene result={result} />
      <MoneyScene result={result} />
      <AgesScene result={result} mode={mode} />
      <BirthdayPension result={result} mode={mode} />
      {/* 고지 세 가지(참고 정보·상담 아님·기준 시점)는 그대로 두고, '-이며'로 길게 잇던 첫 문장과 명사로 끝나던 출처 줄을 문장으로 풀었다.
          성격별로 세 줄(고지 / 기준 시점·오류 알리기 / 출처·확인일)로 끊는다(.notice > span). */}
      <p className={styles.notice}>
        <span>공개 자료로 계산한 참고 정보예요. 투자 권유나 재무·연금 상담이 아니에요.</span>{' '}
        {/* '잘못된 내용 알리기'는 출처 줄 끝에 두면 560px 폭에서 넘쳐 4줄이 돼서, '실제와 다를 수 있어요' 바로 뒤에 둔다. */}
        <span>자료의 기준 시점에 따라 실제와 {nb('다를 수 있어요')}. <Link href="/contact" prefetch={false}>{nb('잘못된 내용 알리기')}</Link></span>{' '}
        {/* ECOS는 제공처라 통계를 만든 기관(작성기관)을 함께 적는다. 국가데이터처는 물가(1억 원 장면·물가 줄)를 보일 때 한 번만,
            한국부동산원은 아파트 칸, 세계은행 Pink Sheet는 금 칸이 보일 때만(CC BY 4.0이라 라이선스 이름도 적는다). */}
        <span>{`출처는 최저임금위원회·${nb('한국은행 ECOS')}(${ecosOrgs(cells, Boolean(result.cpi) || inflation !== null).join('·')} 작성)·국민연금공단·빅카인즈${cells.some(cell => cell.id === 'gold') ? `·${nb(`${ASSET_SOURCE_INFO.gold.org} ${ASSET_SOURCE_INFO.gold.dataset}`)}` : ''}이고 ${result.snapshot.retrievedAt.replaceAll('-', '.')}에 ${nb('확인했어요.')}`}</span>
      </p>
    </div>
    <BirthdayShare result={result} mode={mode} assets={cells} assetBase={cells.length ? base : null} front={frontArticles} variant={variant} onVariant={setVariant} onTryFriend={onEdit} />
  </div>;
}
