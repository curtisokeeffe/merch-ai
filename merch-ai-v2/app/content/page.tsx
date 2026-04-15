'use client'

import { useState, useEffect, useCallback } from 'react'

interface Product {
  sku_id: string
  name: string
  category: string
  subcategory?: string
  retail_price: number
  status: string
}

interface ContentDraft {
  id: string
  sku_id: string
  title: string
  description: string
  bullets: string
  seo_title: string
  seo_description: string
  tags: string
  collection_suggestions: string
  status: string
  generated_at: string
  published_at?: string
}

interface ContentProductRow extends Product {
  draft?: ContentDraft
}

type StatusFilter = 'all' | 'needs_content' | 'draft' | 'approved' | 'published'

const STATUS_COLORS: Record<string, { color: string; bg: string }> = {
  draft:        { color: '#F59E0B', bg: 'rgba(245,158,11,0.1)' },
  approved:     { color: '#10B981', bg: 'rgba(16,185,129,0.1)' },
  published:    { color: '#6366F1', bg: 'rgba(99,102,241,0.1)' },
  rejected:     { color: '#EF4444', bg: 'rgba(239,68,68,0.1)' },
  needs_content:{ color: '#94A3B8', bg: '#F1F5F9' },
}

function Badge({ text, color, bg }: { text: string; color: string; bg: string }) {
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 20,
      fontSize: 11, fontWeight: 600, color, background: bg, textTransform: 'capitalize',
    }}>
      {text}
    </span>
  )
}

