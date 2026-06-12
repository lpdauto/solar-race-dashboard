import { describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { middleware } from '@/middleware'

describe('middleware', () => {
  it('does not redirect the TFT driver API to login', async () => {
    const response = await middleware(
      new NextRequest('https://example.test/api/tft/driver')
    )

    expect(response.status).not.toBe(307)
    expect(response.headers.get('location')).toBeNull()
  })

  it('exempts all TFT API routes so route handlers can validate bearer auth', async () => {
    const response = await middleware(
      new NextRequest('https://example.test/api/tft/driver/status')
    )

    expect(response.status).not.toBe(307)
    expect(response.headers.get('location')).toBeNull()
  })
})
