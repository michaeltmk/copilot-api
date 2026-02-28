// Dynamic whitelist endpoint (single server, no scaling)
import fs from "fs"
import { PATHS } from "~/lib/paths"

server.post("/admin/whitelist", async (c) => {
	const config = getConfig?.() || {}
	let ips: string[] = []
	try {
		const body = await c.req.json()
		if (Array.isArray(body.whitelistIPs)) {
			ips = body.whitelistIPs.map(ip => String(ip).trim()).filter(Boolean)
		} else if (typeof body.whitelistIPs === "string") {
			ips = body.whitelistIPs.split(",").map(ip => ip.trim()).filter(Boolean)
		}
		// Always preserve env whitelist IPs
		const envIps = process.env.COPILOT_WHITELIST_IPS
			? process.env.COPILOT_WHITELIST_IPS.split(",").map(ip => ip.trim()).filter(Boolean)
			: []
		const finalIps = Array.from(new Set([...envIps, ...ips]))
		config.whitelistIPs = finalIps
		// Save only non-env IPs to config file
		const raw = fs.readFileSync(PATHS.CONFIG_PATH, "utf8")
		const fileConfig = raw.trim() ? JSON.parse(raw) : {}
		fileConfig.whitelistIPs = ips
		fs.writeFileSync(PATHS.CONFIG_PATH, `${JSON.stringify(fileConfig, null, 2)}\n`, "utf8")
		// Update cached config
		if (typeof global !== "undefined") {
			global.cachedConfig = undefined
		}
		return c.json({ success: true, whitelistIPs: finalIps })
	} catch (err) {
		return c.json({ success: false, error: String(err) }, 400)
	}
})
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

export const server = new Hono()


server.use(logger())
server.use(cors())

// Middleware for password and IP whitelist
server.use(async (c, next) => {
	const config = getConfig?.() || {}
	// IP Whitelist check
	if (Array.isArray(config.whitelistIPs) && config.whitelistIPs.length > 0) {
		const ip = c.req.header("x-forwarded-for") || c.req.header("x-real-ip") || c.req.raw.remoteAddress || ""
		const isIpAllowed = (ip: string, cidrOrIp: string) => {
			if (cidrOrIp.includes("/")) {
				// CIDR support
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
		const allowed = config.whitelistIPs.some((entry) => isIpAllowed(ip, entry))
		if (!allowed) {
			return c.text("Forbidden: IP not whitelisted", 403)
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
server.route("/token", tokenRoute)
server.route("/responses", responsesRoutes)

// Compatibility with tools that expect v1/ prefix
server.route("/v1/chat/completions", completionRoutes)
server.route("/v1/models", modelRoutes)
server.route("/v1/embeddings", embeddingRoutes)
server.route("/v1/responses", responsesRoutes)

// Anthropic compatible endpoints
server.route("/v1/messages", messageRoutes)
