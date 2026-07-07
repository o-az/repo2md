import { env } from 'cloudflare:workers'
import { describe, expect, test } from 'vitest'

import { app } from '#index.ts'

const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

async function fetchApp(
  path: string,
  options?: { followRedirects?: boolean; browser?: boolean }
): Promise<Response> {
  const url = path.startsWith('http') ? path : `http://localhost/${path}`
  const headers: Record<string, string> = {}
  if (options?.browser) headers['user-agent'] = BROWSER_UA

  const res = await app.request(url, { redirect: 'manual', headers }, env)

  if (options?.followRedirects && res.status >= 300 && res.status < 400) {
    const location = res.headers.get('location')
    if (location) {
      const redirectUrl = location.startsWith('http') ? location : `http://localhost${location}`
      return app.request(redirectUrl, {}, env)
    }
  }
  return res
}

describe('Browser redirects', () => {
  test('whole repo (no https)', async () => {
    const res = await fetchApp('github.com/o-az/2md', { browser: true })
    expect(res.status).toBe(301)
    expect(res.headers.get('location')).toContain('gh_o-az_2md@main.md')
  })

  test('whole repo (with https in path)', async () => {
    const res = await app.request(
      'http://localhost/https://github.com/o-az/2md',
      { redirect: 'manual', headers: { 'user-agent': BROWSER_UA } },
      env
    )
    expect(res.status).toBe(301)
    expect(res.headers.get('location')).toContain('gh_o-az_2md@main.md')
  })

  test('directory (tree/main)', async () => {
    const res = await fetchApp('github.com/o-az/2md/tree/main/src', { browser: true })
    expect(res.status).toBe(301)
    expect(res.headers.get('location')).toContain('gh_o-az_2md@main_src.md')
  })

  test('directory shorthand (no tree)', async () => {
    const res = await fetchApp('github.com/o-az/2md/src', { browser: true })
    expect(res.status).toBe(301)
    expect(res.headers.get('location')).toContain('gh_o-az_2md@main_src.md')
  })
})

describe('Non-browser direct serving', () => {
  test('whole repo returns content directly', async () => {
    const res = await fetchApp('github.com/o-az/2md')
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).toContain('o-az/2md')
  })

  test('directory returns content directly', async () => {
    const res = await fetchApp('github.com/o-az/2md/tree/main/src')
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).toContain('src/index.ts')
  })
})

describe('File handling', () => {
  test('single file (blob) - browser redirect', async () => {
    const res = await fetchApp('github.com/o-az/2md/blob/main/justfile', { browser: true })
    expect(res.status).toBe(301)
    expect(res.headers.get('location')).toContain('ghf_o-az_2md@main_justfile.md')
  })

  test('single file (blob) - non-browser direct', async () => {
    const res = await fetchApp('github.com/o-az/2md/blob/main/justfile')
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).toContain('just --list')
  })

  test('file shorthand (justfile)', async () => {
    const res = await fetchApp('github.com/o-az/2md/justfile')
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).toContain('just --list')
  })

  test('file shorthand (with extension)', async () => {
    const res = await fetchApp('github.com/o-az/2md/biome.json')
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).toContain('biomejs')
  })

  test('file in subdirectory', async () => {
    const res = await fetchApp('github.com/o-az/2md/src/index.ts')
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).toContain('Hono')
  })
})

describe('Branch handling', () => {
  test('different branch (main) - browser redirect', async () => {
    const res = await fetchApp('github.com/honojs/hono/tree/main/src', { browser: true })
    expect(res.status).toBe(301)
    expect(res.headers.get('location')).toContain('gh_honojs_hono@main_src.md')
  })

  test('tag as branch - browser redirect', async () => {
    const res = await fetchApp('github.com/honojs/hono/tree/v4.0.0/src', { browser: true })
    expect(res.status).toBe(301)
    expect(res.headers.get('location')).toContain('gh_honojs_hono@v4.0.0_src.md')
  })

  test('tag returns content directly for non-browser', async () => {
    const res = await fetchApp('github.com/honojs/hono/tree/v4.0.0/src')
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).toContain('honojs/hono@v4.0.0/src')
  })

  test('tag returns content with tag in header via clean path', async () => {
    const res = await fetchApp('gh_honojs_hono@v4.0.0_src.md')
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).toContain('honojs/hono@v4.0.0')
  })
})

