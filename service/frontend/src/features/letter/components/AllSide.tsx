import { AXIS_META } from '../data/letterTypes';

/** "모든 에디터" 보기의 오른쪽 안내: 모아쓰기 레터가 무엇인지(3가지 관점)를 한눈에 보여 준다. */
export function AllSide() {
  const rows: { axis: 'news' | 'substance' | 'other'; text: string }[] = [
    { axis: 'news', text: '지금 무슨 일이 있었는지' },
    { axis: 'substance', text: '왜, 어떻게 그렇게 됐는지' },
    { axis: 'other', text: '다른 관점에서는 어떻게 보이는지' },
  ];
  return (
    <section className="lt-aside-card" aria-label="모아쓰기 레터 안내">
      <h2 className="lt-aside-h">모아쓰기 레터</h2>
      <p className="lt-aside-p">같은 이슈를 다룬 서울경제 기사 여러 건을 세 가지 관점으로 엮어요.</p>
      <ul className="lt-aside-axes">
        {rows.map((r) => (
          <li key={r.axis}><i style={{ background: AXIS_META[r.axis].tone }} /><b>{AXIS_META[r.axis].label}</b><span>{r.text}</span></li>
        ))}
      </ul>
    </section>
  );
}
