export const onboardingCopy = {
  welcome: {
    line1: '안녕하세요.',
    line2: '오늘, 당신의 뉴스를 만나러 왔어요.',
    cta: '시작하기',
  },
  motivation: {
    headline: '나는, 매일 뉴스를 ____',
    sub: '마음 가는 대로 한 가지만. 정답은 없어요.',
  },
  context: {
    headline: '주로 언제 저를 찾으실까요?',
    sub: '그 시간을 기억해둘게요.',
  },
  result: {
    headline: (editorName: string) => `당신과 같이 살아갈 사람은 — ${editorName}예요.`,
    sub: '다른 사람도 만나보고 싶다면',
    galleryLink: '12명 모두 보기 →',
    cta: '이 사람의 첫 한 통 보기',
  },
  letter: {
    headline: '이 사람이 오늘 보낸 첫 한 통이에요.',
    deliveryNote: (hint: string) => `매일 ${hint}, 이 자리에 새 한 통이 와요.`,
    cta: '더 많은 이야기 보러가기',
    toast: '라이브러리로 모실게요.',
  },
};
