import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useVideoPlayer, VideoView } from 'expo-video';
import type { HomePlayerPost, LensItem, LensPost } from '@ailens/api-client';
import { displayHeadline } from '@ailens/domain';
import { WebtoonCuts } from '../../components/WebtoonCuts';
import { colors } from '../../theme';
import { usePlayer } from '../player/PlayerContext';
import { LetterBody } from './LetterBody';

/** 4가지 형식 탭 정의 — 웹 lensPerspectives 의 순서·이름(읽기/웹툰/듣기/영상)과 같다. label 은 API 의 형식 이름. */
export const FORMATS = [
  { label: '레터', tab: '읽기', icon: 'book-outline' as const },
  { label: '웹툰', tab: '웹툰', icon: 'images-outline' as const },
  { label: '팟캐스트', tab: '듣기', icon: 'headset-outline' as const },
  { label: '영상', tab: '영상', icon: 'videocam-outline' as const },
];

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** 준비 중 안내 — 해당 형식의 실제 미디어가 아직 없을 때 대본이라도 보여 준다. */
function Note({ children }: { children: string }) {
  return <Text style={styles.note}>{children}</Text>;
}

export function FormatPanel({ lens, item, scale, onSaveText }: { lens: LensPost; item: LensItem; scale: number; onSaveText?: (text: string) => void }) {
  switch (item.label) {
    case '레터':
      return <LetterPanel lens={lens} item={item} scale={scale} onSaveText={onSaveText} />;
    case '웹툰':
      return <WebtoonPanel item={item} scale={scale} />;
    case '팟캐스트':
      return <PodcastPanel lens={lens} item={item} scale={scale} />;
    case '영상':
      return <VideoPanel item={item} scale={scale} />;
    default:
      return null;
  }
}

function LetterPanel({ lens, item, scale, onSaveText }: { lens: LensPost; item: LensItem; scale: number; onSaveText?: (text: string) => void }) {
  const paragraphs = item.paragraphs ?? [];
  if (paragraphs.length === 0 && item.bullets.length > 0) {
    // 문단이 없으면 질문에 답하는 사실을 번호 목록으로(웹과 같은 폴백).
    return (
      <View>
        <Text style={styles.eyebrow}>이 질문에 답하는 사실 {item.bullets.length}</Text>
        {item.bullets.map((b, i) => (
          <View key={i} style={styles.fact}>
            <Text style={styles.factNo}>{String(i + 1).padStart(2, '0')}</Text>
            <Text style={[styles.factText, { fontSize: 16 * scale, lineHeight: 26 * scale }]}>{b}</Text>
          </View>
        ))}
      </View>
    );
  }
  if (paragraphs.length === 0) {
    return <Note>이 기사의 레터는 아직 만들지 않았어요. 다른 형식을 골라보거나 아래 원문 기사에서 전체 내용을 확인할 수 있어요.</Note>;
  }
  return <LetterBody paragraphs={paragraphs} headline={lens.headline} glossary={item.keywords} summaryBullets={item.bullets} slug={lens.id} scale={scale} onSaveText={onSaveText} />;
}

function WebtoonPanel({ item, scale }: { item: LensItem; scale: number }) {
  const cuts = item.images ?? [];
  if (cuts.length > 0) return <View style={styles.bleed}><WebtoonCuts panels={cuts} /></View>;
  return (
    <View>
      <Note>웹툰 컷은 아직 준비 중이에요. 아래는 컷에 들어갈 대사예요.</Note>
      {item.bullets.map((b, i) => (
        <Text key={i} style={[styles.factText, { marginTop: 12, fontSize: 16 * scale, lineHeight: 26 * scale }]}>
          {b}
        </Text>
      ))}
    </View>
  );
}

