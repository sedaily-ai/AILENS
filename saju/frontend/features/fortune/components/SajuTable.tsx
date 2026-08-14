import { sipsung, unsung, elClass, CG_OH, JJG, type Pillar } from '../lib/engine';
import { useLang } from '@saju/shared/lib/LangContext';

const EL_COLORS: Record<string, string> = {
  '목': 'text-emerald-400', '화': 'text-red-600', '토': 'text-yellow-500',
  '금': 'text-gray-400', '수': 'text-gray-900',
};

/** 셀 배경 + 텍스트 — 한눈에 오행 구분 */
const EL_CELL: Record<string, string> = {
  '목': 'bg-[#34D399] text-white',
  '화': 'bg-[#FD0002] text-white',
  '토': 'bg-[#EDCE01] text-gray-900',
  '금': 'bg-[#EAEAEA] text-gray-700',
  '수': 'bg-[#000000] text-white',
};

function ElSpan({ oh, children }: { oh: string; children: React.ReactNode }) {
  return <span className={`font-bold ${EL_COLORS[oh] || 'text-gray-800'}`}>{children}</span>;
}

interface Props { pillars: Pillar[]; ilgan: string; }

export function SajuTable({ pillars, ilgan }: Props) {
  const { t } = useLang();
  const headers = [t('생시', 'Hour'), t('생일', 'Day'), t('생월', 'Month'), t('생년', 'Year')];
  return (
    <div className="overflow-x-auto mt-8 mb-6">
      <table className="w-full border-separate border-spacing-x-1.5 border-spacing-y-0 text-center text-[13px]">
        <thead>
          <tr>
            <th className="p-2 text-[11px] text-gray-400 font-medium w-[52px]"></th>
            {headers.map(h => <th key={h} className="p-2 text-[11px] text-gray-400 font-medium">{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {/* 천간 — 오행별 배경색 블록 */}
          <tr>
            <td className="p-2 text-[11px] text-gray-400">{t('천간', 'Stem')}</td>
            {pillars.map((p, i) => (
              <td key={i} className={`py-5 px-3 rounded-lg ${p.c ? EL_CELL[p.co] || '' : ''}`}>
                {p.c ? <span className="text-[24px] font-bold">{p.ck}{p.c}</span> : <span className="text-gray-300">—</span>}
              </td>
            ))}
          </tr>
          {/* 천간 십성 */}
          <tr>
            <td className="p-2 text-[11px] text-gray-400">{t('십성', 'God')}</td>
            {pillars.map((p, i) => <td key={i} className="p-2 text-[12px] text-gray-500">{p.c ? sipsung(ilgan, p.c) : ''}</td>)}
          </tr>
          {/* 지지 — 오행별 배경색 블록 */}
          <tr>
            <td className="p-2 text-[11px] text-gray-400">{t('지지', 'Branch')}</td>
            {pillars.map((p, i) => (
              <td key={i} className={`py-5 px-3 rounded-lg ${p.j ? EL_CELL[p.jo] || '' : ''}`}>
                {p.j ? <span className="text-[24px] font-bold">{p.jk}{p.j}</span> : <span className="text-gray-300">—</span>}
              </td>
            ))}
          </tr>
          {/* 지지 십성 */}
          <tr>
            <td className="p-2 text-[11px] text-gray-400">{t('십성', 'God')}</td>
            {pillars.map((p, i) => {
              const g = p.j && JJG[p.j];
              return <td key={i} className="p-2 text-[12px] text-gray-500">{g ? sipsung(ilgan, g[g.length - 1]) : ''}</td>;
            })}
          </tr>
          {/* 지장간 */}
          <tr>
            <td className="p-2 text-[11px] text-gray-400">{t('지장간', 'Hidden')}</td>
            {pillars.map((p, i) => {
              const g = p.j && JJG[p.j];
              return (
                <td key={i} className="p-2">
                  {g ? (
                    <div className="flex justify-center gap-1">
                      {g.map((s, si) => <span key={si} className={`text-[12px] ${EL_COLORS[CG_OH[s]] || ''}`}>{s}</span>)}
                    </div>
                  ) : null}
                </td>
              );
            })}
          </tr>
          {/* 12운성 */}
          <tr>
            <td className="p-2 text-[11px] text-gray-400">{t('12운성', 'Stage')}</td>
            {pillars.map((p, i) => <td key={i} className="p-2 text-[12px] text-gray-600">{unsung(ilgan, p.j)}</td>)}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
