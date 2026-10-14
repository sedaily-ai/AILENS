import React from "react";
import { Img, interpolate, random, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { CalendarDays, ClipboardList, Coins, Gavel, Handshake, House, LucideIcon, Newspaper, Package, ScanSearch, Ship, TrendingUp, UserRound } from "lucide-react";
import { resolveIcon } from "../components/Icon";
import type { Bar, CardNode, EmStyle, Photo } from "./types";
import { HandArrow, HandCircle, Highlighter, PaperCard, Pin, Stamp, Tape, useImpactShake } from "./paper";
import { Caption } from "./parts";
import { CLAMP, FONT, MARGIN, SPRING, usePalette, useTwos } from "./theme";

// 전달받은 템플릿의 아이콘 이름. 사이트 각본은 사이트 아이콘 이름(components/Icon.tsx)을 쓰므로
// 여기 없으면 사이트 표로 찾고, 거기에도 없으면 사이트 기본 아이콘이 나온다.
const PAPER_ICONS: Record<string, LucideIcon> = {
  package: Package,
  scan: ScanSearch,
  ship: Ship,
  calendar: CalendarDays,
  clipboard: ClipboardList,
  house: House,
  gavel: Gavel,
  trend: TrendingUp,
  coins: Coins,
  newspaper: Newspaper,
  handshake: Handshake,
  user: UserRound,
};
const iconOf = (name: string): LucideIcon => PAPER_ICONS[name] ?? resolveIcon(name);

// 사이트 각본 사진은 S3 절대 URL로 온다. 로컬 미리보기용 public/ 경로도 받는다.
const photoSrc = (photo: Photo) => (photo.url.startsWith("http") ? photo.url : staticFile(photo.url));

// 고정 각본에 맞춰 잡혀 있던 글자 크기를, 길이가 들쭉날쭉한 사이트 각본에서도 칸을 넘지 않게 줄인다.
// 글자 폭(글자 크기 대비): 한글·한자 1, 숫자 0.62, 영문 0.62, 공백 0.3, 문장부호 0.35.
const charUnits = (ch: string) => {
  if (/[ㄱ-힝一-鿿]/.test(ch)) return 1;
  if (/[0-9A-Za-z%]/.test(ch)) return ch === "%" ? 0.8 : 0.62;
  if (ch === " ") return 0.3;
  return 0.4;
};
export const textUnits = (text: string) => [...text].reduce((acc, ch) => acc + charUnits(ch), 0);
const fitSize = (text: string, max: number, width: number, scale = 1) => Math.min(max, Math.floor(width / Math.max(1, textUnits(text) * scale)));

// Caption은 강조어 앞·강조어·뒤 세 조각이 각각 줄바꿈되지 않으므로, 가장 긴 조각이 칸에 들어가는 크기를 고른다.
const captionFit = (caption: string, emphasis: string, emScale: number, width: number, max: number) => {
  const idx = caption.indexOf(emphasis);
  const pieces = idx >= 0 ? [caption.slice(0, idx).trim(), caption.slice(idx + emphasis.length).trim()] : [caption];
  const units = Math.max(...pieces.map(textUnits), idx >= 0 ? textUnits(emphasis) * emScale : 0, 1);
  return Math.min(max, Math.floor(width / units));
};

const NOTE = "#F8F2E4"; // light note paper used on every stock

// ---------------------------------------------------------------- 기사 사진 카드 (collage print)

/** Article photo printed as a halftone collage card: white border, tape, slow 5% push, credit below. */
export const PhotoCard: React.FC<{ photo: Photo; x: number; y: number; w: number; rotate?: number; enterAt?: number }> = ({ photo, x, y, w, rotate = 2.5, enterAt = 6 }) => {
  const frame = useCurrentFrame();
  const imgH = Math.round((w - 32) * 0.667);
  const h = imgH + 72;
  return (
    <>
      <PaperCard x={x} y={y} w={w} h={h} rotate={rotate} color="#FFFFFF" enterAt={enterAt} enter="drop">
        <div style={{ position: "absolute", left: 16, right: 16, top: 16, height: imgH, overflow: "hidden", background: "#DDD" }}>
          <Img
            src={photoSrc(photo)}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              filter: "grayscale(1) contrast(1.3) brightness(1.08)",
              transform: `scale(${interpolate(frame, [0, 90], [1, 1.05], CLAMP)})`,
            }}
          />
          <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(rgba(0,0,0,0.55) 1.6px, transparent 2.2px)", backgroundSize: "6px 6px", mixBlendMode: "multiply", opacity: 0.5 }} />
        </div>
        <div style={{ position: "absolute", left: 18, right: 18, bottom: 14, fontFamily: FONT.mono, fontWeight: 700, fontSize: 21, color: "#5E5A52", textAlign: "right", whiteSpace: "nowrap", overflow: "hidden" }}>
          {photo.credit}
        </div>
      </PaperCard>
      <Tape x={x + w / 2 - 85} y={y - 18} w={170} rotate={-6} enterAt={enterAt + 4} />
    </>
  );
};