function PodcastPanel({ lens, item, scale }: { lens: LensPost; item: LensItem; scale: number }) {
  const player = usePlayer();
  const src = item.media_url;
  // 전역 오디오 플레이어에 "이 글 하나짜리 큐"로 올린다 → 미니 플레이어·잠금화면 컨트롤이 그대로 동작한다.
  const track: HomePlayerPost | null = src
    ? { id: lens.id, title: displayHeadline(item.question || lens.headline), excerpt: '', date: lens.date, published_at: lens.published_at, media_embed_url: src, category: lens.category }
    : null;
  const active = !!track && player.current?.id === track.id;
  const playing = active && player.playing;
  return (
    <View>
      {track ? (
        <View style={styles.audio}>
          <Pressable style={styles.audioBtn} onPress={() => (active ? player.toggle() : player.playQueue([track], 0))} accessibilityRole="button" accessibilityLabel={playing ? '일시정지' : '재생'}>
            <Ionicons name={playing ? 'pause' : 'play'} size={26} color="#fff" style={{ marginLeft: playing ? 0 : 3 }} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.audioKicker}>귀로 듣는 브리핑</Text>
            <Text style={styles.audioTitle} numberOfLines={2}>{displayHeadline(item.question || lens.headline)}</Text>
            <Text style={styles.audioTime}>{active ? `${mmss(player.position)} / ${mmss(player.duration)}` : '재생하면 하단 플레이어에서 이어서 들을 수 있어요'}</Text>
          </View>
        </View>
      ) : (
        <Note>음성 파일은 아직 준비 중이에요. 아래는 브리핑에 들어갈 대본이에요.</Note>
      )}
      {item.transcript ? <Transcript text={item.transcript} scale={scale} /> : item.bullets.length > 0 && !track
        ? item.bullets.map((b, i) => <Text key={i} style={[styles.factText, { marginTop: 12, fontSize: 16 * scale, lineHeight: 26 * scale }]}>{b}</Text>)
        : null}
    </View>
  );
}

function VideoPanel({ item, scale }: { item: LensItem; scale: number }) {
  const url = item.video_url ?? null;
  return (
    <View>
      {url ? <InlineVideo url={url} /> : <Note>영상은 아직 준비 중이에요. 아래는 영상에 들어갈 대본이에요.</Note>}
      {item.transcript ? <Transcript text={item.transcript} scale={scale} /> : null}
      {!url && !item.transcript ? item.bullets.map((b, i) => <Text key={i} style={[styles.factText, { marginTop: 12, fontSize: 16 * scale, lineHeight: 26 * scale }]}>{b}</Text>) : null}
    </View>
  );
}

function InlineVideo({ url }: { url: string }) {
  const player = useVideoPlayer(url, (p) => {
    p.loop = false;
  });
  return (
    <View style={styles.videoWrap}>
      <VideoView player={player} style={styles.video} nativeControls contentFit="contain" allowsPictureInPicture />
    </View>
  );
}

function Transcript({ text, scale }: { text: string; scale: number }) {
  return (
    <View style={styles.transcript}>
      <Text style={styles.tHead}>대본</Text>
      {text.split(/\n{2,}/).map((p, i) => (
        <Text key={i} style={[styles.factText, { marginTop: 10, fontSize: 15.5 * scale, lineHeight: 25 * scale }]}>
          {p.trim()}
        </Text>
      ))}
    </View>
  );
}

export function PhotoHeader({ uri }: { uri?: string | null }) {
  if (!uri) return null;
  return (
    <View style={styles.photo}>
      <Image source={{ uri }} style={styles.photoImg} resizeMode="cover" />
    </View>
  );
}

const styles = StyleSheet.create({
  note: { marginTop: 20, fontSize: 14, lineHeight: 21, color: colors.textMuted },
  eyebrow: { marginTop: 8, fontSize: 12, fontWeight: '800', letterSpacing: 1, color: colors.textFaint },
  fact: { flexDirection: 'row', gap: 12, marginTop: 14 },
  factNo: { width: 26, fontSize: 13, fontWeight: '800', color: '#5b8def', marginTop: 4 },
  factText: { flex: 1, color: '#1f2937' },
  bleed: { marginHorizontal: -20, marginTop: 8 },
  audio: { marginTop: 16, flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: 16, backgroundColor: '#f0f6ff' },
  audioBtn: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  audioKicker: { fontSize: 12, fontWeight: '800', color: colors.beta.text },
  audioTitle: { marginTop: 3, fontSize: 15.5, lineHeight: 22, fontWeight: '700', color: colors.text },
  audioTime: { marginTop: 4, fontSize: 12, color: colors.textMuted },
  videoWrap: { marginTop: 16, marginHorizontal: -20, aspectRatio: 16 / 9, backgroundColor: '#000' },
  video: { width: '100%', height: '100%' },
  transcript: { marginTop: 24, paddingTop: 18, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  tHead: { fontSize: 13, fontWeight: '800', letterSpacing: 1, color: colors.textFaint },
  photo: { marginHorizontal: -20, aspectRatio: 16 / 10, backgroundColor: colors.imagePlaceholder },
  photoImg: { width: '100%', height: '100%' },
});