function DraftPanel({
  product,
  draft,
  onClose,
  onRefresh,
}: {
  product: ContentProductRow
  draft: ContentDraft
  onClose: () => void
  onRefresh: () => void
}) {
  const [title, setTitle] = useState(draft.title)
  const [description, setDescription] = useState(draft.description)
  const [actioning, setActioning] = useState(false)

  const bullets: string[] = JSON.parse(draft.bullets || '[]')
  const tags: string[] = JSON.parse(draft.tags || '[]')
  const collections: string[] = JSON.parse(draft.collection_suggestions || '[]')

  const handleAction = async (action: 'approve' | 'reject' | 'publish') => {
    setActioning(true)
    try {
      await fetch('/api/content/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: draft.id, action }),
      })
      onRefresh()
      onClose()
    } finally {
      setActioning(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
      zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
    }}>
      <div style={{
        background: '#FFFFFF', borderRadius: 16, width: '100%', maxWidth: 680,
        maxHeight: '90vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px', borderBottom: '1px solid #E2E8F0',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#0F172A' }}>Review Content Draft</div>
            <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
              {product.sku_id} · {product.name}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#64748B' }}>×</button>
        </div>

        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Title */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 6 }}>
              Product Title
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              style={{
                width: '100%', padding: '10px 12px', border: '1px solid #E2E8F0',
                borderRadius: 8, fontSize: 14, color: '#0F172A', boxSizing: 'border-box',
                outline: 'none',
              }}
            />
          </div>

          {/* Description */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 6 }}>
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              style={{
                width: '100%', padding: '10px 12px', border: '1px solid #E2E8F0',
                borderRadius: 8, fontSize: 13, color: '#0F172A', boxSizing: 'border-box',
                resize: 'vertical', outline: 'none', lineHeight: 1.6,
              }}
            />
          </div>

          {/* Bullets */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 6 }}>
              Bullet Points
            </label>
            <ul style={{ margin: 0, padding: '0 0 0 18px', listStyle: 'disc' }}>
              {bullets.map((b, i) => (
                <li key={i} style={{ fontSize: 13, color: '#0F172A', marginBottom: 4, lineHeight: 1.5 }}>{b}</li>
              ))}
            </ul>
          </div>

          {/* SEO */}
          <div style={{ background: '#F8FAFC', borderRadius: 8, padding: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 10 }}>SEO Metadata</div>
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 11, color: '#94A3B8', marginBottom: 3 }}>SEO Title</div>
              <div style={{ fontSize: 13, color: '#0F172A' }}>{draft.seo_title}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: '#94A3B8', marginBottom: 3 }}>Meta Description</div>
              <div style={{ fontSize: 13, color: '#0F172A', lineHeight: 1.5 }}>{draft.seo_description}</div>
            </div>
          </div>

          {/* Tags + Collections */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 8 }}>Tags</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {tags.map((t) => (
                  <span key={t} style={{
                    padding: '3px 8px', background: '#EEF2FF', color: '#6366F1',
                    borderRadius: 6, fontSize: 11, fontWeight: 500,
                  }}>{t}</span>
                ))}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 8 }}>Collections</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {collections.map((c) => (
                  <span key={c} style={{
                    padding: '3px 8px', background: '#F0FDF4', color: '#10B981',
                    borderRadius: 6, fontSize: 11, fontWeight: 500,
                  }}>{c}</span>
                ))}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 8, paddingTop: 8, borderTop: '1px solid #E2E8F0' }}>
            <button
              onClick={() => handleAction('publish')}
              disabled={actioning}
              style={{
                background: '#6366F1', color: '#fff', border: 'none',
                borderRadius: 8, padding: '9px 18px', fontSize: 13, fontWeight: 600,
                cursor: actioning ? 'not-allowed' : 'pointer', opacity: actioning ? 0.6 : 1,
              }}
            >
              Approve & Publish
            </button>
            <button
              onClick={() => handleAction('approve')}
              disabled={actioning}
              style={{
                background: '#F0FDF4', color: '#10B981', border: '1px solid #10B981',
                borderRadius: 8, padding: '9px 18px', fontSize: 13, fontWeight: 600,
                cursor: actioning ? 'not-allowed' : 'pointer', opacity: actioning ? 0.6 : 1,
              }}
            >
              Save as Approved
            </button>
            <button
              onClick={() => handleAction('reject')}
              disabled={actioning}
              style={{
                background: 'transparent', color: '#EF4444', border: '1px solid #FCA5A5',
                borderRadius: 8, padding: '9px 18px', fontSize: 13, fontWeight: 600,
                cursor: actioning ? 'not-allowed' : 'pointer', opacity: actioning ? 0.6 : 1,
              }}
            >
              Reject
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function ContentPage() {
  const [products, setProducts] = useState<ContentProductRow[]>([])
  const [loading, setLoading] = useState(true)
  const [activeFilter, setActiveFilter] = useState<StatusFilter>('all')
  const [generatingId, setGeneratingId] = useState<string | null>(null)
  const [generatingAll, setGeneratingAll] = useState(false)
  const [reviewingProduct, setReviewingProduct] = useState<ContentProductRow | null>(null)

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/content')
      const json = await res.json()
      setProducts(json.products ?? [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const handleGenerate = async (skuId: string) => {
    setGeneratingId(skuId)
    try {
      await fetch('/api/content/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sku_id: skuId }),
      })
      await fetchData()
    } finally {
      setGeneratingId(null)
    }
  }

  const handleGenerateAll = async () => {
    setGeneratingAll(true)
    const needsContent = products.filter((p) => !p.draft)
    for (const p of needsContent) {
      await fetch('/api/content/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sku_id: p.sku_id }),
      })
    }
    await fetchData()
    setGeneratingAll(false)
  }

  const counts = {
    all: products.length,
    needs_content: products.filter((p) => !p.draft).length,
    draft: products.filter((p) => p.draft?.status === 'draft').length,
    approved: products.filter((p) => p.draft?.status === 'approved').length,
    published: products.filter((p) => p.draft?.status === 'published').length,
  }

  const FILTER_LABELS: Record<StatusFilter, string> = {
    all: `All (${counts.all})`,
    needs_content: `Needs Content (${counts.needs_content})`,
    draft: `Draft (${counts.draft})`,
    approved: `Approved (${counts.approved})`,
    published: `Published (${counts.published})`,
  }

  const filtered = products.filter((p) => {
    if (activeFilter === 'all') return true
    if (activeFilter === 'needs_content') return !p.draft
    return p.draft?.status === activeFilter
  })

  return (
    <div>
      {reviewingProduct?.draft && (
        <DraftPanel
          product={reviewingProduct}
          draft={reviewingProduct.draft}
          onClose={() => setReviewingProduct(null)}
          onRefresh={fetchData}
        />
      )}

      {/* Top bar */}
      <div style={{
        height: 56, background: '#FFFFFF', borderBottom: '1px solid #E2E8F0',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 32px', position: 'sticky', top: 0, zIndex: 50,
      }}>
        <div>
          <h1 style={{ fontSize: 16, fontWeight: 600, color: '#0F172A' }}>Product Content</h1>
          <div style={{ fontSize: 12, color: '#64748B' }}>AI-generated titles, descriptions, SEO metadata, and tags</div>
        </div>
        <button
          onClick={handleGenerateAll}
          disabled={generatingAll || counts.needs_content === 0}
          style={{
            background: generatingAll ? '#94A3B8' : '#6366F1',
            color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px',
            fontSize: 13, fontWeight: 600,
            cursor: (generatingAll || counts.needs_content === 0) ? 'not-allowed' : 'pointer',
          }}
        >
          {generatingAll ? '⏳ Generating...' : `✨ Generate All Drafts (${counts.needs_content})`}
        </button>
      </div>

      <div style={{ padding: '0 32px 32px' }}>
        {/* Stats row */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16,
          marginTop: 24, marginBottom: 24,
        }}>
          {[
            { label: 'Total SKUs', value: counts.all, color: '#6366F1' },
            { label: 'Needs Content', value: counts.needs_content, color: '#F59E0B' },
            { label: 'Drafts Ready', value: counts.draft, color: '#3B82F6' },
            { label: 'Published', value: counts.published, color: '#10B981' },
          ].map((s) => (
            <div key={s.label} style={{
              background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 12,
              padding: '18px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
            }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: s.color, marginBottom: 4 }}>{s.value}</div>
              <div style={{ fontSize: 12, color: '#64748B' }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Filter tabs + grid */}
        <div style={{
          background: '#FFFFFF', border: '1px solid #E2E8F0',
          borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
        }}>
          {/* Filter tabs */}
          <div style={{ padding: '0 20px', borderBottom: '1px solid #E2E8F0', display: 'flex', gap: 0 }}>
            {(Object.keys(FILTER_LABELS) as StatusFilter[]).map((f) => (
              <button
                key={f}
                onClick={() => setActiveFilter(f)}
                style={{
                  padding: '13px 14px', background: 'transparent', border: 'none',
                  borderBottom: activeFilter === f ? '2px solid #6366F1' : '2px solid transparent',
                  color: activeFilter === f ? '#6366F1' : '#64748B',
                  fontWeight: activeFilter === f ? 600 : 400,
                  fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap',
                }}
              >
                {FILTER_LABELS[f]}
              </button>
            ))}
          </div>

          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#64748B' }}>Loading products...</div>
          ) : (
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1,
              borderTop: 'none',
            }}>
              {filtered.map((product) => {
                const hasDraft = !!product.draft
                const draftStatus = product.draft?.status ?? 'needs_content'
                const sc = STATUS_COLORS[draftStatus] ?? STATUS_COLORS.needs_content
                const isGenerating = generatingId === product.sku_id

                return (
                  <div key={product.sku_id} style={{
                    padding: 20, borderBottom: '1px solid #F1F5F9', borderRight: '1px solid #F1F5F9',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                      <div>
                        <div style={{
                          fontSize: 10, fontFamily: 'JetBrains Mono, monospace',
                          color: '#94A3B8', marginBottom: 4, fontWeight: 500,
                        }}>
                          {product.sku_id}
                        </div>
                        <div style={{ fontWeight: 600, fontSize: 13, color: '#0F172A', lineHeight: 1.3 }}>
                          {product.name}
                        </div>
                        <div style={{ fontSize: 11, color: '#64748B', marginTop: 3 }}>
                          {product.category} · ${product.retail_price}
                        </div>
                      </div>
                      <Badge text={hasDraft ? draftStatus : 'no content'} color={sc.color} bg={sc.bg} />
                    </div>

                    {hasDraft && product.draft && (
                      <div style={{
                        padding: '10px 12px', background: '#F8FAFC', borderRadius: 8,
                        marginBottom: 12, border: '1px solid #E2E8F0',
                      }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: '#0F172A', marginBottom: 4, lineHeight: 1.4 }}>
                          {product.draft.title || '(No title yet)'}
                        </div>
                        {JSON.parse(product.draft.bullets || '[]').slice(0, 1).map((b: string, i: number) => (
                          <div key={i} style={{ fontSize: 11, color: '#64748B', lineHeight: 1.4 }}>• {b}</div>
                        ))}
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: 6 }}>
                      {hasDraft ? (
                        <button
                          onClick={() => setReviewingProduct(product)}
                          style={{
                            background: '#EEF2FF', color: '#6366F1', border: 'none',
                            borderRadius: 6, padding: '6px 12px', fontSize: 12,
                            fontWeight: 600, cursor: 'pointer',
                          }}
                        >
                          Review Draft
                        </button>
                      ) : (
                        <button
                          onClick={() => handleGenerate(product.sku_id)}
                          disabled={isGenerating || generatingAll}
                          style={{
                            background: isGenerating ? '#94A3B8' : '#6366F1',
                            color: '#fff', border: 'none', borderRadius: 6,
                            padding: '6px 12px', fontSize: 12, fontWeight: 600,
                            cursor: (isGenerating || generatingAll) ? 'not-allowed' : 'pointer',
                          }}
                        >
                          {isGenerating ? '⏳ Generating...' : '✨ Generate'}
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
              {filtered.length === 0 && (
                <div style={{ gridColumn: '1/-1', padding: 40, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>
                  No products in this category.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
