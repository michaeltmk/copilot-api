import { Hono } from "hono"
import fs from "fs"
import { PATHS } from "~/lib/paths"
import { getConfig } from "~/lib/config"

export const whitelistRoute = new Hono()

whitelistRoute.post("/", async (c) => {
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
