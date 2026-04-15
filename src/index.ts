import { Hono } from 'hono'
import { cache } from 'hono/cache'
import { except } from 'hono/combine'
import { env } from 'cloudflare:workers'
import { cacheHeader } from 'pretty-cache-header'
import { HTTPException } from 'hono/http-exception'

import {
  isTextFile,
  filterFiles,
  getRepoFiles,
  parseGitHubUrl,
  getFileContent,
  type GitHubFile,
  fetchSubmodules,
  filterByDirectory,
  resolveBranchAndPath,
  fetchWithConcurrency,
  type SubmoduleContent,
} from '#github.ts'
import { landingApp } from '#landing.tsx'
import { applyFilters } from '#filter.ts'
import { parseCleanPath, toCleanPath } from '#url.ts'
import { AI_USER_AGENTS, IGNORE_FILES } from '#constants.ts'

function isAiBot(userAgent: string | undefined): boolean {
  if (!userAgent) return false
  return AI_USER_AGENTS.some(agent => userAgent.toLowerCase().includes(agent.toLowerCase()))
}

function getContentType(extension: 'md' | 'txt', userAgent: string | undefined): string {
  if (extension === 'txt' || isAiBot(userAgent)) return 'text/plain; charset=utf-8'

  return 'text/markdown; charset=utf-8'
}

export const app = new Hono<{ Bindings: Cloudflare.Env }>()

app.use('/:path{.+}', async (context, next) => {
  const urlPath = context.req.param('path')
  if (
    (urlPath.startsWith('gh_') || urlPath.startsWith('ghf_')) &&
    (urlPath.endsWith('.md') || urlPath.endsWith('.txt'))
  ) {
    return next()
  }
  if (urlPath.startsWith('github.com/') || urlPath.startsWith('https://github.com/')) {
    const userAgent = context.req.header('user-agent')
    const isBrowser = userAgent && /mozilla|webkit|chrome|safari|opera|edge/i.test(userAgent)

    // Only redirect browsers so the URL bar updates to the clean path.
    // Non-browser clients (curl, wget, bots) skip the redirect and get
    // content served directly by the catch-all handler.
    if (!isBrowser) return next()

    const githubUrl = urlPath.startsWith('http') ? urlPath : `https://${urlPath}`
    const parsed = parseGitHubUrl(githubUrl)

    let branch = parsed.branch
    let path = parsed.path

    if (!branch) {
      try {
        const segments = path ? path.split('/') : []
        const resolved = await resolveBranchAndPath(
          parsed.owner,
          parsed.repo,
          segments,
          context.env.GITHUB_TOKEN,
        )
        branch = resolved.branch
        path = resolved.path
      } catch {
        // If resolving fails, continue to next handler
        return next()
      }
    }

    const cleanPath = toCleanPath(parsed.owner, parsed.repo, branch, path, parsed.type === 'file')
    const queryString = new URL(context.req.url).search
    return context.redirect(`${cleanPath}${queryString}`, 301)
  }
  return next()
})

app.notFound(context => {
  throw new HTTPException(404, {
    cause: context.error,
    message: `${context.req.url} is not a valid path.`,
  })
})

app.get('/ping', context => context.text('ok'))

app.get('/favicon.ico', context => context.body(null, 204))

app.get('/purge', async context => {
  const key = context.req.query('key')
  const path = context.req.query('path')

  if (!key || key !== context.env.PURGE_KEY) {
    throw new HTTPException(401, { message: 'Invalid or missing key' })
  }

  if (!path) {
    throw new HTTPException(400, { message: 'Missing path parameter' })
  }

  const cache = await caches.open('2md')
  const url = new URL(path, context.req.url)
  const deleted = await cache.delete(url.toString())

  return context.json({
    success: deleted,
    purged: url.toString(),
    message: deleted
      ? 'Cache purged from this datacenter'
      : 'Not found in cache (may not be cached at this datacenter)',
  })
})

const cacheMiddleware = except(
  _ => env.DISABLE_CACHE === 'true',
  cache({
    cacheName: '2md',
    cacheControl: cacheHeader({ public: true, maxAge: '5 minutes' }),
  }),
)

app.use('/', cacheMiddleware)
app.route('/', landingApp)

