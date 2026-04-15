import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { callClaude } from '@/lib/claude'

export async function POST(req: NextRequest) {
  try {
    const { sku_id } = await req.json()
    const db = getDb()

    const product = db.prepare('SELECT * FROM products WHERE sku_id = ?').get(sku_id) as {
      sku_id: string; name: string; category: string; subcategory: string;
      retail_price: number; cost_price: number;
    } | undefined

    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }

    const systemPrompt = `You are a product content specialist for a mid-market fashion brand. Generate compelling, accurate product content for e-commerce. Output valid JSON only — no markdown, no explanation, just the JSON object.`

    const userMessage = `Generate product content for this fashion item:
SKU: ${product.sku_id}
Name: ${product.name}
Category: ${product.category}
Subcategory: ${product.subcategory ?? product.category}
Retail Price: $${product.retail_price}

Return ONLY a JSON object with this exact structure:
{
  "title": "compelling product title (max 60 chars)",
  "description": "2-3 sentence product description, evocative and brand-appropriate",
  "bullets": ["feature 1", "feature 2", "feature 3", "feature 4", "feature 5"],
  "seo_title": "SEO-optimized title with key terms (max 60 chars)",
  "seo_description": "Meta description with natural keyword inclusion (max 160 chars)",
  "tags": ["tag1", "tag2", "tag3", "tag4", "tag5", "tag6"],
  "collection_suggestions": ["Collection 1", "Collection 2", "Collection 3"]
}`

    const rawResponse = await callClaude(systemPrompt, userMessage, 800)

    let parsed: {
      title: string; description: string; bullets: string[];
      seo_title: string; seo_description: string; tags: string[];
      collection_suggestions: string[];
    }

    try {
      // Strip markdown code fences if present
      const cleaned = rawResponse.replace(/```json?\n?/g, '').replace(/```\n?/g, '').trim()
      parsed = JSON.parse(cleaned)
    } catch {
      return NextResponse.json({ error: 'Failed to parse Claude response', raw: rawResponse }, { status: 422 })
    }

    const draftId = `CDR-${Date.now()}`
    const now = new Date().toISOString()

    // Remove existing draft if any
    db.prepare("DELETE FROM content_drafts WHERE sku_id = ?").run(sku_id)

    db.prepare(`
      INSERT INTO content_drafts (id, sku_id, title, description, bullets, seo_title,
        seo_description, tags, collection_suggestions, status, generated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?)
    `).run(
      draftId,
      sku_id,
      parsed.title ?? '',
      parsed.description ?? '',
      JSON.stringify(parsed.bullets ?? []),
      parsed.seo_title ?? '',
      parsed.seo_description ?? '',
      JSON.stringify(parsed.tags ?? []),
      JSON.stringify(parsed.collection_suggestions ?? []),
      now
    )

    const draft = db.prepare('SELECT * FROM content_drafts WHERE id = ?').get(draftId)

    return NextResponse.json({ ok: true, draft })
  } catch (err) {
    console.error('Content generate error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
