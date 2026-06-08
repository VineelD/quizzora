const nextConfig = {
  // pdfkit reads standard fonts via __dirname + '/data/*.afm'; bundling breaks that path (C:\ROOT).
  serverExternalPackages: ["pdfkit", "@xenova/transformers", "onnxruntime-node"],
  allowedDevOrigins: ["127.0.0.1"],
  env: {
    NEXT_PUBLIC_STUDY_COACH_NARRATION_ENABLED:
      process.env.STUDY_COACH_NARRATION_ENABLED
      ?? process.env.NEXT_PUBLIC_STUDY_COACH_NARRATION_ENABLED
      ?? "false",
    NEXT_PUBLIC_STUDY_COACH_SPEECH_INPUT_ENABLED:
      process.env.STUDY_COACH_SPEECH_INPUT_ENABLED
      ?? process.env.NEXT_PUBLIC_STUDY_COACH_SPEECH_INPUT_ENABLED
      ?? "true",
  },
};

export default nextConfig;
