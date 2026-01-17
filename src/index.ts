import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'

import { IGNORE_FILES } from '#constants.ts'
import {
  parseGitHubUrl,
  getRepoFiles,
  getFileContent,
  filterFiles,
  filterByDirectory,
  isTextFile,
  type GitHubFile,
} from '#github.ts'

export const app = new Hono<{ Bindings: Cloudflare.Env }>()

function toCleanPath(
  owner: string,
  repo: string,
  path?: string,
  isFile = false,
): string {
  const prefix = isFile ? 'ghf' : 'gh'
  const parts = [prefix, owner, repo]
  if (path) {
    parts.push(...path.split('/'))
  }
  return `/${parts.join('_')}.md`
}

function parseCleanPath(
  cleanPath: string,
): { owner: string; repo: string; path?: string; isFile: boolean } | null {
  if (
    (!cleanPath.startsWith('gh_') && !cleanPath.startsWith('ghf_')) ||
    !cleanPath.endsWith('.md')
  )
    return null
  const isFile = cleanPath.startsWith('ghf_')
  const withoutExt = cleanPath.slice(0, -3)
  const parts = withoutExt.split('_')
  if (parts.length < 3) return null
  const [, owner, repo, ...rest] = parts
  if (!owner || !repo) return null
  return {
    owner,
    repo,
    path: rest.length > 0 ? rest.join('/') : undefined,
    isFile,
  }
}

app.use('/:path{.+}', async (c, next) => {
  const urlPath = c.req.param('path')
  if (
    (urlPath.startsWith('gh_') || urlPath.startsWith('ghf_')) &&
    urlPath.endsWith('.md')
  ) {
    return next()
  }
  if (
    urlPath.startsWith('github.com/') ||
    urlPath.startsWith('https://github.com/')
  ) {
    const githubUrl = urlPath.startsWith('http')
      ? urlPath
      : `https://${urlPath}`
    const parsed = parseGitHubUrl(githubUrl)
    if (parsed.type === 'file') {
      return next()
    }
    const cleanPath = toCleanPath(parsed.owner, parsed.repo, parsed.path, false)
    return c.redirect(cleanPath, 301)
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

app.get('/', context => {
  return context.text(
    'Usage: /{github-url}\n\nExamples:\n/github.com/owner/repo\n/github.com/owner/repo/tree/main/src\n/github.com/owner/repo/blob/main/README.md',
  )
})

app.get('/:cleanPath{ghf?_.+\\.md}', async context => {
  const cleanPath = context.req.param('cleanPath')
  const parsed = parseCleanPath(cleanPath)
  if (!parsed) {
    throw new HTTPException(400, { message: 'Invalid path format' })
  }

  const { owner, repo, path, isFile } = parsed

  if (isFile && path) {
    const content = await getFileContent(owner, repo, 'HEAD', path)
    return context.text(content, 200, {
      'Content-Type': 'text/markdown; charset=utf-8',
    })
  }

  const allFiles = await getRepoFiles(owner, repo, 'HEAD')

  let files: GitHubFile[] = allFiles

  if (path) {
    files = filterByDirectory(files, path)
  }

  files = filterFiles(files, IGNORE_FILES)
  files = files.filter(f => isTextFile(f.path))

  const contents = await Promise.all(
    files.map(async file => {
      try {
        const content = await getFileContent(owner, repo, 'HEAD', file.path)
        return `## ${file.path}\n\n\`\`\`\n${content}\n\`\`\``
      } catch {
        return `## ${file.path}\n\n*Failed to fetch*`
      }
    }),
  )

  const markdown = `# ${owner}/${repo}${path ? `/${path}` : ''}\n\n${contents.join('\n\n')}`

  return context.text(markdown, 200, {
    'Content-Type': 'text/markdown; charset=utf-8',
  })
})

app.get('/:path{.+}', async context => {
  const urlPath = context.req.param('path')
  const githubUrl = urlPath.startsWith('http') ? urlPath : `https://${urlPath}`
  const parsed = parseGitHubUrl(githubUrl)

  if (parsed.type === 'file') {
    const content = await getFileContent(
      parsed.owner,
      parsed.repo,
      parsed.branch,
      parsed.path!,
    )
    return context.text(content, 200, {
      'Content-Type': 'text/markdown; charset=utf-8',
    })
  }

  const allFiles = await getRepoFiles(parsed.owner, parsed.repo, parsed.branch)

  let files: GitHubFile[] = allFiles

  if (parsed.type === 'directory' && parsed.path) {
    files = filterByDirectory(files, parsed.path)
  }

  files = filterFiles(files, IGNORE_FILES)
  files = files.filter(f => isTextFile(f.path))

  const contents = await Promise.all(
    files.map(async file => {
      try {
        const content = await getFileContent(
          parsed.owner,
          parsed.repo,
          parsed.branch,
          file.path,
        )
        return `## ${file.path}\n\n\`\`\`\n${content}\n\`\`\``
      } catch {
        return `## ${file.path}\n\n*Failed to fetch*`
      }
    }),
  )

  const markdown = `# ${parsed.owner}/${parsed.repo}${parsed.path ? `/${parsed.path}` : ''}\n\n${contents.join('\n\n')}`

  return context.text(markdown, 200, {
    'Content-Type': 'text/markdown; charset=utf-8',
  })
})

export default app satisfies ExportedHandler<Cloudflare.Env>
