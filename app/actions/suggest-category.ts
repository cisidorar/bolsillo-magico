'use server'

import { createClient, getServerSession } from '@/lib/supabase/server'

// ─── helpers ──────────────────────────────────────────────────────────────────

/** Normalize a description into a stable merchant key */
function normalizeMerchant(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '')  // drop combining accent marks (Unicode property escape)
    .replace(/[^a-z0-9\s]/g, ' ')     // punctuation → space
    .replace(/\s+/g, ' ')
    .trim()
}

/** Cosine similarity between two float vectors */
function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0
  for (let i = 0; i < a.length; i++) {
    dot   += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  if (normA === 0 || normB === 0) return 0
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

/** Call OpenAI text-embedding-3-small. Returns null if no API key or on error. */
async function getEmbedding(text: string): Promise<number[] | null> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return null
  try {
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method:  'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ model: 'text-embedding-3-small', input: text }),
    })
    if (!res.ok) return null
    const json = await res.json()
    return (json.data?.[0]?.embedding as number[]) ?? null
  } catch {
    return null
  }
}

// ─── types ────────────────────────────────────────────────────────────────────

export interface CategorySuggestion {
  categoryId: string
  confidence: number   // 0-100
  source: 'rule_exact' | 'rule_fuzzy' | 'history' | 'embedding'
}

// ─── main action ──────────────────────────────────────────────────────────────

/**
 * Suggest a category for a given description.
 *
 * Priority:
 *   1. Exact match in learned rules
 *   2. Fuzzy match in rules (first-word / substring)
 *   3. Embedding cosine-similarity against rules that have stored embeddings
 *   4. Frequency count over last-90-days expense history
 */
export async function suggestCategory(description: string): Promise<CategorySuggestion | null> {
  const trimmed = description.trim()
  if (trimmed.length < 2) return null

  const [supabase, user] = await Promise.all([createClient(), getServerSession()])
  if (!user) return null

  const key      = normalizeMerchant(trimmed)
  if (!key)      return null
  const keyWords = key.split(' ')
  const firstWord = keyWords[0]

  // ── 1. Exact match ──────────────────────────────────────────────────────────
  const { data: exactRule } = await supabase
    .from('category_rules')
    .select('category_id, confidence')
    .eq('user_id', user.id)
    .eq('merchant_key', key)
    .maybeSingle()

  if (exactRule) {
    return { categoryId: exactRule.category_id, confidence: exactRule.confidence, source: 'rule_exact' }
  }

  // ── 2. Fuzzy + 3. Embedding + 4. History — cargar en paralelo ──────────────
  const since = new Date()
  since.setDate(since.getDate() - 90)

  const [{ data: allRules }, { data: histExpenses }] = await Promise.all([
    supabase
      .from('category_rules')
      .select('merchant_key, category_id, hit_count, embedding')
      .eq('user_id', user.id),
    supabase
      .from('expenses')
      .select('category_id, description')
      .eq('user_id', user.id)
      .not('description', 'is', null)
      .not('category_id', 'is', null)
      .gte('date', since.toISOString().split('T')[0]),
  ])

  if (allRules?.length) {
    // Fuzzy match
    let fuzzyBest: { categoryId: string; score: number } | null = null

    for (const r of allRules) {
      const rFirst = r.merchant_key.split(' ')[0]
      let score = 0

      // First-word exact (great for brand names: "uber", "netflix", "jumbo")
      if (firstWord.length >= 4 && firstWord === rFirst) {
        score = 85 + Math.min(10, r.hit_count)
      }
      // Containment overlap
      else if (key.includes(r.merchant_key) || r.merchant_key.includes(key)) {
        const overlap =
          Math.min(key.length, r.merchant_key.length) /
          Math.max(key.length, r.merchant_key.length)
        score = Math.round(60 + overlap * 20) + Math.min(5, r.hit_count)
      }

      if (score > 70 && (!fuzzyBest || score > fuzzyBest.score)) {
        fuzzyBest = { categoryId: r.category_id, score }
      }
    }

    if (fuzzyBest) {
      return { categoryId: fuzzyBest.categoryId, confidence: fuzzyBest.score, source: 'rule_fuzzy' }
    }

    // Embedding similarity (Phase 2)
    const rulesWithEmbed = allRules.filter(r => Array.isArray(r.embedding) && r.embedding.length === 1536)
    if (rulesWithEmbed.length > 0) {
      const inputEmbed = await getEmbedding(trimmed)
      if (inputEmbed) {
        let embedBest: { categoryId: string; similarity: number } | null = null
        for (const r of rulesWithEmbed) {
          const sim = cosineSimilarity(inputEmbed, r.embedding as number[])
          if (sim > 0.82 && (!embedBest || sim > embedBest.similarity)) {
            embedBest = { categoryId: r.category_id, similarity: sim }
          }
        }
        if (embedBest) {
          return {
            categoryId:  embedBest.categoryId,
            confidence:  Math.round(embedBest.similarity * 100),
            source:      'embedding',
          }
        }
      }
    }
  }

  // ── 4. Expense history fallback (ya cargado en paralelo arriba) ─────────────

  if (histExpenses?.length) {
    const freq: Record<string, number> = {}
    for (const e of histExpenses) {
      if (!e.description || !e.category_id) continue
      const norm   = normalizeMerchant(e.description)
      const eFirst = norm.split(' ')[0]

      const match =
        norm === key ||
        (firstWord.length >= 4 && eFirst === firstWord) ||
        key.includes(norm) ||
        norm.includes(key)

      if (match) freq[e.category_id] = (freq[e.category_id] ?? 0) + 1
    }
    const top = Object.entries(freq).sort((a, b) => b[1] - a[1])[0]
    if (top) {
      return { categoryId: top[0], confidence: 65, source: 'history' }
    }
  }

  return null
}

// ─── learning action ──────────────────────────────────────────────────────────

/**
 * Record (or update) a category rule for a description.
 * Called when the user saves a new expense so the app learns over time.
 */
export async function recordCategoryRule(
  description: string,
  categoryId:  string,
  source:      'manual' | 'history' | 'ai' = 'manual',
): Promise<void> {
  const trimmed = description.trim()
  if (trimmed.length < 2 || !categoryId) return

  const [supabase, user] = await Promise.all([createClient(), getServerSession()])
  if (!user) return

  const key = normalizeMerchant(trimmed)
  if (!key) return

  // Check if rule exists
  const { data: existing } = await supabase
    .from('category_rules')
    .select('id, hit_count')
    .eq('user_id', user.id)
    .eq('merchant_key', key)
    .maybeSingle()

  if (existing) {
    // Update: new category wins, bump hit_count
    await supabase
      .from('category_rules')
      .update({
        category_id: categoryId,
        source,
        confidence:  95,
        hit_count:   existing.hit_count + 1,
        updated_at:  new Date().toISOString(),
      })
      .eq('id', existing.id)
  } else {
    // New rule: generate embedding if possible (Phase 2)
    const embedding = await getEmbedding(trimmed)

    await supabase.from('category_rules').insert({
      user_id:     user.id,
      merchant_key: key,
      category_id:  categoryId,
      confidence:   95,
      source,
      hit_count:    1,
      embedding:    embedding ?? null,
    })
  }
}