describe('Clean path format', () => {
  test('clean path (repo)', async () => {
    const res = await fetchApp('gh_o-az_2md@main.md')
    if (res.status !== 200) {
      const text = await res.text()
      console.error(`Unexpected status ${res.status}:`, text)
    }
    expect(res.status).toBe(200)
  })

  test('clean path (directory)', async () => {
    const res = await fetchApp('gh_o-az_2md@main_src.md')
    if (res.status !== 200) {
      const text = await res.text()
      console.error(`Unexpected status ${res.status}:`, text)
    }
    expect(res.status).toBe(200)
  })

  test('clean path (file)', async () => {
    const res = await fetchApp('ghf_o-az_2md@main_justfile.md')
    if (res.status !== 200) {
      const text = await res.text()
      console.error(`Unexpected status ${res.status}:`, text)
    }
    expect(res.status).toBe(200)
  })

  test('clean path with tag', async () => {
    const res = await fetchApp('gh_honojs_hono@v4.0.0_src.md')
    if (res.status !== 200) {
      const text = await res.text()
      console.error(`Unexpected status ${res.status}:`, text)
    }
    expect(res.status).toBe(200)
  })
})

describe('Edge cases', () => {
  test('directory with dot in name', async () => {
    const res = await fetchApp('github.com/o-az/2md/tree/main/.github')
    if (res.status !== 200) {
      const text = await res.text()
      console.error(`Unexpected status ${res.status}:`, text)
    }
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).toContain('.github')
  })

  test('file with multiple dots', async () => {
    const res = await fetchApp('github.com/o-az/2md/.env.example')
    if (res.status !== 200) {
      const text = await res.text()
      console.error(`Unexpected status ${res.status}:`, text)
    }
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).toContain('NODE_ENV')
  })

  test('repo with hyphen in owner/name', async () => {
    const res = await fetchApp('github.com/o-az/2md')
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).toContain('o-az/2md')
  })
})

describe('Submodules support', () => {
  test('submodules param on repo with submodules', async () => {
    const res = await fetchApp('github.com/foundry-rs/forge-std?submodules=true')
    if (res.status !== 200) {
      const text = await res.text()
      console.error(`Unexpected status ${res.status}:`, text)
    }
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).toContain('forge-std')
  })

  test('submodules param returns submodule content', async () => {
    const res = await fetchApp('github.com/transmissions11/solmate?submodules=true')
    if (res.status !== 200) {
      const text = await res.text()
      console.error(`Unexpected status ${res.status}:`, text)
    }
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).toContain('# Submodule: lib/ds-test')
  })

  test('no submodules param = no submodule header', async () => {
    const res = await fetchApp('github.com/transmissions11/solmate')
    if (res.status !== 200) {
      const text = await res.text()
      console.error(`Unexpected status ${res.status}:`, text)
    }
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).toContain('solmate')
    expect(text).not.toContain('# Submodule:')
  })

  test('clean path with submodules', async () => {
    const res = await fetchApp('gh_transmissions11_solmate@main.md?submodules=true')
    if (res.status !== 200) {
      const text = await res.text()
      console.error(`Unexpected status ${res.status}:`, text)
    }
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).toContain('# Submodule: lib/ds-test')
  })
})

