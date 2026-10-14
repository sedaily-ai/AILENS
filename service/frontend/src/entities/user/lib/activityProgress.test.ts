import { describe,it,expect } from 'vitest';
import { mergeConsumedRanges,playbackRange } from './activityProgress';
describe('완료용 실제 재생 구간',()=>{
 it('겹친 재생을 한 번만 세며 seek로 생긴 빈 구간은 보존한다',()=>{
  expect(mergeConsumedRanges([[20,25],[0,10],[5,15],[25,30]])).toEqual([[0,15],[20,30]]);
 });
 it('사용자 조작 없는 자동 재생·숨김 이후 점프·seek·일시정지는 세지 않는다',()=>{
  expect(playbackRange(1,2,1000,100,true,false,false)).toBeNull();
  expect(playbackRange(1,30,1000,100,true,true,false)).toBeNull();
  expect(playbackRange(1,2,1000,100,true,true,true)).toBeNull();
  expect(playbackRange(1,2,1000,100,false,true,false)).toBeNull();
  expect(playbackRange(1,3,1000,100,true,true,false)).toEqual([1,3]);
 });
});
