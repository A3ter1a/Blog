declare module 'dplayer' {
  interface DPlayerOptions {
    container: HTMLElement;
    live?: boolean;
    autoplay?: boolean;
    theme?: string;
    loop?: boolean;
    lang?: string;
    screenshot?: boolean;
    hotkey?: boolean;
    preload?: string;
    volume?: number;
    mutex?: boolean;
    video: {
      url: string;
      type?: string;
      customType?: Record<string, Function>;
      pic?: string;
    };
  }

  class DPlayer {
    constructor(options: DPlayerOptions);
    play(): void;
    pause(): void;
    destroy(): void;
    on(event: string, callback: Function): void;
    off(event: string, callback: Function): void;
    seek(time: number): void;
    toggle(): void;
    notice(text: string, time?: number): void;
    switchVideo(video: { url: string; type?: string }): void;
  }

  export default DPlayer;
}
