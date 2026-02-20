import OpenAI from "openai";
import { env } from "../config/env";
import { createServerSupabase } from "./database";

const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMENSIONS = 1536;

let openaiClient: OpenAI | null = null;

function getOpenAI(): OpenAI | null {
  if (!env.OPENAI_API_KEY) return null;
  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  }
  return openaiClient;
}

export function isAIMatchingAvailable(): boolean {
  return !!env.OPENAI_API_KEY;
}

/**
 * Compute cosine similarity between two vectors. Returns 0–1.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 0;
  // Clamp to [0, 1] — embeddings can have negative components but
  // similarity for related nursing terms should be positive
  return Math.max(0, dot / denom);
}

/**
 * Get embeddings for a list of texts, using the database cache first
 * and only calling OpenAI for uncached texts. Returns a Map<text, embedding>.
 */
export async function getEmbeddings(
  texts: string[]
): Promise<Map<string, number[]>> {
  const result = new Map<string, number[]>();
  if (texts.length === 0) return result;

  // Normalize all texts
  const normalized = texts.map((t) => t.toLowerCase().trim());
  const unique = [...new Set(normalized)];

  // 1. Check cache
  const supabase = createServerSupabase();
  const { data: cached } = await supabase
    .from("embedding_cache")
    .select("text_content, embedding")
    .in("text_content", unique);

  const uncached: string[] = [];
  if (cached) {
    for (const row of cached) {
      result.set(row.text_content, row.embedding);
    }
  }
  for (const text of unique) {
    if (!result.has(text)) {
      uncached.push(text);
    }
  }

  // 2. Generate missing embeddings via OpenAI
  if (uncached.length > 0) {
    const openai = getOpenAI();
    if (!openai) {
      throw new Error("OpenAI client not available");
    }

    // Batch in chunks of 2048 (OpenAI limit)
    for (let i = 0; i < uncached.length; i += 2048) {
      const batch = uncached.slice(i, i + 2048);
      const response = await openai.embeddings.create({
        model: EMBEDDING_MODEL,
        input: batch,
      });

      const rows: { text_content: string; embedding: number[] }[] = [];
      for (let j = 0; j < response.data.length; j++) {
        const embedding = response.data[j].embedding;
        result.set(batch[j], embedding);
        rows.push({ text_content: batch[j], embedding });
      }

      // 3. Cache new embeddings (upsert to handle race conditions)
      if (rows.length > 0) {
        await supabase
          .from("embedding_cache")
          .upsert(rows, { onConflict: "text_content" });
      }
    }
  }

  return result;
}
