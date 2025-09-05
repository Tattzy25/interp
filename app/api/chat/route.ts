import { Duration } from '@/lib/duration'
import {
  getModelClient,
  LLMModel,
  LLMModelConfig,
} from '@/lib/models'
import { toPrompt } from '@/lib/prompt'
import ratelimit from '@/lib/ratelimit'
import { fragmentSchema as schema } from '@/lib/schema'
import { Templates } from '@/lib/templates'
import { streamObject, LanguageModel, CoreMessage } from 'ai'

// Helper function to create consistent error responses
function createErrorResponse(
  error: string,
  message: string,
  status: number,
  incidentId?: string
) {
  const body = {
    error,
    message,
    ...(incidentId && { incident_id: incidentId }),
  }
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export const maxDuration = 300

const rateLimitMaxRequests = process.env.RATE_LIMIT_MAX_REQUESTS
  ? parseInt(process.env.RATE_LIMIT_MAX_REQUESTS)
  : 60
const ratelimitWindow = process.env.RATE_LIMIT_WINDOW
  ? (process.env.RATE_LIMIT_WINDOW as Duration)
  : '10m'

export async function POST(req: Request) {
  const {
    messages,
    userID,
    teamID,
    template,
    model,
    config,
  }: {
    messages: CoreMessage[]
    userID: string | undefined
    teamID: string | undefined
    template: Templates
    model: LLMModel
    config: LLMModelConfig
  } = await req.json()

  const limit = !config.apiKey
    ? await ratelimit(
        req.headers.get('x-forwarded-for'),
        rateLimitMaxRequests,
        ratelimitWindow,
      )
    : false

  if (limit) {
    const response = createErrorResponse(
      'rate_limited',
      'You have reached your request limit.',
      429
    )
    response.headers.set('X-RateLimit-Limit', limit.amount.toString())
    response.headers.set('X-RateLimit-Remaining', limit.remaining.toString())
    response.headers.set('X-RateLimit-Reset', limit.reset.toString())
    return response
  }

  console.log('userID', userID)
  console.log('teamID', teamID)
  // console.log('template', template)
  console.log('model', model)
  // console.log('config', config)

  // Preflight: ensure API key is available for providers that require it
  const providerId = (model as any)?.providerId as string | undefined
  const providerEnvMap: Record<string, string> = {
    anthropic: 'ANTHROPIC_API_KEY',
    openai: 'OPENAI_API_KEY',
    google: 'GOOGLE_AI_API_KEY',
    mistral: 'MISTRAL_API_KEY',
    groq: 'GROQ_API_KEY',
    togetherai: 'TOGETHER_API_KEY',
    fireworks: 'FIREWORKS_API_KEY',
    xai: 'XAI_API_KEY',
    deepseek: 'DEEPSEEK_API_KEY',
  }
  const requiresKey = new Set(Object.keys(providerEnvMap))
  const envVarName = providerId ? providerEnvMap[providerId] : undefined
  const effectiveApiKey = config?.apiKey || (envVarName ? (process.env as any)[envVarName] : undefined)

  if (providerId && requiresKey.has(providerId) && !effectiveApiKey) {
    const providerName = (model as any)?.provider || providerId
    return createErrorResponse(
      'api_key_missing',
      `Missing API key for ${providerName}. Enter an API key in LLM settings or set ${envVarName} on the server.`,
      400
    )
  }

  const { model: modelNameString, apiKey: modelApiKey, ...modelParams } = config
  const modelClient = getModelClient(model, config)

  try {
    const stream = await streamObject({
      model: modelClient as LanguageModel,
      schema,
      system: toPrompt(template),
      messages,
      maxRetries: 0, // do not retry on errors
      ...modelParams,
    })

    return stream.toTextStreamResponse()
  } catch (error: any) {
    const incidentId = `inc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    console.error(`Error [${incidentId}]:`, error)

    const isRateLimitError =
      error && (error.statusCode === 429 || error.message?.includes('limit'))
    const isOverloadedError =
      error && (error.statusCode === 529 || error.statusCode === 503)
    const isAccessDeniedError =
      error && (error.statusCode === 403 || error.statusCode === 401)

    if (isRateLimitError) {
      return createErrorResponse(
        'provider_rate_limited',
        'The provider is currently unavailable due to request limit. Try using your own API key.',
        429,
        incidentId
      )
    }

    if (isOverloadedError) {
      return createErrorResponse(
        'provider_overloaded',
        'The provider is currently unavailable. Please try again later.',
        529,
        incidentId
      )
    }

    if (isAccessDeniedError) {
      return createErrorResponse(
        'access_denied',
        'Access denied. Please make sure your API key is valid.',
        403,
        incidentId
      )
    }

    return createErrorResponse(
      'unexpected_error',
      'An unexpected error has occurred. Please try again later.',
      500,
      incidentId
    )
  }
}