describe('Include/Exclude filters', () => {
  test('exclude single pattern', async () => {
    const res = await fetchApp('gh_o-az_2md@main.md?exclude=.ts')
    if (res.status !== 200) {
      const text = await res.text()
      console.error(`Unexpected status ${res.status}:`, text)
    }
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).toContain('justfile')
    expect(text).not.toContain('## src/index.ts')
  })

  test('exclude brace syntax', async () => {
    const res = await fetchApp('gh_o-az_2md@main.md?exclude={.ts,.tsx}')
    if (res.status !== 200) {
      const text = await res.text()
      console.error(`Unexpected status ${res.status}:`, text)
    }
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).toContain('biome.json')
    expect(text).not.toContain('## src/index.ts')
  })

  test('include single pattern', async () => {
    const res = await fetchApp('gh_o-az_2md@main.md?include=.json')
    if (res.status !== 200) {
      const text = await res.text()
      console.error(`Unexpected status ${res.status}:`, text)
    }
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).toContain('package.json')
    expect(text).not.toContain('justfile')
  })

  test('include brace syntax', async () => {
    const res = await fetchApp('gh_o-az_2md@main.md?include={.json,.toml}')
    if (res.status !== 200) {
      const text = await res.text()
      console.error(`Unexpected status ${res.status}:`, text)
    }
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).toContain('biome.json')
  })

  test('include directory', async () => {
    const res = await fetchApp('gh_o-az_2md@main.md?include=src/')
    if (res.status !== 200) {
      const text = await res.text()
      console.error(`Unexpected status ${res.status}:`, text)
    }
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).toContain('src/index.ts')
    expect(text).not.toContain('## justfile')
  })

  test('include then exclude', async () => {
    const url = new URL('http://localhost/gh_o-az_2md@main.md')
    url.searchParams.set('include', 'src/')
    url.searchParams.set('exclude', '.tsx')
    const res = await app.request(url.toString(), {}, env)
    if (res.status !== 200) {
      const text = await res.text()
      console.error(`Unexpected status ${res.status}:`, text)
    }
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).toContain('src/index.ts')
    expect(text).not.toContain('## src/landing.tsx')
  })

  test('multiple exclude params', async () => {
    const url = new URL('http://localhost/gh_o-az_2md@main.md')
    url.searchParams.append('exclude', '.ts')
    url.searchParams.append('exclude', '.json')
    const res = await app.request(url.toString(), {}, env)
    if (res.status !== 200) {
      const text = await res.text()
      console.error(`Unexpected status ${res.status}:`, text)
    }
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).toContain('justfile')
    expect(text).not.toContain('## src/index.ts')
    expect(text).not.toContain('## package.json')
  })

  test('glob pattern exclude', async () => {
    const res = await fetchApp('gh_o-az_2md@main_src.md?exclude=*.test.*')
    if (res.status !== 200) {
      const text = await res.text()
      console.error(`Unexpected status ${res.status}:`, text)
    }
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).toContain('index.ts')
  })

  test('clean path with exclude', async () => {
    const res = await fetchApp('gh_o-az_2md@main.md?exclude=.ts')
    if (res.status !== 200) {
      const text = await res.text()
      console.error(`Unexpected status ${res.status}:`, text)
    }
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).toContain('justfile')
    expect(text).not.toContain('## src/index.ts')
  })

  test('clean path with include', async () => {
    const res = await fetchApp('gh_o-az_2md@main_src.md?include=.tsx')
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).toContain('landing.tsx')
    expect(text).not.toContain('## src/index.ts')
  })
})

describe('Utility endpoints', () => {
  test('ping', async () => {
    const res = await fetchApp('ping')
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('ok')
  })

  test('root page', async () => {
    const res = await fetchApp('')
    if (res.status !== 200) {
      const text = await res.text()
      console.error(`Unexpected status ${res.status}:`, text)
    }
    expect(res.status).toBe(200)
  })

  test('favicon returns 204', async () => {
    const res = await fetchApp('favicon.ico')
    expect(res.status).toBe(204)
  })
})
