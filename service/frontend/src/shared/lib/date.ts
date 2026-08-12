// 공용 날짜 유틸 — features/timeline과 features/news-feed 양쪽이 "오늘"을
// 같은 방식으로 계산해야 해서 shared로 뺐다(2026-08-12, features 간 lateral
// import 금지 원칙 — boundaries 규칙 참조). 처음엔 features/timeline 안에
// 있었다.
export function kstTodayStr(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
}
