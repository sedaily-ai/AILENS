'use client';
import type { FormatPreferenceData } from '../lib/dashboardApi';
const NAMES={letter:'읽기',webtoon:'웹툰',podcast:'듣기',video:'영상'};
export function FormatPreference({data,loading,onRetry}:{data:FormatPreferenceData|null|undefined;loading:boolean;onRetry:()=>void}){
 return <section className="ml-format-preference" aria-labelledby="ml-format-title" aria-busy={loading}>
  <div className="ml-section-title"><div><h2 id="ml-format-title">내가 자주 고른 시선</h2><p className="ml-helper">최근 90일, 뉴스를 만난 방식</p></div>{data?.preferred_format&&<span className="ml-topic">가장 자주 이용한 형식 · {NAMES[data.preferred_format]}</span>}</div>
  {loading?<p className="ml-loading" role="status">이용 형식을 살펴보고 있어요.</p>:!data?<p role="alert" className="ml-helper">형식 기록을 불러오지 못했어요. <button type="button" onClick={onRetry}>다시 불러오기</button></p>:<>
   <ol className="ml-format-distribution">{data.distribution.map(row=><li key={row.format}><div><strong>{NAMES[row.format]}</strong><span>{row.rank?`${row.rank}위`:'기록 수집 중'}</span></div><div className="ml-format-track" aria-hidden><i style={{width:`${Math.round(row.share*100)}%`}}/></div><p>{row.viewed_contents}편 이용 · {row.completed_contents}편 완료 <span>{Math.round(row.share*100)}%</span></p></li>)}</ol>
   <p className="ml-helper">{data.status==='insufficient_data'?`서로 다른 뉴스 ${data.minimum_contents}편부터 선호를 분석해요. 현재 ${data.qualified_contents}편의 기록이 있어요.`:data.preferred_format?'관심이 맞는 추천과 알림에서, 실제 제공되는 이용 형식을 함께 반영해요.':'가장 많이 이용한 형식이 동률이에요. 이용이 이어지면 변화가 보여요.'}</p>
   <details className="ml-format-method"><summary>분석 기준 보기</summary><p>형식별 유효 열람 1점, 완료 3점으로 계산해요. 같은 뉴스·형식의 반복 이용은 한 번만 반영하고, 웹툰은 실제 컷 노출, 듣기·영상은 재생 기록을 확인해요. 읽기만 제공하는 이슈 레터는 네 형식의 비교에서 제외해요. 비율은 이용 기록의 가중치이며 취향을 확정하는 값은 아니에요.</p></details>
  </>}
 </section>;
}
