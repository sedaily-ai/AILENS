import { TextToSpeechClient, protos } from '@google-cloud/text-to-speech';

export type TtsVoiceConfig = {
  languageCode: string;
  name: string;
  speakingRate?: number;
  pitch?: number;
};

// `npm run tts:voices`로 seodaily-eng-reporting 프로젝트에서 직접 확인한 ko-KR 보이스 41개 중
// Chirp3-HD(최신 고품질 모델, SSML <break> 지원)를 기본값으로 사용. 다른 보이스로 바꾸려면
// TTS_VOICE_NAME 환경변수를 쓰거나 이 값을 바꾸면 된다.
export const DEFAULT_VOICE: TtsVoiceConfig = {
  languageCode: 'ko-KR',
  name: process.env.TTS_VOICE_NAME ?? 'ko-KR-Chirp3-HD-Kore',
  speakingRate: 1.0,
  pitch: 0,
};

let cachedClient: TextToSpeechClient | null = null;

function getClient(): TextToSpeechClient {
  if (!cachedClient) {
    cachedClient = new TextToSpeechClient();
  }
  return cachedClient;
}

export async function synthesizeSpeech(
  ssml: string,
  voice: TtsVoiceConfig = DEFAULT_VOICE
): Promise<Buffer> {
  const client = getClient();

  let response: protos.google.cloud.texttospeech.v1.ISynthesizeSpeechResponse;
  try {
    [response] = await client.synthesizeSpeech({
      input: { ssml },
      voice: { languageCode: voice.languageCode, name: voice.name },
      audioConfig: {
        audioEncoding: 'MP3',
        speakingRate: voice.speakingRate,
        pitch: voice.pitch,
      },
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Google Cloud TTS 요청 실패 (voice: ${voice.name}): ${reason}\n` +
        '  - GOOGLE_APPLICATION_CREDENTIALS 환경변수 또는 `gcloud auth application-default login`이 되어 있는지 확인하세요.\n' +
        '  - 대상 GCP 프로젝트에서 Cloud Text-to-Speech API가 활성화되어 있는지 확인하세요.\n' +
        '  - `npm run tts:voices`로 voice 이름이 실제로 존재하는지 확인하세요.'
    );
  }

  if (!response.audioContent) {
    throw new Error('TTS 응답에 오디오 데이터(audioContent)가 없습니다.');
  }

  return Buffer.from(response.audioContent as Uint8Array);
}

export async function listKoreanVoices() {
  const client = getClient();
  try {
    const [result] = await client.listVoices({ languageCode: 'ko-KR' });
    return result.voices ?? [];
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Google Cloud TTS 인증/연결 실패: ${reason}\n` +
        '  - `gcloud auth application-default login`으로 ADC를 다시 발급받으세요.\n' +
        '  - 또는 서비스 계정 키 파일 경로를 GOOGLE_APPLICATION_CREDENTIALS 환경변수로 지정하세요.\n' +
        '  - 대상 GCP 프로젝트에서 Cloud Text-to-Speech API가 활성화되어 있는지도 확인하세요.'
    );
  }
}
