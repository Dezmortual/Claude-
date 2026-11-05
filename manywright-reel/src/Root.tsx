import React from "react";
import { Composition } from "remotion";
import { DURATION, FPS } from "./lib";
import { Reel } from "./Reel";

export const Root: React.FC = () => (
  <>
    <Composition id="Reel" component={Reel} durationInFrames={DURATION} fps={FPS} width={1920} height={1080} />
    <Composition id="ReelVertical" component={Reel} durationInFrames={DURATION} fps={FPS} width={1080} height={1920} />
  </>
);
