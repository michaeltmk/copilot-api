#!/usr/bin/env bun
/**
 * Script to find the correct GitHub Copilot API version
 * Tests API versions month by month from current date backwards
 * Stops once a working version is found
 */

import { randomUUID } from "node:crypto"

/**
 * Generate API version strings starting from current month going backwards
 * @param maxMonths Maximum number of months to generate (default: 24 months back)
 */
function generateApiVersions(maxMonths = 24): string[] {
  const versions: string[] = []
  const now = new Date()
  
  for (let i = 0; i < maxMonths; i++) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, "0")
    versions.push(`${year}-${month}-01`)
  }
  
  return versions
}

const COPILOT_VERSION = "0.26.7"
const EDITOR_PLUGIN_VERSION = `copilot-chat/${COPILOT_VERSION}`
const USER_AGENT = `GitHubCopilotChat/${COPILOT_VERSION}`

interface TestResult {
  version: string
  success: boolean
  statusCode?: number
  error?: string
}

async function getVSCodeVersion(): Promise<string> {
  try {
    const { execSync } = await import("node:child_process")
    const output = execSync("code --version", { encoding: "utf-8" })
    return output.split("\n")[0] || "1.95.0"
  } catch {
    return "1.95.0"
  }
}

async function getCopilotToken(): Promise<string> {
  const tokenEnv = process.env.COPILOT_TOKEN || process.env.GITHUB_TOKEN
  if (tokenEnv) {
    return tokenEnv
  }

  // Try to read from state file if server was running
  try {
    const { readFile, access } = await import("node:fs/promises")
    await access(".copilot-state")
    const content = await readFile(".copilot-state", "utf-8")
    const state = JSON.parse(content)
    if (state.copilotToken) {
      return state.copilotToken
    }
  } catch {
    // Ignore
  }

  throw new Error(
    "No token found. Please set COPILOT_TOKEN or GITHUB_TOKEN environment variable, or start the server first to generate a token."
  )
}

async function testApiVersion(
  version: string,
  token: string,
  vsCodeVersion: string
): Promise<TestResult> {
  const url = "https://api.githubcopilot.com/chat/completions"

  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "copilot-integration-id": "vscode-chat",
    "editor-version": `vscode/${vsCodeVersion}`,
    "editor-plugin-version": EDITOR_PLUGIN_VERSION,
    "user-agent": USER_AGENT,
    "openai-intent": "conversation-panel",
    "x-github-api-version": version,
    "x-request-id": randomUUID(),
    "x-vscode-user-agent-library-version": "electron-fetch",
  }

  const body = JSON.stringify({
    messages: [
      {
        role: "user",
        content: "Hello, test message",
      },
    ],
    model: "gpt-4o",
    stream: false,
    max_tokens: 10,
  })

  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body,
    })

    if (response.ok) {
      return {
        version,
        success: true,
        statusCode: response.status,
      }
    }

    const errorText = await response.text()
    return {
      version,
      success: false,
      statusCode: response.status,
      error: errorText.slice(0, 200),
    }
  } catch (error) {
    return {
      version,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

async function main() {
  console.log("🔍 Finding correct GitHub Copilot API version...\n")

  try {
    const token = await getCopilotToken()
    console.log("✓ Token found")

    const vsCodeVersion = await getVSCodeVersion()
    console.log(`✓ VS Code version: ${vsCodeVersion}\n`)

    const apiVersions = generateApiVersions()
    const now = new Date()
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
    
    console.log(`📅 Starting from ${currentMonth}, testing backwards...\n`)

    let workingVersion: TestResult | null = null

    for (const version of apiVersions) {
      process.stdout.write(`Testing ${version}... `)
      const result = await testApiVersion(version, token, vsCodeVersion)

      if (result.success) {
        console.log("✅ SUCCESS")
        workingVersion = result
        break // Stop on first success
      } else {
        console.log(`❌ FAILED (${result.statusCode || "error"})`)
        if (result.error) {
          console.log(`   ${result.error.split("\n")[0]}`)
        }
      }

      // Small delay to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 500))
    }

    console.log("\n" + "=".repeat(60))
    console.log("RESULT:")
    console.log("=".repeat(60) + "\n")

    if (!workingVersion) {
      console.log("❌ No working API version found after testing 24 months.")
      console.log("\nPossible issues:")
      console.log("  - Token might be expired or invalid")
      console.log("  - Token lacks Copilot access (requires proper Copilot authentication)")
      console.log("  - Network connectivity issues")
      console.log("  - GitHub Copilot API might be down")
      console.log("\n💡 Tip: Make sure you're using a Copilot token (not a GitHub PAT)")
      console.log("   Run 'npm start' to authenticate and get a proper Copilot token")
      process.exit(1)
    }

    console.log(`✅ Found working API version: ${workingVersion.version}`)
    console.log(`   Status: ${workingVersion.statusCode}`)

    console.log(`\n🎯 Update your config in src/lib/api-config.ts:`)
    console.log(`   const API_VERSION = "${workingVersion.version}"`)
  } catch (error) {
    console.error("\n❌ Error:", error instanceof Error ? error.message : error)
    process.exit(1)
  }
}

main()
