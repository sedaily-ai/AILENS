import { useId, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { GROUPS } from './data/birthdayCatalog';
import { STATE_LABELS } from './data/birthdayPresentation';
import type { BirthdayResult, MarketRow } from './data/birthdayTypes';
import { comparableAnnual, number, percent } from './lib/birthdayModel';
import { changeColor } from './lib/birthdayChangeColor';
import { BirthdayQuoteDialog } from './BirthdayQuoteDialog';
import styles from './birthdayLedger.module.css';

function preview(row: MarketRow) {
  if (row.state === 'pending') return '자료 준비 중';
  if (row.state === 'unavailable') return row.before;
  if (row.id === 'history-chart') return `${row.before}–${row.after}`;
  if (row.id === 'pension-calendar' || row.id === 'million-won') return row.after;
  if (row.changeValue !== null) return percent(row.changeValue);
  return row.change === '—' || row.change === '일부 확인' ? row.after : row.change;
}

export function BirthdayLedger({ result }: { result: BirthdayResult }) {
  const id = useId();
  const [sort, setSort] = useState('group');
  const [group, setGroup] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const annual = comparableAnnual(result);
  const ranked = sort === 'annual';
  const comparedIds = new Set(ranked ? annual.map(item => item.id) : []);
  const rankedRows = ranked ? annual.map(item => ({
    ...result.rows.find(row => row.id === item.id)!,
    subtitle: `연간 ${item.title} 비교`, before: number(item.before, 2), after: number(item.after, 2),
    change: percent(item.change), changeValue: item.change, period: `${item.period} · ${item.unit}`,
    explanation: item.id === 'cpi' ? '연평균 소비자물가지수를 같은 기준(2020=100)으로 비교해요. 금액 환산이 아닌 물가지수 자체의 변화예요.' : '같은 연도의 1인당 국민총소득을 명목 달러 기준으로 비교해요. 수출액은 아직 원 통계 응답을 연결하지 않았어요.',
    detail: '상승순 정렬은 출생연도와 2025년의 연간 통계가 모두 있는 항목부터 보여드려요.',
  })) : [];
  const rows = [...rankedRows, ...result.rows.filter(row => !comparedIds.has(row.id))];
  const visible = rows.filter(row => group === null || row.group === group);
  const selected = visible.find(row => row.id === selectedId) ?? null;
  const selectedIndex = visible.findIndex(row => row.id === selectedId);

  const sections = [
    ...(ranked && annual.length ? [{ key: 'annual', title: '같은 연도 비교', description: `${result.date.year}년부터 2025년까지`, rows: visible.filter(row => comparedIds.has(row.id)) }] : []),
    ...GROUPS.map((title, index) => ({ key: String(index), title,
      description: ['신문과 시장이 기록한 하루', '그때의 돈으로 살 수 있던 것들', '한 시간의 일은 얼마였을까요', '기업과 자산이 지나온 시간', '나와 함께 자란 경제', '내는 돈과 받게 될 시점', '숫자 뒤에 남은 경제 사건'][index],
      rows: visible.filter(row => row.group === index && !comparedIds.has(row.id)),
    })),
  ].filter(section => section.rows.length);

  return <section className={styles.gallery} aria-labelledby={`${id}-heading`}>
    <div className={styles.heading}>
      <div><h4 id={`${id}-heading`}>내 생일을 둘러싼 <strong>18가지 이야기</strong></h4><p>궁금한 항목을 골라 그때와 지금을 만나보세요.</p></div>
      <div className={styles.sort}><label htmlFor={`${id}-sort`}>정렬</label><span><select id={`${id}-sort`} value={sort} onChange={event => setSort(event.target.value)}><option value="group">주제별 보기</option><option value="annual">같은 연도 상승순</option></select><ChevronDown aria-hidden="true" size={16} /></span></div>
    </div>
    <div className={styles.filters} role="group" aria-label="시세 주제 선택">
      <button type="button" aria-pressed={group === null} onClick={() => setGroup(null)}>전체 <span>{result.rows.length}</span></button>
      {GROUPS.map((name, index) => <button key={name} type="button" aria-pressed={group === index} onClick={() => setGroup(index)}>{name}<span>{result.rows.filter(row => row.group === index).length}</span></button>)}
    </div>
    <p className={styles.caption} aria-live="polite">{group === null ? '전체 18개 항목' : `${GROUPS[group]} ${visible.length}개 항목`}{ranked ? annual.length ? ` · ${result.date.year}년과 2025년의 연간 비교값부터 정렬해요.` : ' · 같은 기간의 연간 자료가 없어 주제순으로 보여드려요.' : ' · 확인된 자료부터 보여드려요.'}</p>
    <div className={styles.chapters}>
      {sections.map(section => <section key={section.key} className={styles.chapter} aria-labelledby={`${id}-${section.key}`}>
        <div className={styles.chapterHeading}><h5 id={`${id}-${section.key}`}>{section.title}<span>{section.rows.length}</span></h5><p>{section.description}</p></div>
        <div className={styles.topicList}>{section.rows.map(row => <button type="button" key={row.id} className={styles.topicButton} data-market-row={row.id} data-state={row.state}
          aria-haspopup="dialog" aria-label={`${row.title}, ${STATE_LABELS[row.state]}, 자세히 보기`} onClick={() => setSelectedId(row.id)}>
          <span className={styles.topicCopy}><strong>{row.title}</strong><span className={styles.topicDetail}><span className={styles.topicValue} style={row.changeValue !== null && row.id !== 'million-won' ? { color: changeColor(row.changeValue) } : undefined}>{preview(row)}</span>{row.change.endsWith('배') && <span className={styles.topicRatio}>당시의 {row.change}</span>}{row.id === 'million-won' && row.changeValue !== null && <span className={styles.topicRate} style={{ color: changeColor(row.changeValue) }}>{percent(row.changeValue)}</span>}{row.state === 'partial' && <small>일부 확인</small>}</span></span>
          <ChevronRight size={16} aria-hidden="true" />
        </button>)}</div>
      </section>)}
    </div>
    <p className={styles.footnote}>항목마다 기준 시점이 달라요. 상세에서 공표 시점과 출처를 확인할 수 있어요.{ranked && ' %p·순위·날짜는 등락률 순위에 섞지 않았어요.'}</p>
    <BirthdayQuoteDialog row={selected} position={selectedIndex + 1} total={visible.length} onClose={() => setSelectedId(null)}
      comparisonYears={selected && comparedIds.has(selected.id) ? [result.date.year, 2025] : undefined}
      onPrevious={selectedIndex > 0 ? () => setSelectedId(visible[selectedIndex - 1].id) : undefined}
      onNext={selectedIndex >= 0 && selectedIndex < visible.length - 1 ? () => setSelectedId(visible[selectedIndex + 1].id) : undefined} />
  </section>;
}
