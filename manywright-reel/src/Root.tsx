import React from "react";
import { Composition } from "remotion";
import { DURATION, FPS } from "./lib";
import { Reel } from "./Reel";
import { PixelReel } from "./pixel/PixelReel";
import { PixelWeb } from "./pixel/PixelWeb";
import { Local } from "./local/Local";
import { SocialReel, SOCIAL_FPS, SOCIAL_FRAMES } from "./social/SocialReel";

export const Root: React.FC = () => (
  <>
    <Composition id="Reel" component={Reel} durationInFrames={DURATION} fps={FPS} width={1920} height={1080} />
    <Composition id="ReelVertical" component={Reel} durationInFrames={DURATION} fps={FPS} width={1080} height={1920} />
    <Composition id="Pixel" component={PixelReel} durationInFrames={DURATION} fps={FPS} width={1920} height={1080} />
    <Composition id="PixelVertical" component={PixelReel} durationInFrames={DURATION} fps={FPS} width={1080} height={1920} />
    <Composition id="PixelWeb" component={PixelWeb} durationInFrames={DURATION} fps={FPS} width={1920} height={1080} />
    <Composition id="PixelWebVertical" component={PixelWeb} durationInFrames={DURATION} fps={FPS} width={1080} height={1920} />
    <Composition id="LocalFilm" component={Local} durationInFrames={1800} fps={FPS} width={1920} height={1080} />
    <Composition id="LocalFilmVertical" component={Local} durationInFrames={1800} fps={FPS} width={1080} height={1920} />
    <Composition id="SocialReel" component={SocialReel} durationInFrames={SOCIAL_FRAMES} fps={SOCIAL_FPS} width={1080} height={1920} />
  </>
);
