"use client";

import { useEffect, useRef, useState } from "react";

/* ElevenLabs 성우 드롭다운 + 미리듣기 — 원래 VoicePreviewGenerator.tsx
   안에 있었는데, 2026-09-25 VoiceProviderFields.tsx(성우/엔진/모델/세부
   설정 공유 컴포넌트) 신설로 그 파일과 VoicePreviewGenerator.tsx가 서로를
   import하는 순환 참조가 생겨 독립 파일로 뺐다. 미리듣기는 클릭 시에만
   재생(참고: 오디오 URL은 elevenlabs_tts.py가 미리 만들어둔 고정
   인삿말 mp3, S3 고정 URL)을 그대로 트는 것 — 드롭다운 열 때마다
   ElevenLabs를 호출하지 않는다(크레딧 낭비 방지). */
export function VoiceSelectWithPreview({
  value,
  onChange,
  voices,
}: {
  value: string;
  onChange: (id: string) => void;
  voices: { id: string; label: string; sample_url: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  useEffect(() => {
    // 언마운트(드롭다운 닫힘 등) 시 재생 중이던 미리듣기 정리.
    return () => audioRef.current?.pause();
  }, []);

  const togglePreview = (e: React.MouseEvent, voice: { id: string; sample_url: string }) => {
    e.stopPropagation();
    if (playingId === voice.id) {
      audioRef.current?.pause();
      setPlayingId(null);
      return;
    }
    audioRef.current?.pause();
    const audio = new Audio(voice.sample_url);
    audio.onended = () => setPlayingId(null);
    audio.onerror = () => setPlayingId(null);
    audioRef.current = audio;
    audio.play().catch(() => setPlayingId(null));
    setPlayingId(voice.id);
  };

  const current = voices.find((v) => v.id === value);

  return (
    <div className="relative inline-block" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex cursor-pointer items-center gap-1.5 outline-none"
      >
        <span className="text-[12.5px] font-medium" style={{ color: current ? "var(--text-primary)" : "var(--text-muted)" }}>
          {current?.label ?? "성우 불러오는 중..."}
        </span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-gray-400" aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div
          className="absolute z-20 mt-1.5 min-w-[220px] rounded-xl border p-1"
          style={{ background: "var(--surface-card)", borderColor: "var(--border-hairline)", boxShadow: "var(--shadow-md)" }}
        >
          {voices.map((v) => (
            <div
              key={v.id}
              className="flex w-full items-center gap-1 rounded-lg pr-1 transition-colors hover:bg-[var(--surface-sunken)]"
            >
              <button
                type="button"
                onClick={() => {
                  onChange(v.id);
                  setOpen(false);
                }}
                className="flex-1 cursor-pointer px-2.5 py-1.5 text-left text-[12.5px] font-medium"
                style={{ color: v.id === value ? "var(--accent)" : "var(--text-secondary)" }}
              >
                {v.label}
              </button>
              {/* 2026-09-24, 사용자 지적 — 드롭다운에서 이 버튼이 잘 안
                  보인다는 피드백("팟캐스트 남성... 팟캐스트 여성이 어떤
                  성우인지..?") 반영: 기본 색을 흐린 회색이 아니라 accent
                  색으로 바꾸고, 배경도 옅게 깔아서 "여기 누르면 들을 수
                  있다"는 게 hover 안 해도 바로 보이게 했다. */}
              <button
                type="button"
                onClick={(e) => togglePreview(e, v)}
                className="flex-none rounded-md p-1.5 transition-colors hover:opacity-75"
                style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
                aria-label={playingId === v.id ? "미리듣기 정지" : "미리듣기 재생"}
                title={playingId === v.id ? "미리듣기 정지" : "미리듣기 재생"}
              >
                {playingId === v.id ? (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <rect x="6" y="5" width="4" height="14" />
                    <rect x="14" y="5" width="4" height="14" />
                  </svg>
                ) : (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M7 5v14l12-7z" />
                  </svg>
                )}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
