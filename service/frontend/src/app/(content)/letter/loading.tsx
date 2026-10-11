// 레터 목록·상세로 이동하는 동안 푸터만 위로 끌려 올라와 비치는 것을 막는 높이만 잡는다(스켈레톤 아님). paper/loading.tsx 와 같은 방식.
export default function LetterLoading() {
  return <div aria-hidden style={{ minHeight: '100vh' }} />;
}
