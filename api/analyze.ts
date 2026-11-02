/**
 * Optional serverless endpoint (Vercel, Node runtime) that turns the deterministic
 * analysis produced in the browser into a short narrative written by Claude.
 *
 * - The API key lives only in the server environment (ANTHROPIC_API_KEY).
 * - The browser sends aggregated facts only — never row-level data.
 * - Payload size is capped; the model is instructed to use only the supplied facts.
 */
import Anthropic from '@anthropic-ai/sdk';

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-5-5';
const MAX_QUESTION = 500;
const MAX_CONTEXT_BYTES = 24_000;

const SYSTEM = `Você é um analista de BI sênior comentando uma análise já calculada por um motor determinístico.
Regras:
- Use exclusivamente os fatos e números fornecidos no contexto JSON. Não invente valores, períodos ou entidades.
- Separe claramente o que é fato observado do que é hipótese ("pode indicar", "uma hipótese é").
- Não atribua causalidade a partir de correlação ou de coincidência temporal.
- Uma anomalia estatística não é prova de fraude, erro ou falha operacional.
- Se o contexto não basta para responder, diga isso explicitamente.
- Os dados são sintéticos (demonstração de portfólio); não trate como resultados de uma empresa real.
- Responda em português do Brasil, em no máximo 170 palavras, em texto corrido (sem markdown).`;

function json(status: number, body: unknown, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...(origin ? { 'access-control-allow-origin': origin, vary: 'origin' } : {}),
    },
  });
}

function allowedOrigin(req: Request): string | null {
  const allowed = process.env.ALLOWED_ORIGIN;
  const origin = req.headers.get('origin');
  if (!allowed) return origin; // same-origin deployments (Vercel) need no allow-list
  return origin && allowed.split(',').map((s) => s.trim()).includes(origin) ? origin : null;
}

export async function OPTIONS(req: Request): Promise<Response> {
  const origin = allowedOrigin(req);
  return new Response(null, {
    status: origin ? 204 : 403,
    headers: origin
      ? { 'access-control-allow-origin': origin, 'access-control-allow-methods': 'POST', 'access-control-allow-headers': 'content-type' }
      : {},
  });
}

export async function POST(req: Request): Promise<Response> {
  const origin = allowedOrigin(req);
  if (process.env.ALLOWED_ORIGIN && !origin) return json(403, { error: 'Origem não autorizada.' }, null);
  if (!process.env.ANTHROPIC_API_KEY) return json(503, { error: 'Integração de IA não configurada no servidor.' }, origin);

  let body: { question?: unknown; context?: unknown };
  try {
    body = (await req.json()) as { question?: unknown; context?: unknown };
  } catch {
    return json(400, { error: 'JSON inválido.' }, origin);
  }
  const question = typeof body.question === 'string' ? body.question.trim().slice(0, MAX_QUESTION) : '';
  const context = JSON.stringify(body.context ?? null);
  if (!question) return json(400, { error: 'Pergunta ausente.' }, origin);
  if (context.length > MAX_CONTEXT_BYTES) return json(413, { error: 'Contexto excede o limite permitido.' }, origin);

  const client = new Anthropic();
  try {
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 4000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low' },
      system: SYSTEM,
      messages: [{ role: 'user', content: `Pergunta: ${question}\n\nContexto (JSON):\n${context}` }],
    });
    if (response.stop_reason === 'refusal') {
      return json(422, { error: 'O modelo recusou esta solicitação.' }, origin);
    }
    const narrative = response.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();
    if (!narrative) return json(502, { error: 'Resposta vazia do modelo.' }, origin);
    return json(200, { model: response.model, narrative }, origin);
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) return json(429, { error: 'Limite de requisições atingido. Tente novamente em instantes.' }, origin);
    if (error instanceof Anthropic.AuthenticationError) return json(503, { error: 'Credencial do provedor de IA inválida.' }, origin);
    if (error instanceof Anthropic.BadRequestError) return json(400, { error: 'Requisição rejeitada pelo provedor de IA.' }, origin);
    if (error instanceof Anthropic.APIError) return json(502, { error: `Erro do provedor de IA (${error.status ?? 'rede'}).` }, origin);
    return json(500, { error: 'Erro inesperado ao consultar o modelo.' }, origin);
  }
}
