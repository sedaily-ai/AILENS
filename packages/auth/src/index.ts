// @ailens/auth — 공유 인증(Cognito idToken Bearer 계약).
// authFetch 로직 공유, idToken 공급은 AuthProvider 주입(웹=Amplify, 앱=Amplify RN).
// 상대 import 는 .js 확장자 명시(Node ESM 런타임용). 참고: docs/architecture/auth-env-공유설계-Amplify.md
export * from './authFetch.js';
