# Scripts

Utility scripts for the copilot-api project.

## find-api-version.ts

Automatically discovers the correct GitHub Copilot API version by testing versions month-by-month from the current date backwards. Stops as soon as a working version is found.

### Usage

**Option 1: Using npm script (recommended)**
```bash
npm run find:api-version
```

**Option 2: Direct execution**
```bash
npx tsx scripts/find-api-version.ts
```

### Prerequisites

You need a valid GitHub Copilot token. The script will try to find it from:

1. `COPILOT_TOKEN` environment variable
2. `GITHUB_TOKEN` environment variable
3. `.copilot-state` file (if server was previously run)

### Example

```bash
# Set token first (if not already set)
export COPILOT_TOKEN="your_token_here"

# Run the script
npm run find:api-version
```

**Output:**
```
🔍 Finding correct GitHub Copilot API version...

✓ Token found
✓ VS Code version: 1.109.2

📅 Starting from 2026-02, testing backwards...

Testing 2026-02-01... ❌ FAILED (400)
Testing 2026-01-01... ❌ FAILED (400)
Testing 2025-12-01... ❌ FAILED (400)
Testing 2025-11-01... ❌ FAILED (400)
Testing 2025-10-01... ❌ FAILED (403)
Testing 2025-09-01... ❌ FAILED (400)
Testing 2025-08-01... ❌ FAILED (400)
Testing 2025-07-01... ❌ FAILED (400)
Testing 2025-06-01... ❌ FAILED (400)
Testing 2025-05-01... ✅ SUCCESS

============================================================
RESULT:
============================================================

✅ Found working API version: 2025-05-01
   Status: 200

🎯 Update your config in src/lib/api-config.ts:
   const API_VERSION = "2025-05-01"
```

### How It Works

The script:

1. Detects your VS Code version
2. Retrieves your Copilot token
3. Generates API versions starting from the current month going backwards (up to 24 months)
4. Tests each version by making a real request to GitHub Copilot API
5. **Stops immediately** when it finds the first working version
6. Reports the working version and provides update instructions

### Troubleshooting

**"No token found" error:**
- Make sure you have a valid Copilot token (not a GitHub Personal Access Token)
- Set the `COPILOT_TOKEN` environment variable
- Or run `npm start` to authenticate and generate a proper Copilot token

**All versions fail:**
- Your token might be a GitHub PAT instead of a Copilot-specific token
- Run `npm start` to authenticate with GitHub Copilot properly
- Check if your token is valid and not expired
- Verify network connectivity
- Check if GitHub Copilot API is accessible from your network

**403 Forbidden errors:**
- This usually means the token lacks proper Copilot access
- Authenticate using the server's OAuth flow: `npm start`
