import http from 'node:http'

export const createGhServer = async () => {
  const requests = []
  let routes = {}

  const server = http.createServer((req, res) => {
    let body = ''
    req.on('data', c => body += c)
    req.on('end', () => {
      requests.push({method: req.method, url: req.url, headers: req.headers, body})
      const key = `${req.method} ${req.url}`
      for (const [pattern, handler] of Object.entries(routes)) {
        if (key.includes(pattern) || new RegExp(pattern).test(key)) {
          return handler(req, res, body)
        }
      }
      res.writeHead(404)
      res.end('{}')
    })
  })

  await new Promise(r => server.listen(0, '127.0.0.1', r))

  return {
    url: `http://127.0.0.1:${server.address().port}`,
    requests,
    routes,
    reset() { requests.length = 0; routes = {}; return routes },
    setRoutes(r) { Object.assign(routes, r) },
    close() { server.close() },
  }
}