app.get('/:cleanPath{ghf?_.+\\.(md|txt)}', cacheMiddleware, async context => {
  const cleanPath = context.req.param('cleanPath')
  const parsed = parseCleanPath(cleanPath)
  if (!parsed) {
    throw new HTTPException(400, { message: 'Invalid path format' })
  }

  const { owner, repo, branch, path, isFile, extension } = parsed
  const includeSubmodules = context.req.query('submodules') === 'true'
  const userAgent = context.req.header('user-agent')
  const contentType = getContentType(extension, userAgent)

  if (isFile && path) {
    try {
      const content = await getFileContent(owner, repo, branch, path)
      return context.text(content, 200, {
        'Content-Type': contentType,
      })
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to fetch file'
      const status =
        message.includes('404') || message.includes('Not Found')
          ? 404
          : message.includes('rate limit') || message.includes('429')
            ? 429
            : message.includes('Network error') || message.includes('fetch failed')
              ? 503
              : 500
      throw new HTTPException(status, { message })
    }
  }

  let allFiles: Array<GitHubFile>
  try {
    allFiles = await getRepoFiles(owner, repo, branch)
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to fetch repository files'
    const status = message.includes('404') ? 404 : message.includes('rate limit') ? 429 : 500
    throw new HTTPException(status, { message })
  }

  let files: Array<GitHubFile> = allFiles

  if (path) files = filterByDirectory(files, path)

  files = applyFilters(files, context.req.queries('exclude'), context.req.queries('include'))
  files = filterFiles(files, IGNORE_FILES)
  files = files.filter(f => isTextFile(f.path))

  const contents = await fetchWithConcurrency(
    files,
    async file => {
      try {
        const content = await getFileContent(owner, repo, branch, file.path)
        return `## ${file.path}\n\n\`\`\`\n${content}\n\`\`\``
      } catch {
        return `## ${file.path}\n\n*Failed to fetch*`
      }
    },
    10,
  )

  let markdown = `# ${owner}/${repo}@${branch}${path ? `/${path}` : ''}\n\n${contents.join('\n\n')}`

  if (includeSubmodules && !path) {
    let submoduleResults: Array<SubmoduleContent>
    try {
      submoduleResults = await fetchSubmodules(owner, repo, branch, allFiles)
    } catch {
      // Continue without submodules if fetching fails
      submoduleResults = []
    }

    for (const result of submoduleResults) {
      if (result.error) {
        markdown += `\n\n---\n\n# Submodule: ${result.submodule.path}\n\n*Error: ${result.error}*`
        continue
      }

      if (result.files.length > 0) {
        const subContents = result.files
          .map(f => `## ${f.path}\n\n\`\`\`\n${f.content}\n\`\`\``)
          .join('\n\n')
        markdown += `\n\n---\n\n# Submodule: ${result.submodule.path} (${result.submodule.owner}/${result.submodule.repo})\n\n${subContents}`
      }
    }
  }

  return context.text(markdown, 200, {
    'Content-Type': contentType,
  })
})

app.get('/:path{.+}', cacheMiddleware, async context => {
  const urlPath = context.req.param('path')
  const githubUrl = urlPath.startsWith('http') ? urlPath : `https://${urlPath}`
  const parsed = parseGitHubUrl(githubUrl)
  const includeSubmodules = context.req.query('submodules') === 'true'
  const userAgent = context.req.header('user-agent')
  const contentType = getContentType('md', userAgent)

  let branch = parsed.branch
  let path = parsed.path

  if (!branch) {
    try {
      const segments = path ? path.split('/') : []
      const resolved = await resolveBranchAndPath(
        parsed.owner,
        parsed.repo,
        segments,
        context.env.GITHUB_TOKEN,
      )
      branch = resolved.branch
      path = resolved.path
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to resolve branch'
      const status = message.includes('404') ? 404 : message.includes('rate limit') ? 429 : 500
      throw new HTTPException(status, { message })
    }
  }

  if (parsed.type === 'file') {
    try {
      const content = await getFileContent(parsed.owner, parsed.repo, branch, path!)
      return context.text(content, 200, {
        'Content-Type': contentType,
      })
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to fetch file'
      const status =
        message.includes('404') || message.includes('Not Found')
          ? 404
          : message.includes('rate limit') || message.includes('429')
            ? 429
            : message.includes('Network error') || message.includes('fetch failed')
              ? 503
              : 500
      throw new HTTPException(status, { message })
    }
  }

  let allFiles: Array<GitHubFile>
  try {
    allFiles = await getRepoFiles(parsed.owner, parsed.repo, branch)
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to fetch repository files'
    const status = message.includes('404') ? 404 : message.includes('rate limit') ? 429 : 500
    throw new HTTPException(status, { message })
  }

  let files: Array<GitHubFile> = allFiles

  if (parsed.type === 'directory' && path) files = filterByDirectory(files, path)

  files = applyFilters(files, context.req.queries('exclude'), context.req.queries('include'))
  files = filterFiles(files, IGNORE_FILES)
  files = files.filter(f => isTextFile(f.path))

  const contents = await fetchWithConcurrency(
    files,
    async file => {
      try {
        const content = await getFileContent(parsed.owner, parsed.repo, branch, file.path)
        return `## ${file.path}\n\n\`\`\`\n${content}\n\`\`\``
      } catch {
        return `## ${file.path}\n\n*Failed to fetch*`
      }
    },
    10,
  )

  let markdown = `# ${parsed.owner}/${parsed.repo}@${branch}${path ? `/${path}` : ''}\n\n${contents.join('\n\n')}`

  if (includeSubmodules && !path) {
    let submoduleResults: Array<SubmoduleContent>
    try {
      submoduleResults = await fetchSubmodules(parsed.owner, parsed.repo, branch, allFiles)
    } catch {
      // Continue without submodules if fetching fails
      submoduleResults = []
    }

    for (const result of submoduleResults) {
      if (result.error) {
        markdown += `\n\n---\n\n# Submodule: ${result.submodule.path}\n\n*Error: ${result.error}*`
        continue
      }

      if (result.files.length > 0) {
        const subContents = result.files
          .map(f => `## ${f.path}\n\n\`\`\`\n${f.content}\n\`\`\``)
          .join('\n\n')
        markdown += `\n\n---\n\n# Submodule: ${result.submodule.path} (${result.submodule.owner}/${result.submodule.repo})\n\n${subContents}`
      }
    }
  }

  return context.text(markdown, 200, {
    'Content-Type': contentType,
  })
})

export default app satisfies ExportedHandler<Cloudflare.Env>
