'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { useLang } from '@saju/shared/lib/LangContext';
import { SAJU } from '@saju/shared/ui/sajuTokens';
import { withBasePath } from '@saju/shared/lib/basePath';
import { ChatBubble } from './ChatBubble';
import { QuickReplies } from './QuickReplies';
import { EraFactCard } from './EraFactCard';
import { DateSelect, TimeSelect, RegionSelect } from './BirthPicker';
import { computeSaju, loadSavedDraft } from '../lib/chatFlow';
import { buildSajuContext, narrowCount, remainingConcerns } from '../lib/knotMachine';
import { CONCERNS, CONCERN_MAP, routeFreeText } from '../lib/concerns';
import { initialPredict, knotHit } from '../lib/coldReading';
import { buildOverlay, buildKnot } from '../lib/narrative';
import { eraFactsFor, type EraFact } from '../lib/eraFacts';
import { callLlm, llmEnabled, type LlmTask } from '../lib/llm';
import { creditsLeft, spendCredit, DAILY_FREE } from '../lib/credits';
import type {
  ChatMessage, ChatState, ConcernId, DraftInput, LangText, QuickReply,
} from '../lib/types';
import type { Pillar, DaeunEntry } from '@saju/features/fortune/lib/engine';

const INITIAL: ChatState = {
  step: 'greeting', draft: {}, pillars: null, ilgan: '', daeuns: [],
  saju: null, knot: null, raisedConcerns: [],
};

/**
 * freeform 응답이 '완결된 풀이'인지 판정 — 되묻기(짧은 클래리파이 질문)면 크레딧을 차감하지 않는다.
 * freeform 프롬프트는 '재해석 + 행동'으로 닫게 되어 있어, 그 마감이 있거나 충분히 길면 답변으로 본다.
 */
function isSubstantiveAnswer(text: string): boolean {
  const t = text.trim();
  if (/재해석|행동|reframe|action/i.test(t)) return true; // 매듭형 마감이 있으면 완결된 답
  if (/[?？]\s*$/.test(t)) return false;                   // 물음표로 끝나면 되묻기
  return t.length >= 200;                                  // 마감이 없어도 충분히 길면 답으로 인정
}

// 입력 전 '왜 4기둥이 필요한지' 설명
const EXPLAIN_PILLARS: LangText[] = [
  { ko: '사주(四柱)는 말 그대로 기둥 4개 — 태어난 연·월·일·시예요.', en: "'Saju' (四柱) literally means four pillars: the year, month, day, and hour you were born." },
  { ko: '이 넷이 당신 에너지의 설계도라, 점이 아니라 ‘근거’로 읽어드릴 수 있어요. 그래서 생년월일과 시간이 필요해요.', en: "These four are the blueprint of your energy — so I can read with grounds, not guesswork. That's why I need your birth date and time." },
];