// ---------------------------------------------------------------- 1. 도장 숫자 (opening)

export const StampNumber: React.FC<{ kicker: string; number: string; note?: string; tag?: string; photo?: Photo }> = ({ kicker, number, note, tag, photo }) => {
  const P = usePalette();
  const frame = useCurrentFrame();
  // Stamp is already landing on frame 0 so the key number is visible immediately.
  const STAMP_AT = -4;
  const shake = useImpactShake(STAMP_AT + 2);
  const tagIn = spring({ frame: frame - 12, fps: 30, config: SPRING.enter });
  // With a photo the hand-written tag moves under the photo and points back at the stamp.
  const tagPos = photo ? { left: 1080, top: 790 } : { left: 1170, top: 360 };
  const arrow: [[number, number], [number, number]] = photo ? [[1070, 850], [930, 700]] : [[1230, 540], [1010, 600]];
  // 도장 상자(테두리·여백 포함 약 글자 수 × 크기 + 0.6 × 크기)가 사진·메모 칸 앞(약 880px)에서 멈추게 줄인다.
  // 도장 상자 폭 ≈ (글자 폭 + 테두리·여백 0.6) × 크기. 오른쪽에 사진이나 손글씨가 있으면 그 앞(약 900px)에서 멈춘다.
  const stampSize = Math.min(300, Math.floor((photo || tag ? 900 : 1450) / (textUnits(number) + 0.6)));
  const kickerSize = fitSize(kicker, 104, photo ? 860 : 1500);
  return (
    <div style={{ position: "absolute", inset: 0, transform: shake }}>
      <div style={{ position: "absolute", left: 200, top: 190, fontFamily: FONT.sans, fontWeight: 900, fontSize: kickerSize, color: P.ink, letterSpacing: -2, whiteSpace: "nowrap" }}>{kicker}</div>
      <div style={{ position: "absolute", left: 190, top: 340 }}>
        {/* riso misregistration ghost */}
        <div style={{ position: "absolute", left: 6, top: 5, opacity: 0.3 }}>
          <Stamp text={number} at={STAMP_AT} size={stampSize} rotate={-5} color={P.spot} />
        </div>
        <Stamp text={number} at={STAMP_AT} size={stampSize} rotate={-5} color={P.spot} />
      </div>
      {photo && <PhotoCard photo={photo} x={1110} y={200} w={640} rotate={2.5} enterAt={4} />}
      {tag && (
        <>
          <div
            style={{
              position: "absolute",
              ...tagPos,
              fontFamily: FONT.pen,
              fontSize: fitSize(tag, photo ? 110 : 140, 620),
              color: P.spot,
              transform: `rotate(-6deg) scale(${0.8 + 0.2 * tagIn})`,
              opacity: tagIn,
              whiteSpace: "nowrap",
            }}
          >
            {tag}
          </div>
          <HandArrow from={arrow[0]} to={arrow[1]} start={18} dur={8} bend={-0.3} color={P.spot} />
        </>
      )}
      {note && (
        <Tape x={200} y={800} rotate={-1.5} enterAt={16}>
          <span style={{ fontFamily: FONT.pen, fontSize: fitSize(note, 56, 1400), color: "#1B1B1B", whiteSpace: "nowrap" }}>{note}</span>
        </Tape>
      )}
    </div>
  );
};

// ---------------------------------------------------------------- 기사 사진 장면 (사이트 photo 컷)

