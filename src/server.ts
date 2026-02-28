// Dynamic whitelist endpoint (single server, no scaling)
import { Hono } from "hono"
import { cors } from "hono/cors"
import { logger } from "hono/logger"
import { getConfig } from "~/lib/config"

import { completionRoutes } from "./routes/chat-completions/route"
import { embeddingRoutes } from "./routes/embeddings/route"
import { messageRoutes } from "./routes/messages/route"
import { modelRoutes } from "./routes/models/route"
import { responsesRoutes } from "./routes/responses/route"
import { tokenRoute } from "./routes/token/route"
import { usageRoute } from "./routes/usage/route"
import { whitelistRoute } from "./routes/admin/whitelist"

export const server = new Hono()


server.use(logger())
server.use(cors())

// Middleware for password and IP whitelist
server.use(async (c, next) => {
	const config = getConfig?.() || {}
	// IP Whitelist check
	if (Array.isArray(config.whitelistIPs) && config.whitelistIPs.length > 0) {
		// Enhancement 1: Skip whitelist for HTTP requests on port 4141
		const proto = c.req.header("x-forwarded-proto") || c.req.header("x-scheme") || c.req.url?.startsWith("http:") ? "http" : ""
		const port = c.req.header("x-forwarded-port") || c.req.header("x-real-port") || (c.req.url?.split(":")[2]?.split("/")[0] || "")
		if (proto === "http" && port === "4141") {
			await next()
			return
		}

		// Enhancement 2: Split IPs and check each
		const ipRaw = c.req.header("x-forwarded-for") || c.req.header("x-real-ip") || c.req.raw.remoteAddress || ""
		const ipList = ipRaw.split(",").map(ip => ip.trim()).filter(Boolean)
        console.log("ipRaw:", ipRaw, "ipList:", ipList, "whitelist:", config.whitelistIPs)
		const isIpAllowed = (ip: string, cidrOrIp: string) => {
			if (cidrOrIp.includes("/")) {
				try {
					const [range, bits] = cidrOrIp.split("/")
					const ipToLong = (ip: string) => ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0)
					const mask = ~(2 ** (32 - parseInt(bits, 10)) - 1)
					return (ipToLong(ip) & mask) === (ipToLong(range) & mask)
				} catch {
					return false
				}
			}
			return ip === cidrOrIp
		}
		const allowed = ipList.some(ip => config.whitelistIPs.some(entry => isIpAllowed(ip, entry)))
		if (!allowed) {
			console.warn(`Blocked request from IP(s) ${ipRaw}: not in whitelist [${config.whitelistIPs?.join(", ")}]`)
			return c.text(`Forbidden: IP(s) ${ipRaw} not whitelisted`, 403)
		}
	}
	// Password/token check (OpenAI compatible)
	if (config.apiPassword) {
		const authHeader = c.req.header("authorization")
		const token = authHeader && authHeader.startsWith("Bearer ") ? authHeader.slice(7) : undefined
		if (token !== config.apiPassword) {
			return c.text("Unauthorized: Invalid token", 401)
		}
	}
	await next()
})

server.get("/", (c) => c.text("Server running"))

server.route("/chat/completions", completionRoutes)
server.route("/models", modelRoutes)
server.route("/embeddings", embeddingRoutes)
server.route("/usage", usageRoute)
server.route("/admin/whitelist", whitelistRoute)
server.route("/token", tokenRoute)
server.route("/responses", responsesRoutes)

// Compatibility with tools that expect v1/ prefix
server.route("/v1/chat/completions", completionRoutes)
server.route("/v1/models", modelRoutes)
server.route("/v1/embeddings", embeddingRoutes)
server.route("/v1/responses", responsesRoutes)

// Anthropic compatible endpoints
server.route("/v1/messages", messageRoutes)