export function ChatTab() {
  const { t, lang } = useLang();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chat, setChat] = useState<ChatState>(INITIAL);
  const [busy, setBusy] = useState(false);
  const [timeTextMode, setTimeTextMode] = useState(false);
  const [hasSaved, setHasSaved] = useState(false);
  const [freeText, setFreeText] = useState('');
  // 사용자가 입력창에 포커스/타이핑 중인지 — 이때는 자동 스크롤을 멈춰 화면이 끌려가지 않게 한다
  const [inputFocused, setInputFocused] = useState(false);
  // 현재 말풍선이 타이핑되는 중인지 (true 면 '입력 중' 점은 숨김)
  const [isTyping, setIsTyping] = useState(false);
  // 오늘 남은 무료 자유 질문 수 (LLM 연결 시에만 의미). 마운트 후 localStorage 로 동기화.
  const [credits, setCredits] = useState(DAILY_FREE);
  // 토글 입력 모달 표시 여부 — 봇 발화가 끝난 뒤 1.5초 지연 후 true (아래 effect 에서 제어)
  const [pickerOpen, setPickerOpen] = useState(false);
  // 결제 유도 팝업 (무료 소진 후 전송 시) + '준비 중' 안내 토글
  const [showPaywall, setShowPaywall] = useState(false);
  const [paywallSoon, setPaywallSoon] = useState(false);

  const idRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const greetedRef = useRef(false);
  // 랜딩 입력창에서 넘어온 고민 — 온보딩 끝나고 자유 입력 단계에 도달하면 자동 전송
  const pendingPrefillRef = useRef<string | null>(null);
  const chatRef = useRef(chat);
  chatRef.current = chat;
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  // 현재 타이핑 중인 말풍선이 끝나면 호출되는 resolver (다음 말풍선 대기용)
  const typedResolverRef = useRef<(() => void) | null>(null);
  // 현재 단계가 토글 입력 단계인지 (모달 표시는 pickerOpen 상태가 1.5초 지연 후 결정)
  const pickerStep = chat.step === 'date' || chat.step === 'region' || (chat.step === 'time' && timeTextMode);
  // 사용자가 입력 중이면(자유입력 포커스/작성 중 OR 토글 모달 열림) 자동 스크롤 일시정지
  const composingRef = useRef(false);
  composingRef.current = inputFocused || freeText.trim().length > 0 || pickerOpen;
  const nextId = () => `m${idRef.current++}`;

  const toStr = useCallback((l: LangText) => t(l.ko, l.en), [t]);

  /** 말풍선이 다 표시되면 ChatBubble 이 호출 → 대기 중인 다음 말풍선을 진행시킴 */
  const handleBubbleTyped = useCallback(() => {
    setIsTyping(false);
    const r = typedResolverRef.current;
    typedResolverRef.current = null;
    r?.();
  }, []);

  // ── 말풍선 헬퍼 ──
  const pushUser = useCallback((text: string) => {
    setMessages(prev => [...prev, { id: nextId(), role: 'user', text }]);
  }, []);

  /** 봇 말풍선을 하나씩 — 앞 말풍선이 '완전히 표시된 뒤'에야 다음을 올린다. */
  const pushBot = useCallback(async (texts: string[], markdown: boolean): Promise<void> => {
    if (!texts.length) return;
    setBusy(true);
    for (let i = 0; i < texts.length; i++) {
      // 다음 말풍선 직전 짧은 '입력 중' 간격
      await new Promise<void>(r => window.setTimeout(r, i === 0 ? 500 : 350));
      // 말풍선을 올리고, 그 말풍선이 다 표시될 때까지(onTyped) 대기
      await new Promise<void>(done => {
        typedResolverRef.current = done;
        setIsTyping(true);
        setMessages(prev => [...prev, { id: nextId(), role: 'bot', text: texts[i], markdown }]);
      });
    }
    setBusy(false);
  }, []);

  const say = useCallback((lines: LangText[], markdown = false) =>
    pushBot(lines.map(toStr), markdown), [pushBot, toStr]);

  /** LLM 이 연결돼 있으면 그 서술을, 아니면 템플릿(fallback)을 말풍선으로 출력.
   *  state 업데이트는 비동기라 concern/narrowAnswers 는 명시적으로 받는다. */
  const sayLlmOr = useCallback(async (
    task: LlmTask,
    fallback: LangText[],
    opts?: { concern?: ConcernId; narrowAnswers?: string[]; eraFacts?: EraFact[] },
  ) => {
    if (llmEnabled() && chatRef.current.saju) {
      setBusy(true); // LLM 왕복 동안 '입력 중' 표시
      const concern = opts?.concern ?? chatRef.current.knot?.concern;
      // 직전 대화(사용자가 직접 적은 말 포함)를 같이 넘겨 맞히기·얹기·매듭이 실제 상황에 닿게 — 마지막 6턴
      const history = messagesRef.current
        .filter(m => m.text && !m.era)
        .slice(-6)
        .map(m => ({ role: m.role, text: m.text }));
      // 시대 팩트: 호출측이 가져온 실데이터 우선, 없으면 placeholder
      const facts = opts?.eraFacts ?? (concern ? eraFactsFor(concern) : []);
      const text = await callLlm({
        task,
        lang,
        saju: chatRef.current.saju,
        concern,
        narrowAnswers: opts?.narrowAnswers ?? chatRef.current.knot?.narrowAnswers,
        prior: chatRef.current.raisedConcerns,
        eraFacts: facts.length
          ? facts.map(f => ({ text: lang === 'en' ? f.en : f.ko, source: lang === 'en' ? f.sourceEn : f.source }))
          : undefined,
        history,
      });
      if (text) { await pushBot([text], true); return; }
    }
    await pushBot(fallback.map(toStr), true);
  }, [lang, pushBot, toStr]);

  const pushEra = useCallback((concern: ConcernId, facts: EraFact[]) => new Promise<void>(resolve => {
    setBusy(true);
    window.setTimeout(() => {
      setMessages(prev => [...prev, { id: nextId(), role: 'bot', text: '', era: concern, eraFacts: facts }]);
      setBusy(false);
      resolve();
    }, 600);
  }), []);

  // 토글 입력 모달은 봇 발화가 끝난 뒤 1.5초 지연 후 표시 (채팅을 잠시 보게 한 뒤 입력 등장)
  useEffect(() => {
    if (busy || !pickerStep) { setPickerOpen(false); return; }
    const id = window.setTimeout(() => setPickerOpen(true), 1500);
    return () => window.clearTimeout(id);
  }, [busy, pickerStep]);

  // 자동 스크롤 — 사용자가 입력 중이면 멈춤(화면이 끌려 내려가지 않게)
  useEffect(() => {
    if (composingRef.current) return;
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy]);
  useEffect(() => {
    if (!busy) return;
    const id = window.setInterval(() => {
      if (composingRef.current) return;
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
    }, 140);
    return () => window.clearInterval(id);
  }, [busy]);

  // ── 맞히기(초기) 시퀀스 — LLM 있으면 매번 다르게, 없으면 템플릿 ──
  const runPredict = useCallback(async (saju: ChatState['saju']) => {
    if (!saju) return;
    await say([{ ko: '네 기둥이 모였어요. 풀이 전에, 제가 먼저 맞혀볼게요 👀', en: "Your four pillars are in. Before I read — let me guess first 👀" }]);
    let text: string | null = null;
    if (llmEnabled()) { setBusy(true); text = await callLlm({ task: 'predict', lang, saju }); }
    await pushBot([text ?? initialPredict(saju).map(toStr).join('\n\n')], true);
    setChat(c => ({ ...c, step: 'predict' }));
  }, [say, pushBot, toStr, lang]);

  // ── 원국 계산 후 맞히기로 ──
  const computeAndPredict = useCallback(async (
    draft: DraftInput, pillars: Pillar[], ilgan: string, daeuns: DaeunEntry[],
  ) => {
    const saju = buildSajuContext(pillars, daeuns, draft.y ?? new Date().getFullYear());
    setChat(c => ({ ...c, draft, pillars, ilgan, daeuns, saju, step: 'predict' }));
    await runPredict(saju);
  }, [runPredict]);

  // ── 초기 인사 (1회) ──
  useEffect(() => {
    if (greetedRef.current) return;
    greetedRef.current = true;
    setCredits(creditsLeft());
    const saved = loadSavedDraft();
    setHasSaved(!!saved);
    (async () => {
      await say([
        { ko: '안녕하세요.', en: 'Hello.' },
        { ko: '당신 사주에 지금 세상이 어떻게 흐르는지를 얹어서 같이 읽어드려요.', en: "I lay how the world is moving right now on top of your saju, and read them together." },
      ]);
      if (saved) {
        const d = saved.draft;
        const info = d.y != null ? `${d.y}/${String(d.m).padStart(2, '0')}/${String(d.d).padStart(2, '0')}` : '';
        await say([{ ko: `이전에 본 사주(${info})가 있어요. 이어서 볼까요, 새로 할까요?`, en: `You have a past reading (${info}). Continue, or start fresh?` }]);
      } else {
        await say(EXPLAIN_PILLARS);
        await say([{ ko: '그럼 하나씩 같이 세워볼게요. 먼저 태어난 날(양력)을 골라주세요.', en: "Let's build them one by one. First, pick your birth date (solar)." }]);
        setChat(c => ({ ...c, step: 'date' }));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 입력 단계 핸들러 ──
  const acceptDate = useCallback(async (y: number, m: number, d: number) => {
    if (busy) return;
    pushUser(`${y}/${String(m).padStart(2, '0')}/${String(d).padStart(2, '0')}`);
    setChat(c => ({ ...c, draft: { ...c.draft, y, m, d }, step: 'time' }));
    await say([{ ko: '좋아요, 연·월·일 세 기둥이 섰어요! 시간까지 알면 네 번째 기둥(시주)이 완성돼요. 태어난 시간 아시나요?', en: 'Great — the year, month, and day pillars are up! The birth time completes the fourth pillar. Do you know it?' }]);
  }, [busy, pushUser, say]);

  const acceptTime = useCallback(async (hour: number, min: number) => {
    if (busy) return;
    pushUser(`${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`);
    setTimeTextMode(false);
    setChat(c => ({ ...c, draft: { ...c.draft, hour, min, noTime: false }, step: 'gender' }));
    await say([{ ko: '성별도 알려주실래요? 대운 방향을 정하는 데 필요해요.', en: 'Your gender? It sets the direction of your luck cycles.' }]);
  }, [busy, pushUser, say]);

  const acceptRegion = useCallback(async (value: string, label: string) => {
    if (busy) return;
    pushUser(label);
    const draft = { ...chatRef.current.draft, region: value };
    const res = computeSaju(draft);
    if (!res) {
      await say([{ ko: '사주를 계산하지 못했어요. 처음부터 다시 해볼까요?', en: 'Could not compute. Restart?' }]);
      setChat({ ...INITIAL, step: 'date' });
      return;
    }
    await computeAndPredict(draft, res.pillars, res.ilgan, res.daeuns);
  }, [busy, pushUser, say, computeAndPredict]);

  // ── 매듭 시작 ──
  const startKnot = useCallback(async (concern: ConcernId) => {
    setChat(c => ({ ...c, knot: { concern, narrowStep: 0, narrowAnswers: [] } }));
    const def = CONCERN_MAP[concern];
    if (def.narrow.length > 0) {
      setChat(c => ({ ...c, step: 'narrow' }));
      await say([def.narrow[0].prompt]);
    } else {
      // 좁히기 없음 → 바로 맞히기
      setChat(c => ({ ...c, step: 'hit' }));
      await sayLlmOr('hit', [knotHit(concern, [], chatRef.current.saju!)], { concern, narrowAnswers: [] });
    }
  }, [say, sayLlmOr]);

  // ── 매듭 꼬리: 얹기 → 시대 팩트 → 매듭짓기 → 잇기 ──
  const runKnotTail = useCallback(async (concern: ConcernId) => {
    const saju = chatRef.current.saju!;
    const prior = chatRef.current.raisedConcerns;
    const narrowAnswers = chatRef.current.knot?.narrowAnswers;
    // 시대 팩트 placeholder. 얹기·매듭(LLM)·카드 모두 같은 팩트 사용
    const eraFacts = eraFactsFor(concern);
    await sayLlmOr('overlay', buildOverlay(concern, saju), { concern, narrowAnswers, eraFacts });
    await pushEra(concern, eraFacts);
    await sayLlmOr('knot', buildKnot(concern, saju, prior), { concern, narrowAnswers, eraFacts });

    const nextRaised = [...prior, concern];
    setChat(c => ({ ...c, raisedConcerns: nextRaised, knot: null, step: 'link' }));

    const rem = remainingConcerns(nextRaised);
    if (rem.length) {
      await say([{ ko: '이건 좀 풀렸어요? 보통 이런 분들, 그 밑에 딴 게 같이 깔려 있더라고요. 또 있어요?', en: "Eased a bit? Often there's something else underneath. Anything more?" }]);
    } else {
      await say([{ ko: '오늘 꺼낸 고민은 다 짚어봤어요. 또 마음 복잡할 때 들러요.', en: "We've covered today's worries. Come back whenever your mind is busy." }]);
      setChat(c => ({ ...c, step: 'greeting' })); // 종료 상태(선택지 없음)
    }
  }, [say, sayLlmOr, pushEra]);

  // ── quick-reply 처리 ──
  const handlePick = useCallback(async (reply: QuickReply) => {
    if (busy) return;
    const { step } = chatRef.current;

    if (step === 'greeting') {
      pushUser(reply.label);
      if (reply.value === 'continue') {
        const saved = loadSavedDraft();
        if (saved) {
          await computeAndPredict(saved.draft, saved.pillars, saved.ilgan, saved.daeuns);
          return;
        }
      }
      setChat({ ...INITIAL, step: 'date' });
      // 한 번의 say 로 묶어 발화 중간에 busy 가 풀리며 모달이 깜빡이는 것을 막는다
      await say([
        ...EXPLAIN_PILLARS,
        { ko: '좋아요, 새로 볼게요! 먼저 태어난 날(양력)을 골라주세요.', en: "Sure, fresh start! First, pick your birth date (solar) below." },
      ]);
      return;
    }

    if (step === 'time') {
      pushUser(reply.label);
      if (reply.value === 'input') {
        setTimeTextMode(true);
        await say([{ ko: '태어난 시각을 입력해주세요.', en: 'Enter your birth time.' }]);
        return;
      }
      setChat(c => ({ ...c, draft: { ...c.draft, noTime: true, hour: undefined, min: undefined }, step: 'gender' }));
      await say([{ ko: '성별도 알려주실래요? 대운 방향을 정하는 데 필요해요.', en: 'Your gender? It sets the direction of your luck cycles.' }]);
      return;
    }

    if (step === 'gender') {
      pushUser(reply.label);
      setChat(c => ({ ...c, draft: { ...c.draft, gender: reply.value as '남' | '여' }, step: 'region' }));
      await say([{ ko: '마지막이에요! 태어난 지역을 골라주세요. 진태양시 보정에 쓰여요.', en: 'Last one! Pick your birth region — used for true-solar-time correction.' }]);
      return;
    }

    if (step === 'predict') {
      pushUser(reply.label);
      const ack: LangText =
        reply.value === 'yes' ? { ko: '그쵸. 사주에 그렇게 나와 있어요.', en: "Right. It's written in your chart." }
        : reply.value === 'half' ? { ko: '반반이면 충분해요. 사주는 정답이 아니라 경향이니까요.', en: 'Half is plenty — saju is a tendency, not a verdict.' }
        : { ko: '그럴 수도 있어요. 그럼 더 정확히 맞춰볼게요.', en: "Could be. Then let me aim more precisely." };
      await say([ack]);
      await say([{ ko: '이제 제대로 볼게요. 요즘 제일 마음 쓰이는 거, 뭐예요?', en: "Now the real read. What's weighing on you most these days?" }]);
      setChat(c => ({ ...c, step: 'concern' }));
      return;
    }

    if (step === 'concern') {
      pushUser(reply.label);
      await startKnot(reply.value as ConcernId);
      return;
    }

    if (step === 'narrow') {
      pushUser(reply.label);
      const k = chatRef.current.knot;
      if (!k) return;
      const answers = [...k.narrowAnswers, reply.value];
      const nextStep = k.narrowStep + 1;
      if (nextStep < narrowCount(k.concern)) {
        setChat(c => ({ ...c, knot: { ...k, narrowStep: nextStep, narrowAnswers: answers } }));
        await say([CONCERN_MAP[k.concern].narrow[nextStep].prompt]);
      } else {
        setChat(c => ({ ...c, knot: { ...k, narrowAnswers: answers }, step: 'hit' }));
        await sayLlmOr('hit', [knotHit(k.concern, answers, chatRef.current.saju!)], { concern: k.concern, narrowAnswers: answers });
      }
      return;
    }

    if (step === 'hit') {
      pushUser(reply.label);
      const k = chatRef.current.knot;
      if (k) await runKnotTail(k.concern);
      return;
    }

    if (step === 'link') {
      pushUser(reply.label);
      if (reply.value === 'done') {
        await say([{ ko: '좋아요. 오늘은 여기까지 — 또 들러요. 🙂', en: "Good. That's it for today — come back anytime. 🙂" }]);
        setChat(c => ({ ...c, step: 'greeting' }));
        return;
      }
      await startKnot(reply.value as ConcernId);
      return;
    }
  }, [busy, pushUser, say, sayLlmOr, computeAndPredict, startKnot, runKnotTail]);

  // ── 자유 입력 — 입력한 질문 '그 자체'에 답한다 (버킷 강제분류 X) ──
  const submitFreeConcern = useCallback(async () => {
    if (busy) return;
    const v = freeText.trim();
    if (!v) return;

    // 무료 대화 소진 → 전송 시 결제 유도 팝업 (자유 질문 단계에서만; 좁히기 등 가이드 입력은 제외)
    const step0 = chatRef.current.step;
    if (llmEnabled() && (step0 === 'concern' || step0 === 'link') && creditsLeft() <= 0) {
      setShowPaywall(true);
      return; // 메시지 echo·크레딧 차감 없이 팝업만 띄움
    }

    pushUser(v);
    setFreeText('');
    setInputFocused(false); // 전송 후엔 입력 종료로 보고 자동 스크롤 재개
    const saju = chatRef.current.saju;

    // 좁히기 단계에서 직접 입력: 타이핑 내용을 그 단계의 답으로 받아 매듭을 이어간다 (선택지와 동일 처리, 크레딧 차감 없음)
    const nk = chatRef.current.knot;
    if (chatRef.current.step === 'narrow' && nk) {
      const answers = [...nk.narrowAnswers, v];
      const nextStep = nk.narrowStep + 1;
      if (nextStep < narrowCount(nk.concern)) {
        setChat(c => ({ ...c, knot: { ...nk, narrowStep: nextStep, narrowAnswers: answers } }));
        await say([CONCERN_MAP[nk.concern].narrow[nextStep].prompt]);
      } else {
        setChat(c => ({ ...c, knot: { ...nk, narrowAnswers: answers }, step: 'hit' }));
        await sayLlmOr('hit', [knotHit(nk.concern, answers, chatRef.current.saju!)], { concern: nk.concern, narrowAnswers: answers });
      }
      return;
    }

    // LLM 연결 시: 질문 자체에 사주×시대를 얹어 직접 답하고, 다시 잇기 단계로
    if (llmEnabled() && saju) {
      setBusy(true);
      // 직전 대화(텍스트 메시지)를 같이 넘겨 맥락 유지 — 마지막 6턴
      const history = messagesRef.current
        .filter(m => m.text && !m.era)
        .slice(-6)
        .map(m => ({ role: m.role, text: m.text }));
      // 질문을 가까운 고민으로 라우팅 → 시대 팩트 placeholder를 같이 넘겨 '시대 흐름'을 근거 있게
      const routedC = routeFreeText(v);
      const facts = routedC ? eraFactsFor(routedC) : [];
      const eraFacts = facts.length
        ? facts.map(f => ({ text: lang === 'en' ? f.en : f.ko, source: lang === 'en' ? f.sourceEn : f.source }))
        : undefined;
      const text = await callLlm({ task: 'freeform', lang, saju, userText: v, prior: chatRef.current.raisedConcerns, history, eraFacts });
      if (text) {
        // 완결된 풀이일 때만 차감 — 되묻기(짧은 클래리파이)는 무료
        const substantive = isSubstantiveAnswer(text);
        if (substantive) setCredits(spendCredit());
        await pushBot([text], true);
        // 실제 기사를 근거로 답한 완결 풀이면, 그 기사 카드를 함께 노출
        if (substantive && facts.length && routedC) await pushEra(routedC, facts);
        setChat(c => ({ ...c, step: 'link' }));
        await say([{ ko: '더 궁금한 게 있으면 적어주셔도 되고, 아래에서 골라도 돼요.', en: 'Ask anything else, or pick from below.' }]);
        return;
      }
    }
    // 폴백(LLM 없음/실패): 키워드로 가까운 버킷 매칭 → 구조화 매듭, 아니면 안내
    const routed = routeFreeText(v);
    if (routed) await startKnot(routed);
    else await say([{ ko: '음, 아래에서 가까운 걸 골라주실래요?', en: 'Hmm — pick the closest below?' }]);
  }, [busy, freeText, lang, pushUser, pushBot, say, sayLlmOr, startKnot]);

  // ── 랜딩 입력창 고민 이어받기 — 자유 입력 단계에 들어서면 1회 예약 ──
  useEffect(() => {
    if (chat.step !== 'concern' && chat.step !== 'link') return;
    if (busy || pendingPrefillRef.current !== null) return;
    try {
      const pre = window.localStorage.getItem('saju_chat_prefill');
      if (pre && pre.trim()) {
        window.localStorage.removeItem('saju_chat_prefill');
        pendingPrefillRef.current = pre;
        setFreeText(pre);
      }
    } catch {}
  }, [chat.step, busy]);

  // ── 예약된 고민이 실제로 입력창에 반영되면 전송 ──
  useEffect(() => {
    if (pendingPrefillRef.current === null || freeText !== pendingPrefillRef.current) return;
    pendingPrefillRef.current = null;
    submitFreeConcern();
  }, [freeText, submitFreeConcern]);

  // ── 입력 위젯 표시 ──
  const showDatePicker = chat.step === 'date';
  const showTimePicker = chat.step === 'time' && timeTextMode;
  const showRegionPicker = chat.step === 'region';
  // 고민 열기/잇기 단계에서 자유 입력 허용 (선택지 + 직접 타이핑)
  const showConcernInput = chat.step === 'concern' || chat.step === 'link';
  // 좁히기 단계에서도 선택지 외에 직접 입력 허용
  const showNarrowInput = chat.step === 'narrow';
  const showPicker = showDatePicker || showTimePicker || showRegionPicker;

  const triRepl: QuickReply[] = [
    { value: 'yes', label: t('네, 맞아요', 'Yes, that fits') },
    { value: 'half', label: t('반반인 것 같아요', 'Sort of') },
    { value: 'no', label: t('음, 잘 모르겠어요', "Hmm, not really") },
  ];

  const quickReplies: QuickReply[] = (() => {
    if (showPicker) return [];
    switch (chat.step) {
      case 'greeting':
        return hasSaved
          ? [
              { value: 'continue', label: t('저장된 사주로 이어서 볼게요', 'Continue with the saved one') },
              { value: 'new', label: t('새로 입력할게요', "I'll start fresh") },
            ]
          : [];
      case 'time':
        return [
          { value: 'unknown', label: t('태어난 시간은 잘 몰라요', "I don't know my birth time") },
          { value: 'input', label: t('시간을 직접 고를게요', "I'll pick the time") },
        ];
      case 'gender':
        return [
          { value: '남', label: t('남성이에요', "I'm male") },
          { value: '여', label: t('여성이에요', "I'm female") },
        ];
      case 'predict':
      case 'hit':
        return triRepl;
      case 'concern':
        return CONCERNS.map(c => ({ value: c.id, label: `${c.emoji} ${t(c.label.ko, c.label.en)}` }));
      case 'narrow': {
        const k = chat.knot;
        if (!k) return [];
        const q = CONCERN_MAP[k.concern].narrow[k.narrowStep];
        return q ? q.options.map(o => ({ value: o.value, label: t(o.label.ko, o.label.en) })) : [];
      }
      case 'link': {
        const rem = remainingConcerns(chat.raisedConcerns);
        return [
          ...rem.map(id => ({ value: id, label: `${CONCERN_MAP[id].emoji} ${t(CONCERN_MAP[id].label.ko, CONCERN_MAP[id].label.en)}` })),
          { value: 'done', label: t('아니, 이거면 됐어요', "No, that's enough") },
        ];
      }
      default:
        return [];
    }
  })();

  return (
    <>
    <div className="flex flex-col h-full min-h-0">
      {/* 메시지 영역 */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-3 py-3">
        {messages.map(m => (
          m.era
            ? <EraFactCard key={m.id} facts={m.eraFacts ?? eraFactsFor(m.era)} />
            : <ChatBubble key={m.id} message={m} onTyped={m.role === 'bot' ? handleBubbleTyped : undefined} />
        ))}
        {busy && !isTyping && (
          <div className="flex justify-start items-end gap-1.5 mb-2">
            <span
              className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center"
              style={{ background: SAJU.warmSoft, color: SAJU.warmDeep }}
              aria-hidden
            >
              <Sparkles size={13} strokeWidth={2.2} />
            </span>
            <div className="chat-bubble-in rounded-2xl px-4 py-3" style={{ background: 'rgba(255,255,255,0.96)', border: `1px solid ${SAJU.warm}33` }}>
              <span className="inline-flex items-center gap-1.5">
                <span className="chat-dot w-1.5 h-1.5 rounded-full" style={{ background: SAJU.warmDeep }} />
                <span className="chat-dot w-1.5 h-1.5 rounded-full" style={{ background: SAJU.warmDeep, animationDelay: '0.18s' }} />
                <span className="chat-dot w-1.5 h-1.5 rounded-full" style={{ background: SAJU.warmDeep, animationDelay: '0.36s' }} />
              </span>
            </div>
          </div>
        )}
      </div>

      {/* 하단 입력/선택 영역 (선택 버튼 + 자유입력). 드롭다운 입력은 아래 중앙 모달로 분리 */}
      <div className="shrink-0 border-t bg-white/70 backdrop-blur px-3 pt-3 pb-3" style={{ borderColor: SAJU.line }}>
        <QuickReplies replies={quickReplies} onPick={handlePick} disabled={busy} />
        {showConcernInput && llmEnabled() && credits > 0 && (
          <div className="flex items-center gap-1.5 px-1.5 pb-1.5 text-[11.5px]" style={{ color: SAJU.inkSub }}>
            <span>✨</span>
            <span>{t(`오늘 남은 무료 질문 ${credits}회`, `${credits} free question${credits === 1 ? '' : 's'} left today`)}</span>
          </div>
        )}
        {showConcernInput && llmEnabled() && credits <= 0 && (
          <button
            type="button"
            onClick={() => setShowPaywall(true)}
            className="flex items-center gap-1.5 px-1.5 pb-1.5 text-[11.5px] cursor-pointer"
            style={{ color: SAJU.inkSub }}
          >
            <span>✨</span>
            <span>{t('오늘 무료 질문을 모두 사용했어요', "You've used all of today's free questions")}</span>
          </button>
        )}
        {(showConcernInput || showNarrowInput) && (
          <div className="flex gap-2.5 px-0.5 pb-1">
            <input
              value={freeText}
              onChange={e => setFreeText(e.target.value)}
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
              onKeyDown={e => { if (e.key === 'Enter') submitFreeConcern(); }}
              placeholder={showNarrowInput
                ? t('아니면 직접 적어주셔도 돼요…', 'Or type your own…')
                : t('편하게 적어주셔도 돼요…', 'Feel free to type…')}
              className="flex-1 rounded-2xl px-4 py-3 text-[15px] outline-none"
              style={{ background: '#fff', border: `1px solid ${SAJU.line}`, color: SAJU.ink }}
            />
            <button
              type="button"
              onClick={submitFreeConcern}
              disabled={busy || !freeText.trim()}
              className="rounded-2xl px-5 py-3 text-[15px] font-semibold text-white disabled:opacity-40 transition cursor-pointer hover:brightness-95 active:scale-95 disabled:cursor-not-allowed disabled:hover:brightness-100"
              style={{ background: SAJU.warmDeep }}
            >
              {t('전송', 'Send')}
            </button>
          </div>
        )}
      </div>
    </div>

    {/* 드롭다운 입력 중앙 모달 — 봇이 말하는 중(busy)엔 숨기고, 발화가 끝난 뒤에만 띄운다(pickerOpen).
        스크롤 흐름 밖(fixed)이라 채팅 길이와 무관하게 항상 같은 위치에 보이고, 위아래로 펼칠 공간이 넉넉하다. */}
    {pickerOpen && (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-5" style={{ background: 'rgba(20,16,12,0.34)' }}>
        <div
          className="chat-bubble-in w-full max-w-[400px] rounded-2xl border p-5"
          style={{ background: '#fff', borderColor: SAJU.line, boxShadow: '0 14px 44px rgba(20,16,12,0.24)' }}
        >
          <div className="text-[14px] font-semibold mb-3.5" style={{ color: SAJU.warmDeep }}>
            {showDatePicker && t('태어난 날(양력)을 골라주세요', 'Pick your birth date (solar)')}
            {showTimePicker && t('태어난 시각을 골라주세요', 'Pick your birth time')}
            {showRegionPicker && t('태어난 지역을 골라주세요', 'Pick your birth region')}
          </div>
          {showDatePicker && <DateSelect onConfirm={acceptDate} t={t} />}
          {showTimePicker && (
            <>
              <TimeSelect onConfirm={acceptTime} t={t} />
              <button
                type="button"
                onClick={() => setTimeTextMode(false)}
                className="mt-3 text-[12px] underline cursor-pointer"
                style={{ color: SAJU.inkSub }}
              >
                {t('← 다시 선택', '← Back')}
              </button>
            </>
          )}
          {showRegionPicker && <RegionSelect onConfirm={acceptRegion} t={t} lang={lang} />}
        </div>
      </div>
    )}

    {/* 결제 유도 팝업 — 무료 대화 소진 후 전송 시. 결제 버튼은 지금은 '준비 중' 플레이스홀더. */}
    {showPaywall && (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-5"
        style={{ background: 'rgba(20,16,12,0.42)' }}
        onClick={() => { setShowPaywall(false); setPaywallSoon(false); }}
      >
        <div
          className="chat-bubble-in w-full max-w-[360px] rounded-2xl border p-6 text-center"
          style={{ background: '#fff', borderColor: SAJU.line, boxShadow: '0 16px 48px rgba(20,16,12,0.28)' }}
          onClick={e => e.stopPropagation()}
        >
          <div
            className="w-11 h-11 mx-auto mb-3 rounded-full flex items-center justify-center"
            style={{ background: SAJU.warmSoft, color: SAJU.warmDeep }}
          >
            <Sparkles size={20} strokeWidth={2.2} />
          </div>
          <div className="text-[16px] font-bold mb-1.5" style={{ color: SAJU.ink }}>
            {t('오늘 무료 대화를 모두 사용했어요', "You've used all of today's free chats")}
          </div>
          <div className="text-[13px] leading-relaxed mb-5" style={{ color: SAJU.inkSoft }}>
            {t('프리미엄으로 무제한 대화와 더 깊은 사주 풀이를 이어가세요.', 'Go premium for unlimited chats and a deeper saju reading.')}
          </div>
          {paywallSoon ? (
            <div className="rounded-2xl px-4 py-3 text-[13px] font-semibold mb-3" style={{ background: SAJU.warmSoft, color: SAJU.warmDeep }}>
              {t('결제 기능을 준비 중이에요. 곧 만나요 🙏', 'Payments are coming soon 🙏')}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setPaywallSoon(true)}
              className="w-full rounded-2xl px-4 py-3 text-[15px] font-semibold text-white transition cursor-pointer hover:brightness-95 active:scale-95 mb-3"
              style={{ background: SAJU.warmDeep }}
            >
              {t('프리미엄 시작하기', 'Start Premium')}
            </button>
          )}
          <a href={withBasePath('/saju/')} className="block text-[13px] underline mb-4" style={{ color: SAJU.inkSub }}>
            {t('사주 전체 풀이 먼저 보기', 'See the full saju reading first')}
          </a>
          <button
            type="button"
            onClick={() => { setShowPaywall(false); setPaywallSoon(false); }}
            className="text-[12.5px] cursor-pointer"
            style={{ color: SAJU.inkSub }}
          >
            {t('나중에', 'Maybe later')}
          </button>
        </div>
      </div>
    )}
    </>
  );
}
