/**
 * 사주 해석 엔진 — 데이터 + 순수 계산 로직
 * DOM 의존 없음
 *
 * 2026-09-04 — 리팩토링 감사로 발견: 이 파일 1298줄 중 실사용은
 * `calculateSaju`/`CG_OH` 딱 2개뿐(유일한 소비자 widgets/HomeSideBar/
 * SajuMiniRail.tsx)이었고, 나머지 ~1200줄(대운·연운·월운·신살·격국·
 * 용신 등)은 어디서도 import 안 되는 도달 불가 코드였다 — `4_saju` 앱에서
 * 통째로 포팅해온 것으로 보임. 실사용 2개만 남기고 정리(계산 로직은
 * `calculateSaju` 자체가 `@fullstackfamily/manseryeok` 패키지 함수라
 * 이 파일에 남길 게 없었다).
 */
import { calculateSaju } from '@fullstackfamily/manseryeok';

export const CG_OH: Record<string, string> = {'甲':'목','乙':'목','丙':'화','丁':'화','戊':'토','己':'토','庚':'금','辛':'금','壬':'수','癸':'수'};

export { calculateSaju };
