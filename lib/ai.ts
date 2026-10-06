import { z } from "zod";
import { getOpenAI, openAIModels } from "@/lib/openai";
export type ReferenceImage = { id: string; bytes: Uint8Array; mime: string };
export async function structured<T>(
  name: string,
  schema: z.ZodType<T>,
  prompt: string,
  images: ReferenceImage[] = [],
) {
  const content: Array<
    | { type: "input_text"; text: string }
    | { type: "input_image"; image_url: string; detail: "high" }
  > = [{ type: "input_text", text: prompt }];
  for (const image of images) {
    content.push({ type: "input_text", text: `SOURCE IMAGE ID: ${image.id}` });
    content.push({
      type: "input_image",
      image_url: `data:${image.mime};base64,${Buffer.from(image.bytes).toString("base64")}`,
      detail: "high",
    });
  }
  const response = await getOpenAI().responses.create({
    model: images.length ? openAIModels.vision : openAIModels.text,
    input: [{ role: "user", content }],
    text: {
      format: {
        type: "json_schema",
        name,
        strict: true,
        schema: z.toJSONSchema(schema) as Record<string, unknown>,
      },
    },
  });
  return {
    data: schema.parse(JSON.parse(response.output_text)),
    responseId: response.id,
    model: images.length ? openAIModels.vision : openAIModels.text,
  };
}
