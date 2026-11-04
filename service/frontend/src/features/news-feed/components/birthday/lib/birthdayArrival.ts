// 도착 페이지 — 그날 신문 카드의 QR이 여는 /birthday-market/YYYY-MM-DD. 주소의 날짜 읽기, 장면 이름, 문구.
// QR을 찍은 사람은 생일 주인이 아니라서 '내가 태어난 날' 같은 말을 쓰지 않고, 그날 신문을 먼저 보여 준 뒤 자기 생일로 이어 준다.
// 서버 라우트(app/(content)/birthday-market/[date])도 쓰므로 React 훅을 쓰는 birthdayFrontPage 를 가져오지 않는다.
import { kstTodayStr } from '@/shared/lib/date/date';
import { dateLabel, parseDate } from './birthdayModel';
import { nb } from './keepTogether';
import type { FrontPageState } from './birthdayFrontPage';

/** 주소의 날짜. 실제로 있는 날짜이고 1900-01-01부터 오늘까지면 그대로, 아니면 null(404). */
export function parseArrivalDate(value: string, today = kstTodayStr()): string | null {
  return parseDate(value, today) ? value : null;
}

/** 탭 제목과 공유 미리보기 제목. */
export const arrivalTitle = (date: string) => `${dateLabel(date)} 서울경제 — 내 생일 타임머신`;
export const ARRIVAL_DESCRIPTION = '그날 서울경제를 보고, 내 생일의 신문도 찾아보세요.';

/** 보는 사람이 생일 주인이 아닐 때의 장면 이름 — '내가 태어난 날'·'내 생일 무렵'을 '그날'·'그 무렵'으로 바꾼다. */
export function guestKicker(name: string) {
  return name.replace('내가 태어난 날', '그날').replace('내 생일 무렵', '그 무렵');
}


export const ARRIVAL_COPY = {
  kicker: '그날 서울경제',
  /** 장면 아래에서 자기 생일로 이어 주는 한 덩어리. 버튼 이름은 카드가 약속한 말과 같다. */
  question: '내 생일에는 어떤 신문이 나왔을까요?',
  action: '내 생일 신문도 찾아보기',
  /** 그 날짜의 기사를 못 찾았을 때의 제목. 이유와 다음에 할 일은 arrivalMissing이 본문에 쓴다. */
  missingTitle: '이 날의 신문은 보여 드리지 못했어요',
} as const;

/**
 * 그 날짜의 기사를 못 찾았을 때의 안내 — 없다고만 하지 않고 왜 그런지(알 때) 말한 뒤, 아래에서 내 생일의 신문을 찾도록 이어 준다.
 * 이유는 서버가 알려 준 까닭을 따른다: 일요일이면 일요일이라서, 오늘이면 아직 보관본에 안 들어와서, 나머지는 '쉬었거나 빠진 날일 수 있어요'(단정하지 않는다).
 */
export function arrivalMissing(state: FrontPageState | null) {
  const reason = state?.status === 'ok' ? state.data.reason : null;
  const why = reason === 'sunday' ? '일요일에는 서울경제가 나오지 않았어요.'
    : reason === 'not_yet' ? '오늘 신문은 아직 보관본에 들어오지 않았어요.'
    : '명절 등으로 쉬었거나 보관본에서 빠진 날일 수 있어요.';
  // 375px에서 '수 있어요.'만 마지막 줄에 남지 않도록 뒷 문장을 두 덩어리로 묶는다.
  return { title: ARRIVAL_COPY.missingTitle, body: `${why} ${nb('아래에서 내 생일의 신문을')} ${nb('찾아볼 수 있어요.')}` };
}
