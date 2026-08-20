import { listKoreanVoices } from '../src/lib/tts';

async function main() {
  const voices = await listKoreanVoices();
  if (voices.length === 0) {
    console.log('ko-KR 보이스를 찾지 못했습니다.');
    return;
  }
  console.log(`ko-KR 보이스 ${voices.length}개:\n`);
  for (const voice of voices) {
    console.log(
      `${voice.name}\t${voice.ssmlGender}\t${voice.naturalSampleRateHertz ?? '?'}Hz`
    );
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
