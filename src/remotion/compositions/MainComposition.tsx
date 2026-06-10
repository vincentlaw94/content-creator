import React from "react";
import {
  AbsoluteFill,
  Sequence,
  Video,
  Audio,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  Easing,
} from "remotion";

interface Clip {
  src: string;
  startFrame: number;
  durationInFrames: number;
  effects?: string[];
}

interface MusicTrack {
  src: string;
  volume: number;
}

interface MainCompositionProps {
  clips: Clip[];
  music?: MusicTrack;
}

export const MainComposition: React.FC<MainCompositionProps> = ({
  clips,
  music,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  return (
    <AbsoluteFill style={{ backgroundColor: "black" }}>
      {/* Video clips */}
      {clips.map((clip, index) => (
        <Sequence
          key={index}
          from={clip.startFrame}
          durationInFrames={clip.durationInFrames}
        >
          <ClipWithEffects clip={clip} />
        </Sequence>
      ))}

      {/* Background music */}
      {music && (
        <Audio
          src={music.src}
          volume={music.volume}
          startFrom={0}
        />
      )}
    </AbsoluteFill>
  );
};

interface ClipWithEffectsProps {
  clip: Clip;
}

const ClipWithEffects: React.FC<ClipWithEffectsProps> = ({ clip }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Parse effects
  const effects = clip.effects || [];
  let scale = 1;
  let playbackRate = 1;
  let saturation = 1;
  let brightness = 1;

  for (const effect of effects) {
    const [type, value] = effect.split(":");
    switch (type) {
      case "zoom":
        scale = parseFloat(value);
        break;
      case "speed":
        playbackRate = parseFloat(value);
        break;
      case "saturation":
        saturation = parseFloat(value);
        break;
      case "brightness":
        brightness = parseFloat(value);
        break;
    }
  }

  // Fade in/out
  const fadeInDuration = Math.min(15, clip.durationInFrames / 4);
  const fadeOutStart = clip.durationInFrames - 15;

  const opacity = interpolate(
    frame,
    [0, fadeInDuration, fadeOutStart, clip.durationInFrames],
    [0, 1, 1, 0],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }
  );

  // Ken Burns effect (subtle zoom/pan)
  const kenBurnsScale = interpolate(
    frame,
    [0, clip.durationInFrames],
    [scale, scale * 1.05],
    {
      easing: Easing.linear,
    }
  );

  return (
    <AbsoluteFill
      style={{
        opacity,
        transform: `scale(${kenBurnsScale})`,
        filter: `saturate(${saturation}) brightness(${brightness})`,
      }}
    >
      <Video
        src={clip.src}
        playbackRate={playbackRate}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
        }}
      />
    </AbsoluteFill>
  );
};
