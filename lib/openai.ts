import OpenAI from "openai";

let client: OpenAI | undefined;

export function getOpenAI() {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  client ??= new OpenAI({ apiKey });
  return client;
}

export const openAIModels = {
  text: process.env.OPENAI_TEXT_MODEL ?? "gpt-4.1",
  vision: process.env.OPENAI_VISION_MODEL ?? "gpt-4.1",
  image: process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-2",
  transcription: process.env.OPENAI_TRANSCRIPTION_MODEL ?? "whisper-1",
} as const;
