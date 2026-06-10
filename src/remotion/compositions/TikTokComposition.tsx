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
  Img,
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

interface TikTokCompositionProps {
  clips: Clip[];
  music?: MusicTrack;
  caption?: string;
  hashtags?: string[];
}

export const TikTokComposition: React.FC<TikTokCompositionProps> = ({
  clips,
  music,
  caption,
  hashtags,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames, width, height } = useVideoConfig();

  return (
    <AbsoluteFill style={{ backgroundColor: "black" }}>
      {/* Video clips - scaled for 9:16 */}
      {clips.map((clip, index) => (
        <Sequence
          key={index}
          from={clip.startFrame}
          durationInFrames={clip.durationInFrames}
        >
          <VerticalClip clip={clip} />
        </Sequence>
      ))}

      {/* Caption overlay (TikTok style) */}
      {caption && (
        <Sequence from={0} durationInFrames={durationInFrames}>
          <CaptionOverlay caption={caption} hashtags={hashtags} />
        </Sequence>
      )}

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

interface VerticalClipProps {
  clip: Clip;
}

const VerticalClip: React.FC<VerticalClipProps> = ({ clip }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  // Parse effects
  const effects = clip.effects || [];
  let scale = 1.2; // Default slight zoom for vertical
  let playbackRate = 1;
  let saturation = 1.1; // Slight saturation boost for TikTok

  for (const effect of effects) {
    const [type, value] = effect.split(":");
    switch (type) {
      case "zoom":
        scale = parseFloat(value) * 1.1;
        break;
      case "speed":
        playbackRate = parseFloat(value);
        break;
      case "saturation":
        saturation = parseFloat(value);
        break;
    }
  }

  // Dynamic entry animation
  const entryDuration = 10;
  const entryScale = interpolate(
    frame,
    [0, entryDuration],
    [1.1, 1],
    {
      extrapolateRight: "clamp",
      easing: Easing.out(Easing.cubic),
    }
  );

  // Fade transitions
  const fadeInDuration = 8;
  const fadeOutStart = clip.durationInFrames - 8;

  const opacity = interpolate(
    frame,
    [0, fadeInDuration, fadeOutStart, clip.durationInFrames],
    [0, 1, 1, 0],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }
  );

  return (
    <AbsoluteFill
      style={{
        opacity,
        transform: `scale(${scale * entryScale})`,
        filter: `saturate(${saturation})`,
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

interface CaptionOverlayProps {
  caption: string;
  hashtags?: string[];
}

const CaptionOverlay: React.FC<CaptionOverlayProps> = ({ caption, hashtags }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  // Fade in caption
  const opacity = interpolate(
    frame,
    [15, 30],
    [0, 1],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }
  );

  return (
    <AbsoluteFill
      style={{
        justifyContent: "flex-end",
        padding: "0 40px 180px 40px",
        opacity,
      }}
    >
      <div
        style={{
          color: "white",
          fontSize: 32,
          fontWeight: "bold",
          textShadow: "2px 2px 4px rgba(0,0,0,0.8)",
          lineHeight: 1.3,
        }}
      >
        {caption}
      </div>
      {hashtags && hashtags.length > 0 && (
        <div
          style={{
            color: "white",
            fontSize: 24,
            marginTop: 16,
            textShadow: "1px 1px 2px rgba(0,0,0,0.8)",
          }}
        >
          {hashtags.slice(0, 5).join(" ")}
        </div>
      )}
    </AbsoluteFill>
  );
};
