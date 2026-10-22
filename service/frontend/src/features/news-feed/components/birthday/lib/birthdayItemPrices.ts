// '그때 1억 원' 장면의 생활 물가 품목 배수. 값은 수집 스크립트(service/backend/scripts/build_birthday_item_prices.py)가
// KOSIS(국가데이터처 소비자물가지수 품목별, 서울)에서 받은 data/birthdayItemPrices.json에서만 읽고 손으로 고치지 않는다.
// 파일은 번들에 들어 있어 새 요청이 없고, 계산은 이 기기에서 한다. 원 단위 가격은 쓰지 않는다(배수만).
import raw from '../data/birthdayItemPrices.json';
import { CPI_LATEST, CPI_MONTHLY } from '../data/birthdayCatalog';
import { changeOf } from './birthdayAssets';
import { times } from './birthdayModel';

export interface ItemPriceFile {
  source: string; table: string; region: string;
  /** 지금 달(YYYY-MM). 1억 원 장면의 CPI_LATEST.period와 같아야 한다. */
  now: string;
  /** 화면 순서. annual은 12달이 모두 있는 해의 연평균, monthly는 CPI_MONTHLY 달의 월값. */
  items: { id: string; name: string; code: string; from: string; latest: number; annual: Partial<Record<string, number>>; monthly: Partial<Record<string, number>> }[];
}

export const ITEM_PRICES: ItemPriceFile = raw;

export interface ItemMultiple { id: string; name: string; multiple: number }

/**
 * 1억 원 장면과 같은 기간의 품목 배수 — 그때는 cpiAt과 같은 규칙(CPI_MONTHLY에 있는 달은 그달 값, 아니면 태어난 해 연평균),
 * 지금은 CPI_LATEST 달. 그때 값이 없는 품목은 뺀다(지하철 1980년 전, 김치찌개백반 1985년 전, 1975년 전은 모두 없음).
 * 자료의 지금 달이 CPI_LATEST와 다르면 한 장면에 기준이 둘이 되므로 목록을 만들지 않는다.
 */
export function itemMultiples(birthDate: string, data: ItemPriceFile = ITEM_PRICES): ItemMultiple[] {
  if (data.now !== CPI_LATEST.period) return [];
  const month = birthDate.slice(0, 7);
  const monthly = CPI_MONTHLY[month] !== undefined;
  return data.items.flatMap(item => {
    const then = monthly ? item.monthly[month] : item.annual[birthDate.slice(0, 4)];
    return then ? [{ id: item.id, name: item.name, multiple: item.latest / then }] : [];
  });
}

/**
 * 줄의 배수 표기 — 보통은 '5.7배'. 1배 이하이거나 1배로 반올림되면 색 없이 읽히게 화살표(낭독 제외)와 부호를 함께 쓴다
 * ('0.9배(−8%)'·'1배(+3%)', 자산 칸의 changeOf와 같은 표기).
 */
export function itemValue(multiple: number): { arrow: '▲' | '▼' | ''; text: string } {
  if (multiple > 1 && times(multiple) !== times(1)) return { arrow: '', text: times(multiple) };
  const change = changeOf(multiple);
  return { arrow: change.arrow, text: `${times(multiple)}(${change.signed})` };
}
