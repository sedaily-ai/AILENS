/** 실제 재생으로 관찰한 구간만 합친다. seek 위치는 구간으로 만들지 않는다. */
export function mergeConsumedRanges(ranges: [number,number][]): [number,number][] {
  const merged: [number,number][]=[];
  for(const [start,end] of [...ranges].sort((a,b)=>a[0]-b[0])){
    const last=merged.at(-1);
    if(last&&start<=last[1]+0.05)last[1]=Math.max(last[1],end);
    else merged.push([start,end]);
  }
  return merged;
}
export function bodyScrollRatio(elements: HTMLElement[], viewportHeight: number):number{
  if(!elements.length)return 0;
  const first=elements[0].getBoundingClientRect(),last=elements.at(-1)!.getBoundingClientRect();
  const height=last.bottom-first.top;
  return height>0?Math.min(1,Math.max(0,(viewportHeight-first.top)/height)):0;
}
export function playbackRange(previous:number|undefined,current:number,elapsedMs:number,duration:number,playing:boolean,initiated:boolean,seeking:boolean):[number,number]|null{
  if(previous===undefined||!playing||!initiated||seeking||!Number.isFinite(current)||!Number.isFinite(previous))return null;
  const delta=current-previous;
  return delta>0&&delta<=elapsedMs/1000*2+0.25&&previous>=0&&current<=duration?[previous,current]:null;
}
