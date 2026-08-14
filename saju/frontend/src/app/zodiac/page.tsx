'use client';

import { useState } from 'react';
import { useLang } from '@saju/shared/lib/LangContext';
import { PageShell } from '@saju/shared/ui/PageShell';
import { PageHeader } from '@saju/shared/ui/PageHeader';
import { BottomNav } from '@saju/shared/ui/BottomNav';

interface ZodiacEntry {
  id: string;
  emoji: string;
  ko: string;
  en: string;
  years: string;
}

const ZODIAC_ANIMALS: ZodiacEntry[] = [
  { id: 'rat',     emoji: '🐀', ko: '쥐띠',   en: 'Rat',     years: '1960, 1972, 1984, 1996, 2008, 2020' },
  { id: 'ox',      emoji: '🐂', ko: '소띠',   en: 'Ox',      years: '1961, 1973, 1985, 1997, 2009, 2021' },
  { id: 'tiger',   emoji: '🐅', ko: '호랑이띠', en: 'Tiger',   years: '1962, 1974, 1986, 1998, 2010, 2022' },
  { id: 'rabbit',  emoji: '🐇', ko: '토끼띠',  en: 'Rabbit',  years: '1963, 1975, 1987, 1999, 2011, 2023' },
  { id: 'dragon',  emoji: '🐉', ko: '용띠',   en: 'Dragon',  years: '1964, 1976, 1988, 2000, 2012, 2024' },
  { id: 'snake',   emoji: '🐍', ko: '뱀띠',   en: 'Snake',   years: '1965, 1977, 1989, 2001, 2013, 2025' },
  { id: 'horse',   emoji: '🐎', ko: '말띠',   en: 'Horse',   years: '1966, 1978, 1990, 2002, 2014, 2026' },
  { id: 'goat',    emoji: '🐐', ko: '양띠',   en: 'Goat',    years: '1967, 1979, 1991, 2003, 2015, 2027' },
  { id: 'monkey',  emoji: '🐒', ko: '원숭이띠', en: 'Monkey',  years: '1968, 1980, 1992, 2004, 2016, 2028' },
  { id: 'rooster', emoji: '🐓', ko: '닭띠',   en: 'Rooster', years: '1969, 1981, 1993, 2005, 2017, 2029' },
  { id: 'dog',     emoji: '🐕', ko: '개띠',   en: 'Dog',     years: '1970, 1982, 1994, 2006, 2018, 2030' },
  { id: 'pig',     emoji: '🐖', ko: '돼지띠',  en: 'Pig',     years: '1971, 1983, 1995, 2007, 2019, 2031' },
];

const MOCK_FORTUNES: Record<string, { ko: string; en: string }> = {
  rat:     { ko: '오늘은 새로운 기회가 찾아오는 날입니다. 주변 사람들과의 대화에서 뜻밖의 정보를 얻을 수 있어요. 재물운이 좋으니 소소한 투자도 괜찮습니다.', en: 'New opportunities arise today. Unexpected information may come from conversations with those around you. Financial luck is good, so small investments are fine.' },
  ox:      { ko: '꾸준히 해오던 일이 결실을 맺는 시기입니다. 인내심이 보상받는 하루가 될 것이며, 건강 관리에도 신경 쓰세요.', en: 'A time when your steady efforts bear fruit. Patience will be rewarded today. Pay attention to health management.' },
  tiger:   { ko: '활동적인 에너지가 넘치는 날입니다. 새로운 도전을 시작하기에 좋은 시기이며, 리더십을 발휘할 기회가 옵니다.', en: 'A day full of active energy. A good time to start new challenges, and opportunities to show leadership will come.' },
  rabbit:  { ko: '대인 관계에서 좋은 소식이 있을 수 있습니다. 부드러운 태도가 행운을 부르며, 예술적 감각이 빛나는 하루입니다.', en: 'Good news may come in relationships. A gentle attitude brings luck, and your artistic sense shines today.' },
  dragon:  { ko: '큰 그림을 그리기 좋은 날입니다. 장기적인 계획을 세우면 좋은 결과가 따르며, 자신감을 가지세요.', en: 'A good day to think big. Long-term plans will yield good results. Have confidence in yourself.' },
  snake:   { ko: '직관이 예리해지는 날입니다. 복잡한 문제의 해답을 찾을 수 있으며, 조용한 시간이 지혜를 가져다 줍니다.', en: 'Your intuition sharpens today. You may find answers to complex problems. Quiet time brings wisdom.' },
  horse:   { ko: '자유로운 에너지가 흐르는 날입니다. 여행이나 외출이 길하며, 새로운 사람과의 만남이 행운을 가져옵니다.', en: 'Free energy flows today. Travel or outings are auspicious, and meeting new people brings luck.' },
  goat:    { ko: '창의적인 영감이 넘치는 날입니다. 예술 활동이나 취미에 집중하면 큰 만족을 얻으며, 가족과의 시간이 소중합니다.', en: 'A day overflowing with creative inspiration. Focusing on art or hobbies brings satisfaction. Family time is precious.' },
  monkey:  { ko: '재치와 유머가 빛나는 날입니다. 문제 해결 능력이 뛰어나며, 유연한 대처가 성공의 열쇠가 됩니다.', en: 'Your wit and humor shine today. Problem-solving skills are excellent, and flexibility is the key to success.' },
  rooster: { ko: '세밀한 관찰력이 빛을 발하는 날입니다. 정리 정돈이나 계획 수립에 최적이며, 성실함이 인정받습니다.', en: 'Your keen observation shines today. Ideal for organizing or planning. Your diligence is recognized.' },
  dog:     { ko: '신뢰와 의리가 보상받는 날입니다. 주변 사람들에게 도움을 주면 배로 돌아오며, 정직함이 길을 엽니다.', en: 'Trust and loyalty are rewarded today. Helping others returns double. Honesty opens doors.' },
  pig:     { ko: '풍요와 여유가 가득한 날입니다. 맛있는 음식이나 좋은 사람들과의 시간이 행복을 가져다 줍니다.', en: 'A day full of abundance and leisure. Good food or time with loved ones brings happiness.' },
};

