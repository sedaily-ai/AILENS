// ElevenLabs Text-to-Speech API
//
// SECURITY: this module ran direct browser → ElevenLabs API calls with a
// hardcoded API key embedded in the static client bundle (output: 'export'),
// so the key was visible to every site visitor. It has been removed.
//
// TODO: route ElevenLabs calls through a backend proxy Lambda that holds the
// key in an env var / Secrets Manager and forwards the audio response. Until
// that proxy exists, `generateSpeech` is intentionally disabled.
//
// If you need the previous behaviour for local development, set
// NEXT_PUBLIC_ELEVENLABS_API_KEY in `.env.local` (NOT committed) and reference
// `process.env.NEXT_PUBLIC_ELEVENLABS_API_KEY` here. **Do not** ship a real key
// in any deployed build — anything with the NEXT_PUBLIC_ prefix is bundled.
const ELEVENLABS_API_KEY: string | undefined =
  process.env.NEXT_PUBLIC_ELEVENLABS_API_KEY;

// 에디터별 목소리 ID — 2030 페르소나 기준, ElevenLabs 한국어(ko) young·
// professional 보이스를 88종 카탈로그에서 선별 (2026-05-18 리서치).
export const editorVoices: Record<string, string> = {
  NT: 'RU7aSi6lT4uQBXMLgDxK', // TeddyNote — young 남성, 깊고 매력적·신뢰감(강의 톤). 전략 분석가 민철
  NF: 'AW5wrnG1jVizOYY7R1Oo', // JiYoung — young 여성, 따뜻·맑음·자연스러운 내레이션. 가치 해석자 하은
  ST: '5XgfKMHL4qnyg2mabE5t', // Deck — young 남성, 안정·신뢰(팟캐스트/강의). 팩트 큐레이터 준서
  SF: 'QPFsEL6IBxlT15xfiD6C', // Hana Lee — young 여성, 밝고 또렷(소셜). 트렌드 캐스터 소율
};

// 에디터별 볼륨 설정 (1.0 기본; >1.0 이면 Web Audio gain 증폭)
export const editorVolumes: Record<string, number> = {
  NT: 1.0,
  NF: 1.0,
  ST: 1.0,
  SF: 1.0,
};

// 에디터 소개 텍스트 (자연스러운 말투)
export const editorIntroTexts: Record<string, string> = {
  NT: '안녕하세요. 민철입니다. 저는요, 뉴스를 볼 때 항상 숫자부터 봐요. 데이터가 뭐라고 하는지, 그게 중요하거든요. 핵심만 딱 전해드릴게요.',
  NF: '안녕하세요, 하은이에요. 저는 뉴스 읽을 때, 그 뒤에 있는 사람들 이야기가 자꾸 눈에 들어오더라고요. 천천히, 같이 읽어봐요.',
  ST: '준서입니다. 저는 팩트만 전달해요. 언제, 어디서, 뭐가 있었는지. 그게 젤 중요하니까요.',
  SF: '안녕! 소율이야. 경제뉴스 어렵지? 나도 처음엔 그랬어. 근데 쉽게 풀면 진짜 재밌거든. 같이 보자!',
};

export interface VoiceSettings {
  stability: number;
  similarity_boost: number;
  style: number;
  use_speaker_boost: boolean;
}

// 자연스러운 대화체 기본값. style 을 낮추면(연기톤 ↓) 또박또박한
// 일상 대화에 가깝고, stability 를 올리면 멀티 세그먼트 팟캐스트에서
// 목소리 톤이 구간마다 흔들리지 않는다.
export const CONVERSATIONAL_VOICE: VoiceSettings = {
  stability: 0.5,
  similarity_boost: 0.78,
  style: 0.25,
  use_speaker_boost: true,
};

interface TTSOptions {
  voiceId: string;
  text: string;
  modelId?: string;
  voiceSettings?: VoiceSettings;
}

export async function generateSpeech({
  voiceId,
  text,
  modelId = 'eleven_multilingual_v2',
  voiceSettings = CONVERSATIONAL_VOICE,
}: TTSOptions): Promise<ArrayBuffer> {
  if (!ELEVENLABS_API_KEY) {
    throw new Error(
      'ElevenLabs API key not configured. The hardcoded key was removed for security; ' +
      'set NEXT_PUBLIC_ELEVENLABS_API_KEY for local dev or wait for the backend proxy.'
    );
  }
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'xi-api-key': ELEVENLABS_API_KEY,
    },
    body: JSON.stringify({
      text,
      model_id: modelId,
      voice_settings: voiceSettings,
    }),
  });

  if (!response.ok) {
    throw new Error(`ElevenLabs API error: ${response.status}`);
  }

  return response.arrayBuffer();
}

// 오디오 재생 유틸리티
let currentAudio: HTMLAudioElement | null = null;
let onEndCallback: (() => void) | null = null;

// 오디오 캐시 (메모리 + IndexedDB)
const audioCache = new Map<string, string>(); // editorId -> blob URL

// IndexedDB 캐시
const DB_NAME = 'mbti-audio-cache';
const STORE_NAME = 'audio';

async function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });
}

async function getCachedAudio(editorId: string): Promise<Blob | null> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(editorId);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result || null);
    });
  } catch {
    return null;
  }
}

async function setCachedAudio(editorId: string, blob: Blob): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.put(blob, editorId);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  } catch {
    // 캐시 실패해도 무시
  }
}

