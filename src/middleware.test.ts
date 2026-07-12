import { describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { middleware } from '@/middleware'

describe('middleware', () => {
  it('allows race tracker iframe embedding only from the RX site', async () => {
    const response = await middleware(
      new NextRequest('https://example.test/race-tracker')
    )

    expect(response.status).not.toBe(307)
    expect(response.headers.get('x-frame-options')).toBeNull()
    expect(response.headers.get('content-security-policy')).toBe(
      "frame-ancestors 'self' https://www.racerxtemplecity.org https://racerxtemplecity.org;"
    )
  })

  it('does not add race tracker frame policy to other public routes', async () => {
    const response = await middleware(new NextRequest('https://example.test/login'))

    expect(response.status).not.toBe(307)
    expect(response.headers.get('content-security-policy')).toBeNull()
  })

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