function formatToday(lang: 'ko' | 'en'): string {
  const d = new Date();
  return lang === 'en'
    ? d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
}

export default function ZodiacPage() {
  const { t, lang } = useLang();
  const [selected, setSelected] = useState<string | null>(null);

  const selectedAnimal = ZODIAC_ANIMALS.find(a => a.id === selected);
  const fortune = selected ? MOCK_FORTUNES[selected] : null;

  return (
    <PageShell hanjaRight="寅" hanjaLeft="獸">
      <PageHeader
        title={t('띠별 운세', 'Zodiac')}
        titleAccent={t('세', 'ac')}
        sub={t('12지신 기반 오늘의 띠별 운세 · 나의 띠를 선택해보세요',
              "Today's fortune by 12 zodiac animals · pick yours")}
      />

      <div className="relative z-10 px-3 pt-1">
        {/* 선택 상태: 결과 보기 */}
        {selected && selectedAnimal && fortune ? (
          <div>
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="mb-3 inline-flex items-center gap-1 text-[12px] font-semibold text-blue-600 hover:text-blue-700 bg-transparent border-none cursor-pointer p-0"
            >
              &larr; {t('목록으로', 'Back to list')}
            </button>

            <article className="bg-white dark:bg-gray-900 shadow-[0_1px_4px_rgba(0,0,0,0.06)] border border-gray-100 dark:border-gray-800 rounded-xl p-4 sm:p-5">
              <div className="flex items-center gap-2 mb-2 text-[11px] text-gray-400 dark:text-gray-400">
                <span className="font-semibold text-gray-500 dark:text-gray-300">
                  {t('오늘의 띠별 운세', "Today's Zodiac Fortune")}
                </span>
                <span>·</span>
                <span>{formatToday(lang as 'ko' | 'en')}</span>
              </div>
              <h1 className="text-[22px] font-extrabold text-gray-900 dark:text-gray-100 tracking-tight mb-4 leading-[1.3]">
                {selectedAnimal.emoji} {t(selectedAnimal.ko, selectedAnimal.en)} {t('오늘의 운세', "Today's Fortune")}
              </h1>

              <div className="mb-4 p-3 rounded-lg bg-gray-50 dark:bg-gray-800">
                <div className="text-[11px] text-gray-400 dark:text-gray-300 mb-1">{t('해당 연도', 'Birth Years')}</div>
                <div className="text-[13px] text-gray-700 dark:text-gray-200 font-medium">{selectedAnimal.years}</div>
              </div>

              <div className="text-[14px] leading-[1.75] text-gray-700 dark:text-gray-200">
                <p>{lang === 'en' ? fortune.en : fortune.ko}</p>
              </div>

              <div className="mt-6 pt-4 border-t border-gray-100 dark:border-gray-800 flex flex-wrap gap-1.5">
                <span className="inline-block px-2 py-0.5 text-[11px] font-medium text-gray-500 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 rounded-full">
                  #{t(selectedAnimal.ko, selectedAnimal.en)}
                </span>
                <span className="inline-block px-2 py-0.5 text-[11px] font-medium text-gray-500 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 rounded-full">
                  #{t('오늘의운세', 'TodayFortune')}
                </span>
                <span className="inline-block px-2 py-0.5 text-[11px] font-medium text-gray-500 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 rounded-full">
                  #{t('띠별운세', 'ZodiacFortune')}
                </span>
              </div>
            </article>
          </div>
        ) : (
          /* 목록 보기 */
          <ul className="space-y-3">
            {ZODIAC_ANIMALS.map((animal) => (
              <li key={animal.id}>
                <button
                  type="button"
                  onClick={() => setSelected(animal.id)}
                  className="w-full text-left bg-white dark:bg-gray-900 shadow-[0_1px_4px_rgba(0,0,0,0.06)] border border-gray-100 dark:border-gray-800 rounded-xl p-4 hover:border-gray-300 dark:hover:border-gray-700 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2 mb-1 text-[10.5px] text-gray-400 dark:text-gray-400">
                    <span className="font-semibold text-gray-500 dark:text-gray-300">
                      {t('오늘의 띠별 운세', "Today's Zodiac Fortune")}
                    </span>
                    <span>·</span>
                    <span>{formatToday(lang as 'ko' | 'en')}</span>
                  </div>
                  <div className="text-[15px] font-extrabold text-gray-900 dark:text-gray-100 leading-snug mb-1.5">
                    {animal.emoji} {t(animal.ko, animal.en)}
                  </div>
                  <p className="text-[12.5px] text-gray-500 dark:text-gray-300 leading-relaxed line-clamp-2">
                    {lang === 'en' ? MOCK_FORTUNES[animal.id].en : MOCK_FORTUNES[animal.id].ko}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <BottomNav />
    </PageShell>
  );
}
