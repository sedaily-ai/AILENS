import 'react-native-get-random-values';
import AsyncStorage from '@react-native-async-storage/async-storage';

// 이 기기의 익명 식별자(UUID v4). 투표가 같은 값을 쓰고 서버가 해시로 저장한다. 웹 voterId.ts 와 같은 저장 키.
// 저장소를 못 쓰면 null — 이번 실행에서는 투표를 못 한다.
const KEY = 'lens-voter-id';
let memo: string | null = null;

function uuidv4(): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export async function getVoterId(): Promise<string | null> {
  if (memo) return memo;
  try {
    let id = await AsyncStorage.getItem(KEY);
    if (!id) {
      id = uuidv4();
      await AsyncStorage.setItem(KEY, id);
    }
    memo = id;
    return id;
  } catch {
    return null;
  }
}
