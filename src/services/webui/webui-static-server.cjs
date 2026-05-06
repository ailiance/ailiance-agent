const http = require("http")
const fs = require("fs")
const path = require("path")
const url = require("url")

const [, , buildDir, portStr] = process.argv
const port = parseInt(portStr, 10) || 25463
const root = path.resolve(buildDir)

const MIME = {
	".html": "text/html",
	".js": "application/javascript",
	".css": "text/css",
	".svg": "image/svg+xml",
	".png": "image/png",
	".jpg": "image/jpeg",
	".woff": "font/woff",
	".woff2": "font/woff2",
	".json": "application/json",
}

const server = http.createServer((req, res) => {
	const reqPath = decodeURIComponent(url.parse(req.url).pathname)
	const safe = path.normalize(reqPath).replace(/^(\.\.[/\\])+/, "")
	let filePath = path.join(root, safe)
	fs.stat(filePath, (err, stat) => {
		if (err || !stat.isFile()) {
			// SPA fallback
			filePath = path.join(root, "index.html")
		}
		fs.readFile(filePath, (e2, data) => {
			if (e2) {
				res.writeHead(404)
				res.end("not found")
				return
			}
			const ext = path.extname(filePath).toLowerCase()
			res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" })
			res.end(data)
		})
	})
})

server.listen(port, "127.0.0.1")
