import { NextRequest, NextResponse } from 'next/server'
import { getDb, ConnectionRow } from '@/lib/db'

export const dynamic = 'force-dynamic'

function sanitizeConnection(connection: ConnectionRow) {
  const { credentials: _credentials, ...safeConnection } = connection
  return safeConnection
}

function isAuthenticatedSecretWrite(req: NextRequest): boolean {
  const configuredToken = process.env.CONNECTIONS_WRITE_TOKEN || process.env.ADMIN_API_TOKEN
  if (!configuredToken) return false
  const authHeader = req.headers.get('authorization')
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null
  const headerToken = req.headers.get('x-connections-write-token')?.trim()
  return bearerToken === configuredToken || headerToken === configuredToken
}

export async function GET() {
  try {
    const db = getDb()
    const connections = db.prepare('SELECT * FROM connections ORDER BY created_at DESC').all() as ConnectionRow[]
    return NextResponse.json({ connections: connections.map(sanitizeConnection) })
  } catch (err) {
    console.error('[connections] GET error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!isAuthenticatedSecretWrite(req)) {
      return NextResponse.json({ error: 'Authentication required to write connection secrets' }, { status: 401 })
    }

    const db = getDb()
    const body = await req.json()
    const {
      platform,
      displayName,
      authType,
      credentials,
      readPermissions,
      writePermissions,
      guardrails,
      connectedAccount,
    } = body as {
      platform: string
      displayName: string
      authType: string
      credentials: Record<string, string>
      readPermissions: string[]
      writePermissions: string[]
      guardrails: Record<string, number>
      connectedAccount: string | null
    }

    const now = new Date().toISOString()

    // Determine status from what was provided
    const hasCredentials = Object.keys(credentials || {}).some(k => (credentials[k] || '').trim().length > 0)
    const status = connectedAccount
      ? 'connected'
      : hasCredentials
        ? 'connected'
        : 'not_connected'

    const existing = db.prepare('SELECT id FROM connections WHERE platform = ?').get(platform) as { id: string } | undefined
    const id = existing?.id || crypto.randomUUID()

    if (existing) {
      db.prepare(`
        UPDATE connections
        SET display_name = ?, auth_type = ?, credentials = ?, status = ?,
            connected_account = ?, read_permissions = ?, write_permissions = ?,
            guardrails = ?, last_synced_at = ?
        WHERE platform = ?
      `).run(
        displayName,
        authType,
        JSON.stringify(credentials || {}),
        status,
        connectedAccount || null,
        JSON.stringify(readPermissions || []),
        JSON.stringify(writePermissions || []),
        JSON.stringify(guardrails || {}),
        now,
        platform,
      )
    } else {
      db.prepare(`
        INSERT INTO connections
          (id, platform, display_name, auth_type, credentials, status,
           connected_account, read_permissions, write_permissions, guardrails,
           created_at, last_synced_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        platform,
        displayName,
        authType,
        JSON.stringify(credentials || {}),
        status,
        connectedAccount || null,
        JSON.stringify(readPermissions || []),
        JSON.stringify(writePermissions || []),
        JSON.stringify(guardrails || {}),
        now,
        now,
      )
    }

    const connection = db.prepare('SELECT * FROM connections WHERE id = ?').get(id) as ConnectionRow
    return NextResponse.json({ ok: true, connection: sanitizeConnection(connection) })
  } catch (err) {
    console.error('[connections] POST error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