export const PhotoScene: React.FC<{ photo: Photo; caption: string; emphasis: string; emStyle: EmStyle }> = ({ photo, caption, emphasis, emStyle }) => (
  <>
    <div style={{ position: "absolute", left: MARGIN, top: 0, bottom: 0, width: 640, display: "flex", alignItems: "center" }}>
      <Caption text={caption} emphasis={emphasis} emStyle={emStyle} size={captionFit(caption, emphasis, 1.4, 620, 92)} emScale={1.4} />
    </div>
    <PhotoCard photo={photo} x={820} y={170} w={940} rotate={2} enterAt={2} />
  </>
);

// ---------------------------------------------------------------- 5. 전후 비교 (종이 덮기)

export const PaperBeforeAfter: React.FC<{
  before: { label: string; value: string };
  after: { label: string; value: string };
  direction: "up" | "down";
  caption: string;
  emphasis: string;
  emStyle: "stamp" | "marker";
}> = ({ before, after, direction, caption, emphasis, emStyle }) => {
  const P = usePalette();
  const frame = useCurrentFrame();
  const STRIKE_AT = 12;
  const AFTER_AT = 18;
  const strike = interpolate(frame, [STRIKE_AT, STRIKE_AT + 6], [0, 1], CLAMP);
  return (
    <>
      <div style={{ position: "absolute", left: 0, right: 0, top: 150, display: "flex", justifyContent: "center" }}>
        <Caption text={caption} emphasis={emphasis} emStyle={emStyle} size={captionFit(caption, emphasis, 1.6, 1500, 92)} emScale={1.6} align="center" />
      </div>
      <PaperCard x={300} y={420} w={600} h={380} rotate={-3} color={NOTE} enter="drop" enterAt={0}>
        <div style={{ padding: "50px 56px", fontFamily: FONT.sans, color: "#1B1B1B" }}>
          <div style={{ fontWeight: 700, fontSize: 46, color: "#5E5A52" }}>{before.label}</div>
          <div style={{ position: "relative", display: "inline-block", fontWeight: 900, fontSize: fitSize(before.value, 170, 490), lineHeight: 1.1, whiteSpace: "nowrap" }}>
            {before.value}
            <svg width={520} height={60} style={{ position: "absolute", left: -20, top: "40%", overflow: "visible" }}>
              <path d="M0 34 C 120 18, 300 44, 500 22" fill="none" stroke="#D8432E" strokeWidth={14} strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - strike} />
            </svg>
          </div>
        </div>
      </PaperCard>
      <PaperCard x={960} y={360} w={660} h={440} rotate={4} color={P.spotPaper} enter="right" enterAt={AFTER_AT}>
        <div style={{ padding: "56px 60px", fontFamily: FONT.sans, color: P.onSpot }}>
          <div style={{ fontWeight: 700, fontSize: 46, opacity: 0.9 }}>{after.label}</div>
          <div style={{ fontWeight: 900, fontSize: fitSize(after.value, 210, 420), lineHeight: 1.05, whiteSpace: "nowrap" }}>
            {after.value}
            <span style={{ fontSize: 110, marginLeft: 16 }}>{direction === "up" ? "▲" : "▼"}</span>
          </div>
        </div>
      </PaperCard>
    </>
  );
};

// ---------------------------------------------------------------- 3. 신문 1면 (opening)

