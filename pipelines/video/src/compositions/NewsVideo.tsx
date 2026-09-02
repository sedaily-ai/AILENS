import React from 'react';
import { AbsoluteFill, Audio, staticFile, useVideoConfig } from 'remotion';
import { TransitionSeries, linearTiming } from '@remotion/transitions';
import { fade } from '@remotion/transitions/fade';
import { NewsScript } from '../lib/schema';
import { FONT_FAMILY } from '../styles/tokens';
import { CutRenderer } from './CutRenderer';
import { TRANSITION_SECONDS } from '../lib/animation';
import { BackgroundAtmosphere } from '../components/BackgroundAtmosphere';
import { GrainOverlay } from '../components/GrainOverlay';

// TTS로 해석된 duration(초)이 프레임 경계에서 딱 떨어지지 않을 수 있어
// ceil로 반올림한다 — round/floor를 쓰면 오디오 마지막 일부가 잘릴 수 있다.
const cutFramesOf = (durationSeconds: number, fps: number): number =>
  Math.ceil(durationSeconds * fps);

export const NewsVideo: React.FC<{ script: NewsScript }> = ({ script }) => {
  const { fps } = useVideoConfig();
  const transitionFrames = Math.round(TRANSITION_SECONDS * fps);

  return (
    <AbsoluteFill style={{ fontFamily: FONT_FAMILY }}>
      <BackgroundAtmosphere />
      <TransitionSeries>
        {script.cuts.map((cut, i) => (
          <React.Fragment key={i}>
            <TransitionSeries.Sequence
              durationInFrames={cutFramesOf(cut.duration, fps)}
              layout="none"
            >
              {cut.audioFile ? <Audio src={staticFile(cut.audioFile)} /> : null}
              <CutRenderer
                cut={cut}
                brand={script.brand}
                source={script.source}
                disclaimer={script.disclaimer}
                asOfDate={script.asOfDate}
              />
            </TransitionSeries.Sequence>
            {i < script.cuts.length - 1 ? (
              <TransitionSeries.Transition
                timing={linearTiming({ durationInFrames: transitionFrames })}
                presentation={fade()}
              />
            ) : null}
          </React.Fragment>
        ))}
      </TransitionSeries>
      <GrainOverlay />
    </AbsoluteFill>
  );
};

// 전체 컷 duration 합(초) → 프레임 수에서, 크로스페이드로 겹치는 구간만큼 뺀 실제 타임라인 길이.
// calculateMetadata에서 재사용.
export const scriptDurationInFrames = (script: NewsScript, fps: number): number => {
  const transitionFrames = Math.round(TRANSITION_SECONDS * fps);
  const cutFrames = script.cuts.reduce((sum, cut) => sum + cutFramesOf(cut.duration, fps), 0);
  const overlap = Math.max(script.cuts.length - 1, 0) * transitionFrames;
  return cutFrames - overlap;
};
