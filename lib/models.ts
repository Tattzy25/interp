import { createAnthropic } from '@ai-sdk/anthropic'
import { createFireworks } from '@ai-sdk/fireworks'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createVertex } from '@ai-sdk/google-vertex'
import { createMistral } from '@ai-sdk/mistral'
import { createOpenAI } from '@ai-sdk/openai'
import { createOllama } from 'ollama-ai-provider'

export type LLMModel = {
  id: string
  name: string
  provider: string
  providerId: string
}

export type LLMModelConfig = {
  model?: string
  apiKey?: string
  baseURL?: string
  temperature?: number
  topP?: number
  topK?: number
  frequencyPenalty?: number
  presencePenalty?: number
  maxTokens?: number
}

export function getModelClient(model: LLMModel, config: LLMModelConfig) {
  const { id: modelNameString, providerId } = model
  const { apiKey, baseURL } = config

  const providerConfigs = {
    // Use env fallback for Anthropic if user did not provide an API key
    anthropic: () => createAnthropic({ apiKey: apiKey || process.env.ANTHROPIC_API_KEY, baseURL })(modelNameString),
    // Use env fallback for OpenAI
    openai: () => createOpenAI({ apiKey: apiKey || process.env.OPENAI_API_KEY, baseURL })(modelNameString),
    // Use env fallback for Google Generative AI
    google: () =>
      createGoogleGenerativeAI({ apiKey: apiKey || process.env.GOOGLE_AI_API_KEY, baseURL })(modelNameString),
    // Use env fallback for Mistral
    mistral: () => createMistral({ apiKey: apiKey || process.env.MISTRAL_API_KEY, baseURL })(modelNameString),
    groq: () =>
      createOpenAI({
        apiKey: apiKey || process.env.GROQ_API_KEY,
        baseURL: baseURL || 'https://api.groq.com/openai/v1',
      })(modelNameString),
    togetherai: () =>
      createOpenAI({
        apiKey: apiKey || process.env.TOGETHER_API_KEY,
        baseURL: baseURL || 'https://api.together.xyz/v1',
      })(modelNameString),
    ollama: () => createOllama({ baseURL })(modelNameString),
    fireworks: () =>
      createFireworks({
        apiKey: apiKey || process.env.FIREWORKS_API_KEY,
        baseURL: baseURL || 'https://api.fireworks.ai/inference/v1',
      })(modelNameString),
    vertex: () =>
      createVertex({
        googleAuthOptions: {
          credentials: JSON.parse(
            process.env.GOOGLE_VERTEX_CREDENTIALS || '{}',
          ),
        },
      })(modelNameString),
    xai: () =>
      createOpenAI({
        apiKey: apiKey || process.env.XAI_API_KEY,
        baseURL: baseURL || 'https://api.x.ai/v1',
      })(modelNameString),
    deepseek: () =>
      createOpenAI({
        apiKey: apiKey || process.env.DEEPSEEK_API_KEY,
        baseURL: baseURL || 'https://api.deepseek.com/v1',
      })(modelNameString),
  }

  const createClient =
    providerConfigs[providerId as keyof typeof providerConfigs]

  if (!createClient) {
    throw new Error(`Unsupported provider: ${providerId}`)
  }

  return createClient()
}
