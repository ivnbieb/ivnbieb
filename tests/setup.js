import { setupServer } from 'msw/node'
import { beforeAll, afterEach, afterAll } from 'vitest'

export const server = setupServer()

beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())
