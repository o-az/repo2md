#!/usr/bin/env node

const API_BASE = 'https://2md.sauce.wiki'

/**
 * @param {string[]} args
 * @returns {{ url: string | null; excludes: string[]; includes: string[]; submodules: boolean }}
 */
function parseArgs(args) {
  let url = null
  /** @type {string[]} */
  const excludes = []
  /** @type {string[]} */
  const includes = []
  let submodules = false

  for (let index = 0; index < args.length; index++) {
    const arg = args[index]
    if (!arg) continue

    if (arg === '--exclude' || arg.startsWith('--exclude=')) {
      const pattern = arg.includes('=') ? arg.split('=')[1] : args[++index]
      if (pattern) excludes.push(pattern)
    } else if (arg === '--include' || arg.startsWith('--include=')) {
      const pattern = arg.includes('=') ? arg.split('=')[1] : args[++index]
      if (pattern) includes.push(pattern)
    } else if (arg === '--submodules') submodules = true
    else if (!arg.startsWith('--')) url = arg
  }
  return { url, excludes, includes, submodules }
}

/** @returns {Promise<void>} */
async function main() {
  const args = process.argv.slice(2)

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log(/* md */ `2md - Convert repos to markdown

Usage:
  2md <github-url>
  2md <owner/repo>
  2md <owner/repo/path>

Options:
  --exclude <pattern>  Exclude files matching pattern (repeatable)
  --include <pattern>  Include only files matching pattern (repeatable)
  --submodules         Include git submodules

Patterns: suffix (.test.ts), directory (src/), glob (*.test.*), contains (test)

Examples:
  2md honojs/hono
  2md https://github.com/honojs/hono
  2md honojs/hono/src
  2md https://github.com/honojs/hono/tree/main/src
  2md https://github.com/honojs/hono/blob/main/README.md
  2md honojs/hono --exclude=.test.ts --exclude=.spec.ts
  2md transmissions11/solmate --submodules

Using npx:
  npx --yes github:o-az/2md honojs/hono`)
    process.exit(0)
  }

  const { url, excludes, includes, submodules } = parseArgs(args)

  if (!url) {
    console.error('Error: Missing URL')
    process.exit(1)
  }

  let resolvedUrl = url
  if (!resolvedUrl.includes('github.com')) {
    const parts = resolvedUrl.split('/')
    if (parts.length === 2) resolvedUrl = `github.com/${resolvedUrl}`
    else if (parts.length > 2) {
      const [owner, repo, ...rest] = parts
      const path = rest.join('/')
      const lastPart = rest[rest.length - 1] || ''
      const isFile = lastPart.includes('.')
      resolvedUrl = `github.com/${owner}/${repo}/${isFile ? 'blob' : 'tree'}/main/${path}`
    } else resolvedUrl = `github.com/${resolvedUrl}`
  }

  const path = resolvedUrl.replace(/^https?:\/\//, '')
  const params = new URLSearchParams()
  for (const exclude of excludes) params.append('exclude', exclude)
  for (const include of includes) params.append('include', include)
  if (submodules) params.set('submodules', 'true')
  const qs = params.toString()
  const response = await fetch(`${API_BASE}/${path}${qs ? '?' + qs : ''}`)

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
