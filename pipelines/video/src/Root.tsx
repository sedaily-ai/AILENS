import React from 'react';
import { Composition } from 'remotion';
import { NewsVideo, scriptDurationInFrames } from './compositions/NewsVideo';
import { parseNewsScript, FORMAT_DIMENSIONS, COMPOSITION_ID } from './lib/schema';
import { ensureKoreanFontLoaded } from './lib/fonts';
import sampleJson from '../data/sample.json';

// 렌더 시작 전에 한글 폰트를 반드시 로드해둔다(2026-08-23, lib/fonts.ts
// 상단 설명 참조 — 이게 없어서 실제 영상에 한글이 군데군데 깨져 나왔다).
ensureKoreanFontLoaded();

const FPS = 30;
const sampleScript = parseNewsScript(sampleJson);

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id={COMPOSITION_ID.vertical}
        component={NewsVideo}
        fps={FPS}
        width={FORMAT_DIMENSIONS.vertical.width}
        height={FORMAT_DIMENSIONS.vertical.height}
        durationInFrames={scriptDurationInFrames(sampleScript, FPS)}
        defaultProps={{ script: sampleScript }}
        calculateMetadata={async ({ props }) => ({
          durationInFrames: scriptDurationInFrames(props.script, FPS),
        })}
      />
      <Composition
        id={COMPOSITION_ID.horizontal}
        component={NewsVideo}
        fps={FPS}
        width={FORMAT_DIMENSIONS.horizontal.width}
        height={FORMAT_DIMENSIONS.horizontal.height}
        durationInFrames={scriptDurationInFrames(sampleScript, FPS)}
        defaultProps={{ script: sampleScript }}
        calculateMetadata={async ({ props }) => ({
          durationInFrames: scriptDurationInFrames(props.script, FPS),
        })}
      />
    </>
  );
};