export async function playEditorIntro(editorId: string, onEnd?: () => void): Promise<void> {
  // 기존 재생 중인 오디오 중지
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }

  const voiceId = editorVoices[editorId];
  const text = editorIntroTexts[editorId];

  if (!voiceId || !text) {
    console.error('Unknown editor:', editorId);
    return;
  }

  onEndCallback = onEnd || null;

  try {
    let url = audioCache.get(editorId);

    if (!url) {
      // 1. IndexedDB에서 캐시 확인
      const cachedBlob = await getCachedAudio(editorId);

      if (cachedBlob) {
        url = URL.createObjectURL(cachedBlob);
      } else {
        // 2. API 호출
        const audioData = await generateSpeech({ voiceId, text });
        const blob = new Blob([audioData], { type: 'audio/mpeg' });
        url = URL.createObjectURL(blob);

        // IndexedDB에 캐시 저장
        await setCachedAudio(editorId, blob);
      }

      // 메모리 캐시에도 저장
      audioCache.set(editorId, url);
    }

    currentAudio = new Audio(url);

    // Web Audio API로 볼륨 증폭
    const volume = editorVolumes[editorId] || 1.0;
    if (volume > 1.0) {
      const audioContext = new AudioContext();
      const source = audioContext.createMediaElementSource(currentAudio);
      const gainNode = audioContext.createGain();
      gainNode.gain.value = volume;
      source.connect(gainNode);
      gainNode.connect(audioContext.destination);
    }

    await currentAudio.play();

    // 재생 완료 콜백 (캐시된 URL은 해제하지 않음)
    currentAudio.onended = () => {
      currentAudio = null;
      if (onEndCallback) {
        onEndCallback();
        onEndCallback = null;
      }
    };
  } catch (error) {
    console.error('Failed to play audio:', error);
    throw error;
  }
}

// 임의 텍스트(레터 등)를 voiceId 로 합성·재생. cacheKey 단위로
// IndexedDB+메모리 캐시 — 같은 (날짜·그룹) 레터는 1회만 합성.
export async function playCachedText(
  opts: { cacheKey: string; voiceId: string; text: string; volume?: number },
  onEnd?: () => void,
): Promise<void> {
  const { cacheKey, voiceId, text, volume = 1.0 } = opts;
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
  onEndCallback = onEnd || null;

  let url = audioCache.get(cacheKey);
  if (!url) {
    const cachedBlob = await getCachedAudio(cacheKey);
    if (cachedBlob) {
      url = URL.createObjectURL(cachedBlob);
    } else {
      const audioData = await generateSpeech({ voiceId, text });
      const blob = new Blob([audioData], { type: 'audio/mpeg' });
      url = URL.createObjectURL(blob);
      await setCachedAudio(cacheKey, blob);
    }
    audioCache.set(cacheKey, url);
  }

  currentAudio = new Audio(url);
  if (volume > 1.0) {
    const audioContext = new AudioContext();
    const source = audioContext.createMediaElementSource(currentAudio);
    const gainNode = audioContext.createGain();
    gainNode.gain.value = volume;
    source.connect(gainNode);
    gainNode.connect(audioContext.destination);
  }
  await currentAudio.play();
  currentAudio.onended = () => {
    currentAudio = null;
    if (onEndCallback) {
      onEndCallback();
      onEndCallback = null;
    }
  };
}

// ── 2인 대화 팟캐스트 순차 재생 ─────────────────────────────────────────
// segments: [{voiceId, text}] 를 순서대로 합성·재생. 세그먼트 단위
// IndexedDB 캐시 — 같은 대본은 1회만 합성. 진행자/에디터 교대 낭독.
export interface PodcastSegment {
  voiceId: string;
  text: string;
}

let podcastCancelled = false;

export async function playPodcast(
  segments: PodcastSegment[],
  cacheKeyPrefix: string,
  cb?: { onSegment?: (idx: number, total: number) => void; onEnd?: () => void },
): Promise<void> {
  stopAudio();
  podcastCancelled = false;

  // 1) 전체 세그먼트 합성 (캐시 우선) — 재생 전에 모두 확보해 끊김 방지
  const urls: string[] = [];
  for (let i = 0; i < segments.length; i++) {
    if (podcastCancelled) return;
    const seg = segments[i];
    const key = `${cacheKeyPrefix}:${i}:${seg.voiceId}`;
    let url = audioCache.get(key);
    if (!url) {
      const cached = await getCachedAudio(key);
      if (cached) {
        url = URL.createObjectURL(cached);
      } else {
        const data = await generateSpeech({ voiceId: seg.voiceId, text: seg.text });
        const blob = new Blob([data], { type: 'audio/mpeg' });
        url = URL.createObjectURL(blob);
        await setCachedAudio(key, blob);
      }
      audioCache.set(key, url);
    }
    urls.push(url);
  }

  // 2) 순차 재생
  await new Promise<void>((resolve) => {
    const playAt = (idx: number) => {
      if (podcastCancelled || idx >= urls.length) {
        currentAudio = null;
        resolve();
        return;
      }
      cb?.onSegment?.(idx, urls.length);
      const audio = new Audio(urls[idx]);
      currentAudio = audio;
      audio.onended = () => playAt(idx + 1);
      audio.play().catch(() => resolve());
    };
    playAt(0);
  });

  if (!podcastCancelled) cb?.onEnd?.();
}

export function stopAudio(): void {
  podcastCancelled = true;
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
}

export function isPlaying(): boolean {
  return currentAudio !== null && !currentAudio.paused;
}
