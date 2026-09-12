import "server-only";
import OpenAI from "openai";
import { buildGenerationPrompt } from "@/lib/ai-visualization";

const GENERATION_TIMEOUT_MS = 170_000;

export function getOpenAiConfig() {
  const apiKey = process.env.OPENAI_API_KEY?.trim() || "";
  const textModel = process.env.OPENAI_TEXT_MODEL?.trim() || "gpt-6-astra";
  const imageModel =
    process.env.OPENAI_IMAGE_MODEL?.trim() || "gpt-image-2.5-sunburst";
  return { apiKey, textModel, imageModel };
}

export function createOpenAiClient(apiKey = getOpenAiConfig().apiKey) {
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }
  return new OpenAI({
    apiKey,
    timeout: GENERATION_TIMEOUT_MS,
  });
}

export type OpenAiImageResult =
  | {
      kind: "image";
      responseId: string;
      bytes: Buffer;
      mimeType: "image/jpeg" | "image/png";
    }
  | {
      kind: "text";
      responseId: string;
      text: string;
    };

// `input_fidelity` is only supported by the gpt-image-1 family. Newer image
// models (e.g. gpt-image-2.5-*) reject it with a 400
// `invalid_input_fidelity_model` error, so only send it when supported.
function supportsInputFidelity(imageModel: string) {
  return /^gpt-image-1(\b|[.-])/i.test(imageModel);
}

function imageTool(size: string, imageModel: string) {
  return {
    type: "image_generation" as const,
    model: imageModel,
    quality: "high" as const,
    size,
    action: "edit" as const,
    ...(supportsInputFidelity(imageModel)
      ? { input_fidelity: "high" as const }
      : {}),
    output_format: "jpeg" as const,
    background: "opaque" as const,
  };
}

function decodeImageResult(result: string) {
  const bytes = Buffer.from(result, "base64");
  const isPng = bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50;
  return {
    bytes,
    mimeType: (isPng ? "image/png" : "image/jpeg") as "image/jpeg" | "image/png",
  };
}

function extractImageCall(response: OpenAI.Responses.Response) {
  return response.output.find(
    (item): item is OpenAI.Responses.ResponseOutputItem.ImageGenerationCall =>
      item.type === "image_generation_call",
  );
}

export async function generateArchitecturalImage(input: {
  imageDataUrl: string;
  size: string;
  visitorInstruction?: string;
  previousResponseId?: string;
  apiKey?: string;
}): Promise<OpenAiImageResult> {
  const { textModel, imageModel } = getOpenAiConfig();
  const client = createOpenAiClient(input.apiKey);
  const prompt = buildGenerationPrompt(input.visitorInstruction);
  const followUp = Boolean(input.previousResponseId);

  const response = await client.responses.create(
    {
      model: textModel,
      instructions: buildGenerationPrompt(),
      previous_response_id: input.previousResponseId,
      input: followUp
        ? [
            {
              role: "user",
              content: [{ type: "input_text", text: prompt }],
            },
          ]
        : [
            {
              role: "user",
              content: [
                {
                  type: "input_image",
                  image_url: input.imageDataUrl,
                  detail: "high",
                },
                { type: "input_text", text: prompt },
              ],
            },
          ],
      tools: [imageTool(input.size, imageModel)],
      tool_choice: { type: "image_generation" },
    },
    { timeout: GENERATION_TIMEOUT_MS },
  );

  const imageCall = extractImageCall(response);
  if (imageCall?.result && imageCall.status !== "failed") {
    const decoded = decodeImageResult(imageCall.result);
    return {
      kind: "image",
      responseId: response.id,
      bytes: decoded.bytes,
      mimeType: decoded.mimeType,
    };
  }

  if (imageCall?.status === "failed") {
    throw new Error(
      "OpenAI image generation failed. Check OPENAI_TEXT_MODEL and OPENAI_IMAGE_MODEL.",
    );
  }

  const text =
    response.output_text?.trim() ||
    "The visualization model did not return an image for this viewpoint.";
  return {
    kind: "text",
    responseId: response.id,
    text,
  };
}

export function formatOpenAiError(error: unknown) {
  if (!error || typeof error !== "object") {
    return "The visualization could not be created. Please try again.";
  }
  const record = error as {
    message?: string;
    status?: number;
    code?: string;
    error?: { message?: string; code?: string; type?: string };
  };
  const detail = record.error?.message || record.message || "";
  const code = record.error?.code || record.code || "";
  console.error("[ai-openai]", record.status ?? "", code, detail);

  if (/incorrect api key|invalid_api_key|authentication/i.test(detail + code)) {
    return "OpenAI rejected the API key. Check OPENAI_API_KEY.";
  }
  if (/model/i.test(detail) && /not found|does not exist|invalid/i.test(detail)) {
    return `OpenAI does not recognize this model. Set OPENAI_TEXT_MODEL and OPENAI_IMAGE_MODEL to valid IDs. ${detail}`;
  }
  if (/timeout|timed out|AbortError/i.test(detail)) {
    return "The visualization took too long. Please try again.";
  }
  if (detail) {
    return detail.length > 220 ? `${detail.slice(0, 217)}…` : detail;
  }
  return "The visualization could not be created. Please try again.";
}
