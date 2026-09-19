import http from 'node:http'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = fileURLToPath(new URL('../public/', import.meta.url))
const port = Number(process.env.NUMBERS_PORT ?? 4194)
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('NUMBERS_PORT must be between 1024 and 65535.')
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.mjs': 'text/javascript', '.txt': 'text/plain' }
http.createServer(async (req, res) => {
  try {
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return }
    const url = new URL(req.url, 'http://localhost')
    const requested = decodeURIComponent(url.pathname)
    const target = path.resolve(root, `.${requested.endsWith('/') ? `${requested}index.html` : requested}`)
    if (!target.startsWith(root) || requested.split('/').some((part) => part.startsWith('.'))) { res.writeHead(403); res.end(); return }
    const body = await readFile(target)
    res.writeHead(200, { 'Content-Type': `${types[path.extname(target)] ?? 'application/octet-stream'}; charset=utf-8`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' })
    res.end(req.method === 'HEAD' ? undefined : body)
  } catch { res.writeHead(404); res.end('Not found') }
}).listen(port, '127.0.0.1', () => console.log(`Remember Your Numbers: http://127.0.0.1:${port}`))