export const NewsFront: React.FC<{ headline: string; caption: string; emphasis: string; icon: string; numberNote?: string; photo?: Photo }> = ({ headline, caption, emphasis, icon, numberNote, photo }) => {
  const P = usePalette();
  const frame = useCurrentFrame();
  const print = interpolate(frame, [0, 10], [0, 100], CLAMP); // headline prints top → bottom
  const lead = caption.replace(emphasis, "").trim();
  const shake = useImpactShake(0);
  const PlaceholderIcon = iconOf(icon);
  // 왼쪽 칸(사진 카드 앞, 약 940px)과 헤드라인 줄(1700px)을 넘지 않게 줄인다.
  const headlineSize = fitSize(headline, 92, 1700);
  const leadSize = fitSize(lead, 100, 940);
  const emSize = fitSize(emphasis, 250, 900);

  return (
    <div style={{ position: "absolute", inset: 0, transform: shake }}>
      {/* masthead rules */}
      <div style={{ position: "absolute", left: MARGIN, right: MARGIN, top: 150, height: 5, background: P.ink }} />
      <div style={{ position: "absolute", left: MARGIN, right: MARGIN, top: 160, height: 2, background: P.ink }} />
      <div style={{ position: "absolute", right: MARGIN, top: 112, fontFamily: FONT.mono, fontWeight: 700, fontSize: 24, color: P.muted }}>AILENS · 1면</div>

      <div
        style={{
          position: "absolute",
          left: MARGIN,
          top: 186,
          fontFamily: FONT.serif,
          fontWeight: 900,
          fontSize: headlineSize,
          color: P.ink,
          letterSpacing: -2,
          whiteSpace: "nowrap",
          clipPath: `inset(0 0 ${100 - print}% 0)`,
        }}
      >
        {headline}
      </div>
      <div style={{ position: "absolute", left: MARGIN, right: MARGIN, top: 330, height: 2, background: P.ink, opacity: 0.6 }} />

      {/* key number — on screen from frame 0 */}
      <div style={{ position: "absolute", left: MARGIN, top: 380 }}>
        {lead && <div style={{ fontFamily: FONT.sans, fontWeight: 900, fontSize: leadSize, color: P.ink, lineHeight: 1, whiteSpace: "nowrap" }}>{lead}</div>}
        <div style={{ position: "relative", display: "inline-block", marginTop: 6 }}>
          {/* riso misregistration: offset spot layer */}
          <div style={{ position: "absolute", left: 5, top: 4, fontFamily: FONT.sans, fontWeight: 900, fontSize: emSize, lineHeight: 1, color: P.spot, opacity: 0.35, whiteSpace: "nowrap" }}>{emphasis}</div>
          <div style={{ position: "relative", fontFamily: FONT.sans, fontWeight: 900, fontSize: emSize, lineHeight: 1, color: P.spot, filter: "url(#ink-bleed)", whiteSpace: "nowrap" }}>{emphasis}</div>
          <HandCircle w={Math.max(260, [...emphasis].length * emSize + 40)} h={emSize} start={4} dur={14} color={P.ink} width={8} seed="s1" />
        </div>
        {numberNote && (
          <div style={{ position: "relative", height: 90 }}>
            <Tape x={0} y={20} rotate={-2} enterAt={14}>
              <span style={{ fontFamily: FONT.pen, fontSize: 54, color: "#1B1B1B", whiteSpace: "nowrap" }}>{numberNote}</span>
            </Tape>
          </div>
        )}
      </div>

      {/* right: the article photo as a halftone print with a white border (icon placeholder if none) */}
      <PaperCard x={1080} y={370} w={600} h={photo ? 420 : 380} rotate={2.5} color="#FFFFFF" enterAt={6} enter="drop">
        {photo ? (
          <>
            <div style={{ position: "absolute", left: 16, right: 16, top: 16, height: 360, overflow: "hidden", background: "#DDD" }}>
              <Img
                src={photoSrc(photo)}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  filter: "grayscale(1) contrast(1.35) brightness(1.05)",
                  transform: `scale(${interpolate(frame, [0, 90], [1, 1.05], CLAMP)})`,
                }}
              />
              {/* halftone screen over the photo */}
              <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(rgba(0,0,0,0.55) 1.6px, transparent 2.2px)", backgroundSize: "6px 6px", mixBlendMode: "multiply", opacity: 0.55 }} />
            </div>
            <div style={{ position: "absolute", left: 18, right: 18, bottom: 10, fontFamily: FONT.mono, fontWeight: 700, fontSize: 22, color: "#5E5A52", textAlign: "right", whiteSpace: "nowrap", overflow: "hidden" }}>
              {photo.credit}
            </div>
          </>
        ) : (
          <>
            <div style={{ position: "absolute", inset: 16, backgroundImage: `radial-gradient(${P.ink} 2.4px, transparent 2.8px)`, backgroundSize: "10px 10px", opacity: 0.22 }} />
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <PlaceholderIcon size={190} color={P.ink} strokeWidth={2.2} />
            </div>
          </>
        )}
      </PaperCard>
      <Tape x={1290} y={352} w={170} rotate={-6} enterAt={10} />
      <div style={{ position: "absolute", left: 1080, top: photo ? 830 : 790, width: 640, display: "flex", gap: 28 }}>
        {[0, 1, 2].map((col) => (
          <div key={col} style={{ flex: 1 }}>
            {Array.from({ length: 5 }, (_, r) => (
              <div key={r} style={{ height: 10, marginBottom: 12, width: `${70 + random(`col${col}-${r}`) * 30}%`, background: P.ink, opacity: 0.16, borderRadius: 3 }} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------- 2. 콜라주 보드 (flow)

const NoteCard: React.FC<{ node: CardNode; x: number; y: number; w: number; h: number; rotate: number; enterAt: number }> = ({ node, x, y, w, h, rotate, enterAt }) => {
  const P = usePalette();
  const Icon = iconOf(node.icon);
  const fg = node.highlight ? P.onSpot : "#1B1B1B";
  return (
    <>
      <PaperCard x={x} y={y} w={w} h={h} rotate={rotate} color={node.highlight ? P.spotPaper : NOTE} enterAt={enterAt} enter="drop">
        <div style={{ padding: "44px 36px", fontFamily: FONT.sans, color: fg }}>
          <Icon size={78} color={fg} strokeWidth={2.6} />
          <div style={{ fontWeight: 900, fontSize: fitSize(node.title, 58, 350), marginTop: 10, lineHeight: 1.1, whiteSpace: "nowrap" }}>{node.title}</div>
          {node.sub && <div style={{ fontWeight: 700, fontSize: fitSize(node.sub, 36, 350), opacity: 0.8, marginTop: 4, whiteSpace: "nowrap" }}>{node.sub}</div>}
        </div>
      </PaperCard>
      <Pin x={x + w / 2} y={y + 18} enterAt={enterAt + 4} color={node.highlight ? "#F2EBDD" : undefined} />
    </>
  );
};

export const Board: React.FC<{ nodes: CardNode[]; caption: string; emphasis: string; emStyle: "stamp" | "marker" }> = ({ nodes, caption, emphasis, emStyle }) => {
  const slots =
    nodes.length === 2
      ? [
          { x: 470, y: 500, rotate: -4 },
          { x: 1120, y: 420, rotate: 3 },
        ]
      : [
          { x: 150, y: 560, rotate: -4 },
          { x: 760, y: 470, rotate: 3 },
          { x: 1360, y: 380, rotate: -2 },
        ];
  const W_ = 420;
  const H_ = 330;
  // 원본은 짧은 자막("증여 vs MBO") 기준 720px 고정. 자막이 길면 카드를 넓힌다(오른쪽 카드 줄과 겹치지 않는 1150px까지).
  const capW = Math.min(1150, Math.max(720, Math.ceil(textUnits(caption) * 76 * 1.15) + 120));
  const capSize = captionFit(caption, emphasis, 1.45, capW - 90, 76);
  return (
    <>
      <PaperCard x={MARGIN} y={150} w={capW} h={250} rotate={-1.5} color={NOTE} enter="left" enterAt={0}>
        <div style={{ padding: "26px 40px" }}>
          <Caption text={caption} emphasis={emphasis} emStyle={emStyle} size={capSize} emScale={1.45} />
        </div>
      </PaperCard>
      <Tape x={MARGIN + 290} y={136} w={150} rotate={3} />
      {nodes.slice(0, 3).map((node, i) => (
        <NoteCard key={node.title} node={node} {...slots[i]} w={W_} h={H_} enterAt={6 + i * 14} />
      ))}
      {nodes.slice(1, 3).map((_, i) => {
        const a = slots[i];
        const b = slots[i + 1];
        return <HandArrow key={i} from={[a.x + W_ + 10, a.y + H_ / 2]} to={[b.x - 14, b.y + H_ / 2 + 10]} start={6 + (i + 1) * 14 - 4} dur={9} bend={-0.25} />;
      })}
    </>
  );
};

// ---------------------------------------------------------------- 5. 오려 붙인 헤드라인

const Scrap: React.FC<{ text: string; at: number; em: boolean; emStyle: "stamp" | "marker"; serif: boolean; seed: string }> = ({ text, at, em, emStyle, serif, seed }) => {
  const P = usePalette();
  const twos = useTwos();
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: (em && emStyle === "stamp" ? frame : twos) - at, fps, config: em ? SPRING.pop : SPRING.enter });
  if (p <= 0.001) return null;
  const rot = (random(seed) - 0.5) * 6;
  const slam = em && emStyle === "stamp" ? 1.5 - 0.5 * p : 1;
  return (
    <div
      style={{
        position: "relative",
        display: "inline-block",
        margin: "14px 14px",
        padding: "6px 30px 14px",
        transform: `translateY(${(1 - p) * (em ? 0 : -40)}px) rotate(${rot}deg) scale(${slam})`,
        opacity: Math.min(1, p * 2),
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: em ? P.spotPaper : NOTE,
          filter: "url(#rough-torn) drop-shadow(0 8px 10px rgba(0,0,0,0.35))",
        }}
      />
      <span
        style={{
          position: "relative",
          fontFamily: serif ? FONT.serif : FONT.sans,
          fontWeight: 900,
          fontSize: 130,
          color: em ? P.onSpot : "#1B1B1B",
          letterSpacing: -2,
          whiteSpace: "nowrap",
        }}
      >
        {text}
      </span>
    </div>
  );
};

export const CutHeadline: React.FC<{ caption: string; emphasis: string; emStyle: "stamp" | "marker"; sub?: string; underline?: boolean; serif: boolean; slow?: boolean }> = ({
  caption,
  emphasis,
  emStyle,
  sub,
  underline,
  serif,
  slow,
}) => {
  const P = usePalette();
  const frame = useCurrentFrame();
  const step = slow ? 8 : 6;
  const idx = caption.indexOf(emphasis);
  const pieces = [
    ...caption.slice(0, Math.max(0, idx)).split(" ").filter(Boolean).map((t) => ({ t, em: false })),
    ...(idx >= 0 ? [{ t: emphasis, em: true }] : []),
    ...caption.slice(idx >= 0 ? idx + emphasis.length : 0).split(" ").filter(Boolean).map((t) => ({ t, em: false })),
  ];
  const plainCount = pieces.filter((x) => !x.em).length;
  const emAt = plainCount * step + 6;
  let k = 0;
  const shake = useImpactShake(emAt);
  // Typewriter sub line.
  const typed = sub ? sub.slice(0, Math.max(0, Math.floor((frame - emAt - 6) * 1.6))) : "";
  const underlineT = interpolate(frame, [emAt + 10, emAt + 22], [0, 1], CLAMP);

  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", transform: shake }}>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", maxWidth: 1600 }}>
        {pieces.map((piece, i) => (
          <Scrap key={i} text={piece.t} at={piece.em ? emAt : k++ * step} em={piece.em} emStyle={emStyle} serif={serif} seed={`${caption}-${i}`} />
        ))}
      </div>
      {underline && (
        <svg width={900} height={40} style={{ marginTop: 6 }}>
          <path d="M10 22 C 200 8, 420 34, 620 18 S 860 14, 890 24" fill="none" stroke={P.spot} strokeWidth={10} strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - underlineT} />
        </svg>
      )}
      {sub && (
        <div style={{ marginTop: 40, fontFamily: FONT.mono, fontWeight: 700, fontSize: 40, color: P.muted, minHeight: 50 }}>
          {typed}
          {typed.length < sub.length && typed.length > 0 && <span style={{ opacity: frame % 10 < 5 ? 1 : 0 }}>▍</span>}
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------- 4. 좌우 분할 + 찢은 종이 막대

export const TornBars: React.FC<{ bars: Bar[]; caption: string; emphasis: string; emStyle: "stamp" | "marker" }> = ({ bars, caption, emphasis, emStyle }) => {
  const P = usePalette();
  const twos = useTwos();
  const { fps } = useVideoConfig();
  const max = Math.max(...bars.map((b) => b.value));
  const BAR_H = 470;
  // Fewer bars get wider strips; the sheet always stays inside the frame.
  // 원본은 막대 2~3개 기준. 사이트 각본은 5개까지 오므로 종이 폭(여백 제외 860px)에 맞춰 막대·간격을 줄인다.
  const n = bars.length;
  const SHEET_X = 820;
  const SHEET_W = 1000;
  const fitUnit = (SHEET_W - 140) / (n + (n - 1) * 0.5);
  const BAR_W = Math.min(n > 2 ? 190 : 230, Math.floor(fitUnit));
  const GAP = Math.min(n > 2 ? 100 : 150, Math.floor(fitUnit * 0.5));
  const chartW = n * BAR_W + (n - 1) * GAP;
  // 막대마다 글자 크기가 달라 보이지 않게, 가장 긴 값·이름에 맞춘 한 크기를 모두에 쓴다(칸 폭의 80%).
  const valueSize = Math.min(...bars.map((b) => fitSize(b.display, 66, (BAR_W + GAP) * 0.8)));
  // 이름은 손글씨라 너무 작으면 안 읽힌다. 최소 40px, 길면 두 줄로 나뉜다.
  const labelSize = Math.max(40, Math.min(...bars.map((b) => fitSize(b.label, 68, (BAR_W + GAP) * 0.8))));

  return (
    <>
      <div style={{ position: "absolute", left: MARGIN, top: 0, bottom: 0, width: 700, display: "flex", alignItems: "center" }}>
        <Caption text={caption} emphasis={emphasis} emStyle={emStyle} size={captionFit(caption, emphasis, 1.8, 660, 100)} emScale={1.8} />
      </div>
      <PaperCard x={SHEET_X} y={130} w={SHEET_W} h={830} rotate={1.2} color={NOTE} torn enter="right" enterAt={0}>
        <div style={{ position: "absolute", left: (SHEET_W - chartW) / 2, top: 120, width: chartW, height: BAR_H + 120 }}>
          <div style={{ position: "absolute", left: -50, right: -50, top: BAR_H, height: 5, background: "#1B1B1B", opacity: 0.8, filter: "url(#rough-cut)" }} />
          {bars.map((bar, i) => {
            const at = 6 + i * 8;
            const g = spring({ frame: twos - at, fps, config: SPRING.enter });
            const h = (bar.value / max) * BAR_H * Math.max(0, g);
            const label = spring({ frame: twos - at - 12, fps, config: SPRING.enter });
            const x = i * (BAR_W + GAP);
            return (
              <React.Fragment key={bar.label}>
                <div
                  style={{
                    position: "absolute",
                    left: x,
                    top: BAR_H - h,
                    width: BAR_W,
                    height: h,
                    background: bar.highlight ? P.spotPaper : NOTE,
                    backgroundImage: bar.highlight ? undefined : "radial-gradient(rgba(27,27,27,0.55) 3.4px, transparent 4px)",
                    backgroundSize: "14px 14px",
                    filter: `url(#${bar.highlight ? "rough-torn" : "rough-cut"}) drop-shadow(0 6px 8px rgba(0,0,0,0.25))`,
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    left: x - GAP / 2,
                    width: BAR_W + GAP,
                    top: BAR_H - h - 92,
                    textAlign: "center",
                    fontFamily: FONT.sans,
                    fontWeight: 900,
                    fontSize: valueSize,
                    color: bar.highlight ? P.spot : "#1B1B1B",
                    whiteSpace: "nowrap",
                    opacity: label,
                  }}
                >
                  {bar.display}
                </div>
                <div style={{ position: "absolute", left: x - GAP / 2, width: BAR_W + GAP, top: BAR_H + 22, textAlign: "center", fontFamily: FONT.pen, fontSize: labelSize, lineHeight: 1, wordBreak: "keep-all", color: "#1B1B1B", opacity: g > 0 ? 1 : 0 }}>
                  {bar.label}
                </div>
              </React.Fragment>
            );
          })}
        </div>
      </PaperCard>
    </>
  );
};

// ---------------------------------------------------------------- 2. 줄에 걸린 일정 카드

export const Timeline: React.FC<{ nodes: CardNode[]; caption: string; emphasis: string; emStyle: "stamp" | "marker" }> = ({ nodes, caption, emphasis, emStyle }) => {
  const P = usePalette();
  const frame = useCurrentFrame();
  const line = interpolate(frame, [0, 8], [0, 1], CLAMP);
  const LINE_Y = 470;
  // Two cards sit centered under the string; three spread across it.
  const xs = nodes.length === 2 ? [470, 1030] : [190, 750, 1310];
  return (
    <>
      <div style={{ position: "absolute", left: MARGIN, top: 170 }}>
        <Caption text={caption} emphasis={emphasis} emStyle={emStyle} size={captionFit(caption, emphasis, 1.6, 1500, 88)} emScale={1.6} />
      </div>
      <svg width={1920} height={1080} style={{ position: "absolute", left: 0, top: 0 }}>
        <path
          d={`M120 ${LINE_Y} Q 960 ${LINE_Y + 50} 1800 ${LINE_Y - 6}`}
          fill="none"
          stroke={P.ink}
          strokeWidth={4}
          pathLength={1}
          strokeDasharray={1}
          strokeDashoffset={1 - line}
        />
      </svg>
      {nodes.slice(0, 3).map((node, i) => {
        const Icon = iconOf(node.icon);
        const fg = node.highlight ? P.onSpot : "#1B1B1B";
        const x = xs[i];
        const sag = 50 * (1 - Math.pow((x + 210 - 960) / 840, 2));
        const at = 4 + i * 6;
        return (
          <React.Fragment key={node.title}>
            <PaperCard x={x} y={LINE_Y + sag - 6} w={420} h={300} rotate={[-3, 2, -1.5][i]} color={node.highlight ? P.spotPaper : NOTE} enterAt={at} enter="drop">
              <div style={{ padding: "50px 36px", fontFamily: FONT.sans, color: fg }}>
                <Icon size={60} color={fg} strokeWidth={2.6} />
                <div style={{ fontWeight: 900, fontSize: fitSize(node.title, 52, 350), marginTop: 8, whiteSpace: "nowrap" }}>{node.title}</div>
                {node.sub && <div style={{ fontWeight: 700, fontSize: fitSize(node.sub, 32, 350), opacity: 0.85, whiteSpace: "nowrap" }}>{node.sub}</div>}
              </div>
            </PaperCard>
            <Tape x={x + 150} y={LINE_Y + sag - 26} w={120} rotate={[4, -3, 2][i]} enterAt={at + 2} />
          </React.Fragment>
        );
      })}
    </>
  );
};

// ---------------------------------------------------------------- 5. 도장 찍힌 문서

export const StampDoc: React.FC<{ stamp: string; docTitle: string; caption: string; emphasis: string }> = ({ stamp, docTitle, caption, emphasis }) => {
  const STAMP_AT = 12;
  const shake = useImpactShake(STAMP_AT);
  const lead = caption.split(emphasis);
  const P = usePalette();
  return (
    <div style={{ position: "absolute", inset: 0, transform: shake }}>
      <div style={{ position: "absolute", left: 0, right: 0, top: 160, textAlign: "center", fontFamily: FONT.sans, fontWeight: 900, fontSize: 84, color: P.ink }}>
        {lead[0]}
        <span style={{ position: "relative", display: "inline-block", padding: "0 10px" }}>
          <Highlighter start={STAMP_AT + 4} color={P.paper === "#1C1B19" ? P.spot : "#1B1B1B"} />
          <span style={{ position: "relative" }}>{emphasis}</span>
        </span>
        {lead[1]}
      </div>
      <PaperCard x={560} y={330} w={800} h={520} rotate={2} color={NOTE} enter="up" enterAt={0}>
        <div style={{ padding: "54px 60px", fontFamily: FONT.mono, fontWeight: 700, color: "#1B1B1B" }}>
          <div style={{ fontSize: 46 }}>{docTitle}</div>
          <div style={{ height: 3, background: "#1B1B1B", margin: "18px 0 28px", opacity: 0.7 }} />
          {Array.from({ length: 6 }, (_, r) => (
            <div key={r} style={{ height: 12, marginBottom: 20, width: `${60 + random(`doc-${r}`) * 38}%`, background: "#1B1B1B", opacity: 0.15, borderRadius: 3 }} />
          ))}
        </div>
        <div style={{ position: "absolute", right: 60, bottom: 70 }}>
          <Stamp text={stamp} at={STAMP_AT} size={170} rotate={-12} color={P.paper} />
        </div>
      </PaperCard>
    </div>
  );
};

// ---------------------------------------------------------------- 엔드카드

export const EndCardView: React.FC<{ title: string; tagline: string; source: string }> = ({ title, tagline, source }) => {
  const P = usePalette();
  const frame = useCurrentFrame();
  const t = interpolate(frame, [14, 26], [0, 1], CLAMP);
  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", transform: useImpactShake(4) }}>
      <Stamp text={title} at={4} size={150} rotate={-4} color={P.ink} />
      <div style={{ fontFamily: FONT.pen, fontSize: 72, color: P.ink, marginTop: 40, opacity: t, transform: `translateY(${(1 - t) * 14}px)` }}>{tagline}</div>
      <div style={{ fontFamily: FONT.mono, fontWeight: 700, fontSize: 26, color: P.muted, marginTop: 60, opacity: t }}>{source}</div>
    </div>
  );
};
