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
  transition?: string;
}

interface MusicTrack {
  src: string;
  volume: number;
}

interface YouTubeCompositionProps {
  clips: Clip[];
  music?: MusicTrack;
  title?: string;
  showIntro?: boolean;
  showOutro?: boolean;
}

export const YouTubeComposition: React.FC<YouTubeCompositionProps> = ({
  clips,
  music,
  title,
  showIntro = false,
  showOutro = false,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const introFrames = showIntro ? 60 : 0;
  const outroFrames = showOutro ? 90 : 0;

  return (
    <AbsoluteFill style={{ backgroundColor: "black" }}>
      {/* Intro */}
      {showIntro && (
        <Sequence from={0} durationInFrames={introFrames}>
          <IntroSequence title={title || ""} />
        </Sequence>
      )}

      {/* Video clips */}
      {clips.map((clip, index) => (
        <Sequence
          key={index}
          from={clip.startFrame + introFrames}
          durationInFrames={clip.durationInFrames}
        >
          <YouTubeClip clip={clip} />
        </Sequence>
      ))}

      {/* Outro */}
      {showOutro && (
        <Sequence
          from={durationInFrames - outroFrames}
          durationInFrames={outroFrames}
        >
          <OutroSequence />
        </Sequence>
      )}

      {/* Background music - lower volume for YouTube */}
      {music && (
        <Audio
          src={music.src}
          volume={music.volume * 0.7} // Lower for YouTube
          startFrom={0}
        />
      )}
    </AbsoluteFill>
  );
};

interface YouTubeClipProps {
  clip: Clip;
}

const YouTubeClip: React.FC<YouTubeClipProps> = ({ clip }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Parse effects
  const effects = clip.effects || [];
  let scale = 1;
  let playbackRate = 1;
  let saturation = 1;
  let brightness = 1;
  let contrast = 1;

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
      case "contrast":
        contrast = parseFloat(value);
        break;
    }
  }

  // Parse transition
  const transition = clip.transition || "";
  let transitionOpacity = 1;
  let transitionScale = scale;

  if (transition.startsWith("crossfade:")) {
    const duration = parseFloat(transition.split(":")[1]) * fps;
    transitionOpacity = interpolate(
      frame,
      [0, duration, clip.durationInFrames - duration, clip.durationInFrames],
      [0, 1, 1, 0],
      {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      }
    );
  }

  // Cinematic Ken Burns
  const kenBurnsScale = interpolate(
    frame,
    [0, clip.durationInFrames],
    [scale, scale * 1.03],
    {
      easing: Easing.linear,
    }
  );

  return (
    <AbsoluteFill
      style={{
        opacity: transitionOpacity,
        transform: `scale(${kenBurnsScale})`,
        filter: `saturate(${saturation}) brightness(${brightness}) contrast(${contrast})`,
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

interface IntroSequenceProps {
  title: string;
}

const IntroSequence: React.FC<IntroSequenceProps> = ({ title }) => {
  const frame = useCurrentFrame();

  const titleOpacity = interpolate(
    frame,
    [15, 30, 45, 60],
    [0, 1, 1, 0],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }
  );

  const titleY = interpolate(
    frame,
    [15, 30],
    [30, 0],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.out(Easing.cubic),
    }
  );

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "black",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <div
        style={{
          color: "white",
          fontSize: 64,
          fontWeight: "bold",
          opacity: titleOpacity,
          transform: `translateY(${titleY}px)`,
          textAlign: "center",
          maxWidth: "80%",
        }}
      >
        {title}
      </div>
    </AbsoluteFill>
  );
};

const OutroSequence: React.FC = () => {
  const frame = useCurrentFrame();

  const opacity = interpolate(
    frame,
    [0, 30],
    [0, 1],
    {
      extrapolateRight: "clamp",
    }
  );

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "rgba(0,0,0,0.9)",
        justifyContent: "center",
        alignItems: "center",
        opacity,
      }}
    >
      <div
        style={{
          color: "white",
          fontSize: 48,
          fontWeight: "bold",
          textAlign: "center",
        }}
      >
        Thanks for watching!
      </div>
      <div
        style={{
          color: "#aaa",
          fontSize: 32,
          marginTop: 24,
        }}
      >
        Like & Subscribe for more
      </div>
    </AbsoluteFill>
  );
};
