export type MediaKind = 'audio' | 'video';
export type SupportedVideoCodecType = 'vp8' | 'vp9' | 'h264' | 'h265';
export type ParsedUserAgent = {
  ua: string;
  browser: {
    name: string;
    version: string;
    major: string;
  };
  engine: {
    name: string;
    version: string;
  };
  os: {
    name: string;
    version: string;
  };
  device: Record<string, unknown>; // or `{}` if always empty
  cpu: {
    architecture: string;
  };
};
// export type EvaluatorMiddleware = Middleware<EvaluatorContext>;
