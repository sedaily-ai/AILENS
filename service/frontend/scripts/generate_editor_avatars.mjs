// 이미지가 없는 에디터 4명의 손그림풍 프로필(SVG) 생성 — DiceBear "Notionists"(Zoish, CC0 공개 도메인이라 표기 의무 없음).
// 이전 서비스(legacy/dev_v1 editorsData.ts)도 같은 스타일을 외부 주소로 불러 쓰던 것을, 외부 호출 없이 파일로 만들어 public/editors 에 둔다.
// 사용: 임시 폴더에서 `npm i @dicebear/core @dicebear/collection` 후 이 파일의 OUT 경로를 맞춰 실행(레포 의존성에는 넣지 않는다).
// 실제 일러스트가 준비되면 파일만 교체하고 editors.ts 의 image 경로를 바꾼다.
import { createAvatar } from '@dicebear/core';
import { notionists } from '@dicebear/collection';
import fs from 'fs';

const OUT = new URL('../public/editors/', import.meta.url).pathname;
const picks = { jihoon: ['jihoon-e', 'efe9ff'], seoyeon: ['seoyeon-a', 'e7eefc'], yerin: ['yerin-e', 'fde8ee'], siu: ['siu-e', 'e5f5ea'] };
for (const [id, [seed, bg]] of Object.entries(picks)) {
  fs.writeFileSync(`${OUT}${id}.svg`, createAvatar(notionists, { seed, backgroundColor: [bg], radius: 0, size: 240 }).toString());
}
