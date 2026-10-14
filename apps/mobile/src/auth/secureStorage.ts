import * as SecureStore from 'expo-secure-store';
import type { KeyValueStorageInterface } from 'aws-amplify/utils';

// SecureStore 키는 [A-Za-z0-9._-] 만 허용한다. Amplify 키에 다른 문자가 섞여도 깨지지 않게 치환한다.
const safe = (key: string) => key.replace(/[^A-Za-z0-9._-]/g, '_');

/**
 * Amplify 토큰 저장소 — OS 보안 저장소(iOS Keychain / Android Keystore)에 둔다.
 * 기본 저장소(AsyncStorage)는 평문이라 refresh token 보관에 쓰지 않는다.
 */
export const secureStorage: KeyValueStorageInterface = {
  async setItem(key, value) {
    await SecureStore.setItemAsync(safe(key), value);
  },
  async getItem(key) {
    return SecureStore.getItemAsync(safe(key));
  },
  async removeItem(key) {
    await SecureStore.deleteItemAsync(safe(key));
  },
  // 전체 삭제는 Amplify 가 로그아웃 시 개별 removeItem 으로 처리하므로 비워 둔다(SecureStore 는 키 열거 불가).
  async clear() {},
};
