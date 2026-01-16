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
