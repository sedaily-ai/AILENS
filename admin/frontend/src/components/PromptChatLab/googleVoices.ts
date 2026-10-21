/* Google Gemini 성우 30종 — 2026-10-22. pipelines/common/google_tts.py의 VOICES와 반드시 같은 값이어야
   한다(PollyVoiceSettingsFields.tsx 목록과 같은 이중관리). 출처는 ai.google.dev 음성 생성 문서의
   "Voice options" 표이고, 라벨 설명은 그 표의 스타일 설명을 옮긴 것이다. 같은 성우가 영어·한국어를
   대본 언어대로 읽으므로 영상 탭(LENS)과 PRISM 탭이 같은 목록을 쓴다. */
export const GOOGLE_VOICES = [
  { id: "Kore", label: "Kore — 단호한" },
  { id: "Puck", label: "Puck — 경쾌한" },
  { id: "Charon", label: "Charon — 정보 전달형" },
  { id: "Zephyr", label: "Zephyr — 밝은" },
  { id: "Fenrir", label: "Fenrir — 들뜬" },
  { id: "Leda", label: "Leda — 젊은" },
  { id: "Orus", label: "Orus — 단호한" },
  { id: "Aoede", label: "Aoede — 산뜻한" },
  { id: "Callirrhoe", label: "Callirrhoe — 느긋한" },
  { id: "Autonoe", label: "Autonoe — 밝은" },
  { id: "Enceladus", label: "Enceladus — 숨소리 섞인" },
  { id: "Iapetus", label: "Iapetus — 또렷한" },
  { id: "Umbriel", label: "Umbriel — 느긋한" },
  { id: "Algieba", label: "Algieba — 부드러운" },
  { id: "Despina", label: "Despina — 부드러운" },
  { id: "Erinome", label: "Erinome — 또렷한" },
  { id: "Algenib", label: "Algenib — 거친" },
  { id: "Rasalgethi", label: "Rasalgethi — 정보 전달형" },
  { id: "Laomedeia", label: "Laomedeia — 경쾌한" },
  { id: "Achernar", label: "Achernar — 부드러운" },
  { id: "Alnilam", label: "Alnilam — 단호한" },
  { id: "Schedar", label: "Schedar — 차분한" },
  { id: "Gacrux", label: "Gacrux — 성숙한" },
  { id: "Pulcherrima", label: "Pulcherrima — 적극적인" },
  { id: "Achird", label: "Achird — 친근한" },
  { id: "Zubenelgenubi", label: "Zubenelgenubi — 편안한" },
  { id: "Vindemiatrix", label: "Vindemiatrix — 온화한" },
  { id: "Sadachbia", label: "Sadachbia — 생기 있는" },
  { id: "Sadaltager", label: "Sadaltager — 박식한" },
  { id: "Sulafat", label: "Sulafat — 따뜻한" },
] as const;

export const GOOGLE_DEFAULT_VOICE = "Kore";

/** 영상 탭·PRISM 탭이 보여 주는 제공자(2026-10-22, ElevenLabs는 화면에서 숨김). 팟캐스트는 그대로 Polly/ElevenLabs. */
export const VIDEO_PROVIDERS = ["polly", "google"] as const;
