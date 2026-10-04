import React from 'react';

// 컷 어디서든 읽는 영상 공통 메타(키워드 라벨·기준 시점). NewsVideo가 채운다.
export const ScriptMetaContext = React.createContext<{ keyword?: string; asOfDate?: string }>({});
