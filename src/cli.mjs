#!/usr/bin/env node

const API_BASE = 'https://repo2md.evm.workers.dev'

async function main() {
  const args = process.argv.slice(2)

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log(`gh2md - Convert GitHub repos to markdown

Usage:
  gh2md <github-url>
  gh2md <owner/repo>
  gh2md <owner/repo/path>

Examples:
  gh2md https://github.com/honojs/hono
  gh2md honojs/hono
  gh2md honojs/hono/src
  gh2md https://github.com/honojs/hono/tree/main/src
  gh2md https://github.com/honojs/hono/blob/main/README.md`)
    process.exit(0)
  }

  let [url] = args
  if (!url) {
    console.error('Error: Missing GitHub URL')
    process.exit(1)
  }

  if (!url.includes('github.com')) {
    const parts = url.split('/')
    if (parts.length === 2) {
      url = `github.com/${url}`
    } else if (parts.length > 2) {
      const [owner, repo, ...rest] = parts
      url = `github.com/${owner}/${repo}/tree/main/${rest.join('/')}`
    } else {
      url = `github.com/${url}`
    }
  }

  const path = url.replace(/^https?:\/\//, '')
  const response = await fetch(`${API_BASE}/${path}`)

  if (!response.ok) {
    console.error(`Error: ${response.status} ${response.statusText}`)
    const text = await response.text()
    if (text) console.error(text)
    process.exit(1)
  }

  const text = await response.text()
  console.log(text)
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : 'the world is ending')
  process.exit(1)
})
