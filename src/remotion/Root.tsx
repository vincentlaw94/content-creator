import { Composition } from "remotion";
import { MainComposition } from "./compositions/MainComposition";
import { TikTokComposition } from "./compositions/TikTokComposition";
import { YouTubeComposition } from "./compositions/YouTubeComposition";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="Main"
        component={MainComposition}
        durationInFrames={900} // 30 seconds at 30fps
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{
          clips: [],
          music: undefined,
        }}
      />
      <Composition
        id="TikTok"
        component={TikTokComposition}
        durationInFrames={900}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{
          clips: [],
          music: undefined,
        }}
      />
      <Composition
        id="YouTube"
        component={YouTubeComposition}
        durationInFrames={900}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{
          clips: [],
          music: undefined,
        }}
      />
    </>
  );
};
