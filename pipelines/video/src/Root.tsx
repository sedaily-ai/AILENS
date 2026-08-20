import React from 'react';
import { Composition } from 'remotion';
import { NewsVideo, scriptDurationInFrames } from './compositions/NewsVideo';
import { parseNewsScript, FORMAT_DIMENSIONS, COMPOSITION_ID } from './lib/schema';
import sampleJson from '../data/sample.json';

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
