import { describe, it, expect } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from './setup.js'
import handler from '../api/boek.js'

const BOEKEN      = 'https://api.baserow.io/api/database/rows/table/111'
const UITLENINGEN = 'https://api.baserow.io/api/database/rows/table/222'

const BESCHIKBAAR_BOEK = { id: 5, titel: 'Vogels van Nederland', status: { value: 'beschikbaar' } }
const UITGELEEND_BOEK  = { id: 5, titel: 'Vogels van Nederland', status: { value: 'uitgeleend' } }
const OPEN_UITLENING   = { id: 99, boek_id: 5, lid_email: 'jan@test.nl', ingeleverd_op: null }

function req(body) {
  return { method: 'POST', body, headers: { origin: '' } }
}

function res() {
  const r = { _status: 200, _body: null }
  r.status    = (code) => { r._status = code; return r }
  r.json      = (body) => { r._body  = body;  return r }
  r.setHeader = () => {}
  r.end       = () => {}
  return r
}

// ─── Lenen ──────────────────────────────────────────────────────────────────

describe('Lenen', () => {
  it('schrijft uitlening en zet boek op uitgeleend', async () => {
    let geschrevenUitlening = null
    let nieuweBoekStatus    = null

    server.use(
      http.get(`${BOEKEN}/:id/`,      () => HttpResponse.json(BESCHIKBAAR_BOEK)),
      http.post(`${UITLENINGEN}/`,    async ({ request }) => {
        geschrevenUitlening = await request.json()
        return HttpResponse.json({ id: 99 })
      }),
      http.patch(`${BOEKEN}/:id/`,    async ({ request }) => {
        nieuweBoekStatus = (await request.json()).status
        return HttpResponse.json({ id: 5 })
      }),
    )

    const response = res()
    await handler(req({ boekId: 5, naam: 'Jan de Vries', email: 'jan@test.nl', actie: 'lenen' }), response)

    expect(response._status).toBe(200)
    expect(response._body.ok).toBe(true)

    // Uitlening bevat alle verplichte velden
    expect(geschrevenUitlening).toMatchObject({ boek_id: 5, lid_naam: 'Jan de Vries', lid_email: 'jan@test.nl' })
    expect(geschrevenUitlening.uitgeleend_op).toMatch(/^\d{4}-\d{2}-\d{2}$/)

    // Boekstatus is bijgewerkt
    expect(nieuweBoekStatus).toBe('uitgeleend')
  })

  it('weigert lenen als boek al uitgeleend is — schrijft niets', async () => {
    let postGeroepen  = false
    let patchGeroepen = false

    server.use(
      http.get(`${BOEKEN}/:id/`,   () => HttpResponse.json(UITGELEEND_BOEK)),
      http.post(`${UITLENINGEN}/`, () => { postGeroepen  = true; return HttpResponse.json({}) }),
      http.patch(`${BOEKEN}/:id/`, () => { patchGeroepen = true; return HttpResponse.json({}) }),
    )

    const response = res()
    await handler(req({ boekId: 5, naam: 'Jan de Vries', email: 'jan@test.nl', actie: 'lenen' }), response)

    expect(response._status).toBe(409)
    expect(postGeroepen).toBe(false)
    expect(patchGeroepen).toBe(false)
  })
})

// ─── Inleveren ───────────────────────────────────────────────────────────────

