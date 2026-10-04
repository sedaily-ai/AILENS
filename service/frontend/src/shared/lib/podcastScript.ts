// 팟캐스트 대본 문단 정리(2026-10-03) — 파이프라인이 만든 음성 원고(transcript)를 플레이어 대본 패널용 문단 배열로 바꾼다.
// 원고에는 마크다운 흔적이 섞여 있다("## 한 가지만 기억한다면" 제목 표시, 문단 끝 "--" 구분선 등). 화면에는 읽는 글만 보이게 걷어낸다.
// 순수 함수(서버·클라이언트 공용). 문단은 빈 줄 기준이고, 내용이 없는 줄은 버린다.
export function podcastScriptParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((p) =>
      p
        .split('\n')
        .map((line) => line.replace(/^\s*#{1,6}\s*/, '').replace(/\*\*|__/g, '').trim())
        .filter((line) => line && !/^[-–—*_]{2,}$/.test(line))
        .join('\n')
        .replace(/\s*[-–—]{2,}\s*$/, '')
        .trim(),
    )
    .filter(Boolean);
}
