import { describe, it, expect } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from './setup.js'
import handler from '../api/catalogus.js'

const BOEKEN = 'https://api.baserow.io/api/database/rows/table/111'

function req(query = {}) {
  return { method: 'GET', query, headers: { origin: '' } }
}

function res() {
  const r = { _status: 200, _body: null, _headers: {} }
  r.status    = (code) => { r._status = code; return r }
  r.json      = (body) => { r._body  = body;  return r }
  r.setHeader = (k, v) => { r._headers[k] = v }
  r.end       = () => {}
  return r
}

const BOEK_1 = { id: 1, titel: 'Vogels van Nederland', status: { value: 'beschikbaar' } }
const BOEK_2 = { id: 2, titel: 'Bomen en struiken',   status: { value: 'uitgeleend'  } }

// ─── Alle boeken ophalen ──────────────────────────────────────────────────────

describe('Catalogus – alle boeken', () => {
  it('geeft alle boeken terug op één pagina', async () => {
    server.use(
      http.get(`${BOEKEN}/`, () =>
        HttpResponse.json({ results: [BOEK_1, BOEK_2], next: null })
      ),
    )

    const response = res()
    await handler(req(), response)

    expect(response._status).toBe(200)
    expect(response._body.boeken).toHaveLength(2)
  })

  it('volgt paginering en combineert alle paginas', async () => {
    const pagina2Url = `${BOEKEN}/?size=100&user_field_names=true&page=2`.replace('https://', 'http://')

    server.use(
      http.get(`${BOEKEN}/`, ({ request }) => {
        const url = new URL(request.url)
        if (url.searchParams.get('page') === '2') {
          return HttpResponse.json({ results: [BOEK_2], next: null })
        }
        return HttpResponse.json({ results: [BOEK_1], next: pagina2Url })
      }),
    )

    const response = res()
    await handler(req(), response)

    expect(response._status).toBe(200)
    expect(response._body.boeken).toHaveLength(2)
    expect(response._body.boeken[0].id).toBe(1)
    expect(response._body.boeken[1].id).toBe(2)
  })

  it('gebruikt page size 100 (niet meer dan Baserow toestaat)', async () => {
    let gebruiktePageSize = null

    server.use(
      http.get(`${BOEKEN}/`, ({ request }) => {
        const url = new URL(request.url)
        gebruiktePageSize = Number(url.searchParams.get('size'))
        return HttpResponse.json({ results: [], next: null })
      }),
    )

    const response = res()
    await handler(req(), response)

    expect(gebruiktePageSize).toBeLessThanOrEqual(100)
  })

  it('geeft 500 als Baserow niet bereikbaar is', async () => {
    server.use(
      http.get(`${BOEKEN}/`, () => HttpResponse.json({ fout: 'Server error' }, { status: 500 })),
    )

    const response = res()
    await handler(req(), response)

    expect(response._status).toBe(500)
  })
})

// ─── Enkel boek ophalen ───────────────────────────────────────────────────────

describe('Catalogus – enkel boek (lenen.html)', () => {
  it('geeft één boek terug op basis van id', async () => {
    server.use(
      http.get(`${BOEKEN}/:id/`, () => HttpResponse.json(BOEK_1)),
    )

    const response = res()
    await handler(req({ id: '1' }), response)

    expect(response._status).toBe(200)
    expect(response._body.id).toBe(1)
  })

  it('geeft 400 bij ongeldig id', async () => {
    const response = res()
    await handler(req({ id: 'abc' }), response)
    expect(response._status).toBe(400)
  })

  it('geeft 404 als boek niet bestaat in Baserow', async () => {
    server.use(
      http.get(`${BOEKEN}/:id/`, () => HttpResponse.json({ fout: 'not found' }, { status: 404 })),
    )

    const response = res()
    await handler(req({ id: '999' }), response)

    expect(response._status).toBe(404)
  })
})
