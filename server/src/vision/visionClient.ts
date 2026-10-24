// Vision provider client for the dog photo look: an OpenAI-compatible chat/completions call to the LiteLLM proxy
// (model alias from DTD_VISION_MODEL, currently Claude Haiku). Swapping the provider means swapping this file. One request carries ALL photos
// and a strict JSON schema; the answer is parsed by src/buddy/photoLook.ts. Photos exist only in this function's
// arguments and the outgoing body: never written, never logged. The key goes in a header and is never logged.
import { FUR_ZONES } from '@game/buddy/buddyAppearance';
import { PHOTO_CONFIDENCES, PHOTO_LOOK_OPTIONS, appearanceFromAnalysis, type PhotoLookResult } from '@game/buddy/photoLook';

/** Token counts from the reply's `usage`. */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export type VisionOutcome = (PhotoLookResult & { usage?: TokenUsage }) | { kind: 'failed'; status?: number };

export interface VisionOptions {
  baseUrl: string;
  apiKey: string;
  model: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

const PROMPT = [
  'You help a friendly dog game recreate a real dog as a cartoon avatar. The attached photos show the SAME dog from different angles.',
  'Only describe the dog. Ignore any people, faces, text and surroundings.',
  'If no photo clearly shows a dog, set isDog to false and fill the other fields with neutral guesses.',
  'For each fur zone give the dominant real-life colour of that body part as a hex colour like #C8A27A.',
  'Zones: head (top of the head), muzzle (snout), eyepatch (the fur around the eyes), ears, back, belly, chest, legs, paws, tail.',
  'Then pick the closest option for muzzle length, fur length, ear style, tail style and body size.',
  'Set confidence to low, medium or high for how sure you are about the whole result.',
].join(' ');

const enumString = (values: readonly string[]) => ({ type: 'string', enum: [...values] });

// OpenAI strict mode: every property required, no additional properties.
const RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    isDog: { type: 'boolean' },
    confidence: enumString(PHOTO_CONFIDENCES),
    zones: {
      type: 'object',
      additionalProperties: false,
      properties: Object.fromEntries(FUR_ZONES.map((z) => [z, { type: 'string' }])),
      required: [...FUR_ZONES],
    },
    muzzle: enumString(PHOTO_LOOK_OPTIONS.muzzle),
    furLength: enumString(PHOTO_LOOK_OPTIONS.furLength),
    earStyle: enumString(PHOTO_LOOK_OPTIONS.earStyle),
    tailStyle: enumString(PHOTO_LOOK_OPTIONS.tailStyle),
    size: enumString(PHOTO_LOOK_OPTIONS.size),
  },
  required: ['isDog', 'confidence', 'zones', 'muzzle', 'furLength', 'earStyle', 'tailStyle', 'size'],
};

export async function analyzeDogPhotos(photosBase64: string[], options: VisionOptions): Promise<VisionOutcome> {
  const doFetch = options.fetchImpl ?? fetch;
  const body = {
    model: options.model,
    temperature: 0.2,
    response_format: { type: 'json_schema', json_schema: { name: 'dog_look', strict: true, schema: RESPONSE_SCHEMA } },
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: PROMPT },
          ...photosBase64.map((data) => ({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${data}` } })),
        ],
      },
    ],
  };
  let response: Response;
  try {
    response = await doFetch(`${options.baseUrl.replace(/\/+$/, '')}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${options.apiKey}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(options.timeoutMs ?? 40_000),
    });
  } catch {
    return { kind: 'failed' };
  }
  if (!response.ok) return { kind: 'failed', status: response.status };
  try {
    const payload = (await response.json()) as {
      choices?: { message?: { content?: unknown } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const text = payload.choices?.[0]?.message?.content;
    if (typeof text !== 'string') return { kind: 'failed' };
    const result = appearanceFromAnalysis(JSON.parse(text));
    if (!result) return { kind: 'failed' };
    const u = payload.usage;
    const usage = u && typeof u.prompt_tokens === 'number' ? { inputTokens: u.prompt_tokens, outputTokens: u.completion_tokens ?? 0 } : undefined;
    return { ...result, usage };
  } catch {
    return { kind: 'failed' };
  }
}
