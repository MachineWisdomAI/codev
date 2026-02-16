/**
 * Usage extraction from structured model output
 *
 * Extracts token counts, cost, and review text from Claude SDK results
 * and Gemini JSON output. All parsing is wrapped in try/catch — returns
 * null on failure, never throws.
 *
 * Codex usage and review text are captured directly from SDK events in
 * runCodexConsultation() — no JSONL parsing needed.
 */

// Static pricing for subprocess models (Claude and Codex provide cost via SDK)
const SUBPROCESS_MODEL_PRICING: Record<string, {
  inputPer1M: number;
  cachedInputPer1M: number;
  outputPer1M: number;
}> = {
  gemini: { inputPer1M: 1.25, cachedInputPer1M: 0.315, outputPer1M: 10.00 },
};

export interface UsageData {
  inputTokens: number | null;
  cachedInputTokens: number | null;
  outputTokens: number | null;
  costUsd: number | null;
}

// Minimal type for the SDK result fields we need — avoids importing the full SDK type
export interface SDKResultLike {
  type: 'result';
  subtype: string;
  total_cost_usd?: number;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
}

function computeCost(
  model: string,
  inputTokens: number | null,
  cachedInputTokens: number | null,
  outputTokens: number | null,
): number | null {
  if (inputTokens === null || cachedInputTokens === null || outputTokens === null) {
    return null;
  }

  const pricing = SUBPROCESS_MODEL_PRICING[model];
  if (!pricing) return null;

  const uncachedInput = inputTokens - cachedInputTokens;
  return (
    (uncachedInput / 1_000_000) * pricing.inputPer1M +
    (cachedInputTokens / 1_000_000) * pricing.cachedInputPer1M +
    (outputTokens / 1_000_000) * pricing.outputPer1M
  );
}

function extractClaudeUsage(sdkResult: SDKResultLike): UsageData {
  const usage = sdkResult.usage;
  return {
    inputTokens: usage?.input_tokens ?? null,
    cachedInputTokens: usage?.cache_read_input_tokens ?? null,
    outputTokens: usage?.output_tokens ?? null,
    costUsd: sdkResult.total_cost_usd ?? null,
  };
}

function extractGeminiUsage(output: string): UsageData | null {
  const parsed = JSON.parse(output);
  const models = parsed?.stats?.models;
  if (!models || typeof models !== 'object') return null;

  // Take the first (and typically only) model entry
  const modelKeys = Object.keys(models);
  if (modelKeys.length === 0) return null;

  const tokens = models[modelKeys[0]]?.tokens;
  if (!tokens) return null;

  const inputTokens = typeof tokens.prompt === 'number' ? tokens.prompt : null;
  const cachedInputTokens = typeof tokens.cached === 'number' ? tokens.cached : null;
  const outputTokens = typeof tokens.candidates === 'number' ? tokens.candidates : null;

  return {
    inputTokens,
    cachedInputTokens,
    outputTokens,
    costUsd: computeCost('gemini', inputTokens, cachedInputTokens, outputTokens),
  };
}

/**
 * Extract token counts and cost from structured model output.
 * Returns null if extraction fails entirely (logs warning to stderr).
 */
export function extractUsage(model: string, output: string, sdkResult?: SDKResultLike): UsageData | null {
  try {
    if (model === 'claude' && sdkResult) {
      return extractClaudeUsage(sdkResult);
    }
    if (model === 'gemini') {
      return extractGeminiUsage(output);
    }
    // Codex usage is captured directly from SDK events in runCodexConsultation()
    return null;
  } catch (err) {
    console.error(`[warn] Failed to extract usage for ${model}: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

/**
 * Extract plain-text review content from structured model output.
 * Returns null if extraction fails (caller should fall back to raw output).
 */
export function extractReviewText(model: string, output: string): string | null {
  try {
    if (model === 'gemini') {
      const parsed = JSON.parse(output);
      if (typeof parsed?.response === 'string') {
        return parsed.response;
      }
      return null;
    }

    // Claude and Codex use SDKs — text is captured directly by their streaming loops
    return null;
  } catch (err) {
    console.error(`[warn] Failed to extract review text for ${model}: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}
