// 지난 지면 로딩 중— 데이터가 오기 전 빈 화면 아래로 푸터가 끌려 올라와 비치는 것을 막는 높이만 잡는다(스켈레톤 아님).
export default function PaperLoading() {
  return <div aria-hidden style={{ minHeight: '100vh' }} />;
}