describe('Inleveren', () => {
  it('sluit uitlening en zet boek terug op beschikbaar', async () => {
    let gesloten      = null
    let nieuweStatus  = null

    server.use(
      http.get(`${BOEKEN}/:id/`,        () => HttpResponse.json(UITGELEEND_BOEK)),
      http.get(`${UITLENINGEN}/`,       () => HttpResponse.json({ results: [OPEN_UITLENING] })),
      http.patch(`${UITLENINGEN}/:id/`, async ({ request }) => {
        gesloten = await request.json()
        return HttpResponse.json({ id: 99 })
      }),
      http.patch(`${BOEKEN}/:id/`,      async ({ request }) => {
        nieuweStatus = (await request.json()).status
        return HttpResponse.json({ id: 5 })
      }),
    )

    const response = res()
    await handler(req({ boekId: 5, naam: 'Jan de Vries', email: 'jan@test.nl', actie: 'inleveren' }), response)

    expect(response._status).toBe(200)
    expect(gesloten.ingeleverd_op).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(nieuweStatus).toBe('beschikbaar')
  })

  it('geeft 404 als geen open uitlening gevonden voor dit e-mailadres', async () => {
    let patchGeroepen = false

    server.use(
      http.get(`${BOEKEN}/:id/`,   () => HttpResponse.json(UITGELEEND_BOEK)),
      http.get(`${UITLENINGEN}/`,  () => HttpResponse.json({ results: [] })),
      http.patch(`${BOEKEN}/:id/`, () => { patchGeroepen = true; return HttpResponse.json({}) }),
    )

    const response = res()
    await handler(req({ boekId: 5, naam: 'Piet', email: 'piet@test.nl', actie: 'inleveren' }), response)

    expect(response._status).toBe(404)
    expect(patchGeroepen).toBe(false)
  })

  it('boek kan opnieuw worden geleend na inlevering', async () => {
    // Eerste uitlening ingeleverd → ingeleverd_op gevuld → boek beschikbaar
    // Tweede uitlening: nieuw verzoek slaagt
    server.use(
      http.get(`${BOEKEN}/:id/`,      () => HttpResponse.json(BESCHIKBAAR_BOEK)),
      http.post(`${UITLENINGEN}/`,    () => HttpResponse.json({ id: 100 })),
      http.patch(`${BOEKEN}/:id/`,    () => HttpResponse.json({ id: 5 })),
    )

    const response = res()
    await handler(req({ boekId: 5, naam: 'Sanne Jansen', email: 'sanne@test.nl', actie: 'lenen' }), response)

    expect(response._status).toBe(200)
  })
})

// ─── Validatie ───────────────────────────────────────────────────────────────

describe('Validatie', () => {
  it('400 bij naam korter dan 2 tekens', async () => {
    const response = res()
    await handler(req({ boekId: 5, naam: 'X', email: 'jan@test.nl', actie: 'lenen' }), response)
    expect(response._status).toBe(400)
  })

  it('400 bij ongeldig e-mailadres', async () => {
    const response = res()
    await handler(req({ boekId: 5, naam: 'Jan de Vries', email: 'geen-email', actie: 'lenen' }), response)
    expect(response._status).toBe(400)
  })

  it('400 bij ongeldig boekId', async () => {
    const response = res()
    await handler(req({ boekId: 'abc', naam: 'Jan de Vries', email: 'jan@test.nl', actie: 'lenen' }), response)
    expect(response._status).toBe(400)
  })

  it('400 bij ongeldige actie', async () => {
    const response = res()
    await handler(req({ boekId: 5, naam: 'Jan de Vries', email: 'jan@test.nl', actie: 'stelen' }), response)
    expect(response._status).toBe(400)
  })

  it('405 bij GET request', async () => {
    const response = res()
    await handler({ method: 'GET', body: {}, headers: { origin: '' } }, response)
    expect(response._status).toBe(405)
  })
})

// ─── Sync risico ─────────────────────────────────────────────────────────────

describe('Sync risico', () => {
  it('geeft 500 en patcht boek NIET als POST naar Uitleningen faalt', async () => {
    let patchGeroepen = false

    server.use(
      http.get(`${BOEKEN}/:id/`,   () => HttpResponse.json(BESCHIKBAAR_BOEK)),
      http.post(`${UITLENINGEN}/`, () => HttpResponse.json({ fout: 'Server error' }, { status: 500 })),
      http.patch(`${BOEKEN}/:id/`, () => { patchGeroepen = true; return HttpResponse.json({}) }),
    )

    const response = res()
    await handler(req({ boekId: 5, naam: 'Jan de Vries', email: 'jan@test.nl', actie: 'lenen' }), response)

    expect(response._status).toBe(500)
    expect(patchGeroepen).toBe(false) // boekstatus blijft 'beschikbaar'
  })

  it('⚠️ uitlening aangemaakt maar boekstatus NIET geüpdated → inconsistente staat', async () => {
    let uitleningAangemaakt = false

    server.use(
      http.get(`${BOEKEN}/:id/`,   () => HttpResponse.json(BESCHIKBAAR_BOEK)),
      http.post(`${UITLENINGEN}/`, () => { uitleningAangemaakt = true; return HttpResponse.json({ id: 99 }) }),
      http.patch(`${BOEKEN}/:id/`, () => HttpResponse.json({ fout: 'Server error' }, { status: 500 })),
    )

    const response = res()
    await handler(req({ boekId: 5, naam: 'Jan de Vries', email: 'jan@test.nl', actie: 'lenen' }), response)

    expect(response._status).toBe(500)
    // Uitlening IS aangemaakt, maar boek staat nog op 'beschikbaar'
    // → iemand anders kan hetzelfde boek opnieuw lenen
    expect(uitleningAangemaakt).toBe(true)
  })
})
