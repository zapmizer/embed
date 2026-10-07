import { GlobalRegistrator } from '@happy-dom/global-registrator'

GlobalRegistrator.register({
  url: 'http://app.test/',
  settings: {
    fetch: {
      interceptor: {
        beforeAsyncRequest: async ({ window }) => new window.Response('<html></html>', { status: 200, headers: { 'content-type': 'text/html' } }),
      },
    },
  },
})
