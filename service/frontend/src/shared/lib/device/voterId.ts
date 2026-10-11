// 이 기기의 익명 식별자(브라우저에 저장된 UUID). 투표와 관심 설정이 같은 값을 쓰고, 서버가 용도별로 다른 해시로 저장해 서로 이어지지 않는다.
// features/letter/lib/deviceId.ts 와 같은 저장 키를 쓴다(같은 사람이 모아쓰기 레터와 1기사 레터에서 같은 기기로 인식되도록).
const KEY = 'lens-voter-id';

export function getVoterId(): string | null {
  try {
    let id = window.localStorage.getItem(KEY);
    if (!id) {
      id = crypto.randomUUID();
      window.localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    return null; // 저장소를 못 쓰면(사생활 보호 모드 등) 이번 방문에서는 투표를 못 한다
  }
}
