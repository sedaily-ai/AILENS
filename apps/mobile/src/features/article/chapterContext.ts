import { createContext, useContext } from 'react';
import type { View } from 'react-native';

/** 레터 본문의 소제목(챕터) 위치 등록소 — 목차에서 눌렀을 때 그 소제목으로 스크롤한다. 순환 import 를 피하려고 별도 파일에 둔다. */
export const ChapterContext = createContext<{ register: (no: number, node: View | null) => void } | null>(null);
export const useChapterRegister = () => useContext(ChapterContext);
