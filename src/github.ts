const UNGH_BASE = 'https://ungh.cc'
const GITHUB_API_BASE = 'https://api.github.com'
const RAW_GITHUB_BASE = 'https://raw.githubusercontent.com'

export interface GitHubFile {
  path: string
  mode: string
  sha: string
  size: number
}

export interface Submodule {
  name: string
  path: string
  url: string
  owner: string
  repo: string
}

export interface FilesResponse {
  meta: { sha: string }
  files: Array<GitHubFile>
}

export interface ParsedGitHubUrl {
  type: 'repo' | 'directory' | 'file'
  owner: string
  repo: string
  branch?: string
  path?: string
}

export async function resolveBranchAndPath(
  owner: string,
  repo: string,
  segments: string[],
  token?: string
): Promise<{ branch: string; path?: string }> {
  if (segments.length === 0) {
    const defaultBranch = await getDefaultBranch(owner, repo, token)
    return { branch: defaultBranch }
  }

  for (let i = segments.length; i >= 1; i--) {
    const branch = segments.slice(0, i).join('/')
    const path = segments.slice(i).join('/') || undefined
    try {
      await getRepoFiles(owner, repo, branch)
      return { branch, path }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg.includes('404')) continue
      throw e
    }
  }

  const defaultBranch = await getDefaultBranch(owner, repo, token)
  return {
    branch: defaultBranch,
    path: segments.join('/') || undefined
  }
}

export function parseGitHubUrl(url: string): ParsedGitHubUrl {
  const cleaned = url.replace(/^https?:\/\/(www\.)?github\.com\//, '').replace(/\/$/, '')

  const parts = cleaned.split('/')
  const owner = parts[0] ?? ''
  const repo = parts[1] ?? ''

  if (!owner || !repo) {
    throw new Error(`Invalid GitHub URL - missing owner or repo: ${url}`)
  }

  if (parts.length === 2) {
    return { type: 'repo', owner, repo }
  }

  const urlType = parts[2]
  const branch = parts[3]
  const path = parts.slice(4).join('/')

  if (urlType === 'blob') {
    return { type: 'file', owner, repo, branch, path }
  }

  if (urlType === 'tree') {
    return { type: 'directory', owner, repo, branch, path: path || undefined }
  }

  const shortPath = parts.slice(2).join('/')
  const fileName = shortPath.split('/').pop()?.toLowerCase() || ''
  const knownFiles = [
    'justfile',
    'dockerfile',
    'makefile',
    'rakefile',
    'gemfile',
    'procfile',
    'license',
    'readme',
    'changelog'
  ]
  const isFile = fileName.includes('.') || knownFiles.includes(fileName)

  return isFile
    ? { type: 'file', owner, repo, path: shortPath }
    : { type: 'directory', owner, repo, path: shortPath }
}

async function getRepoFilesFromUngh(
  owner: string,
  repo: string,
  branch: string
): Promise<Array<GitHubFile>> {
  const url = `${UNGH_BASE}/repos/${owner}/${repo}/files/${encodeURIComponent(branch)}`
  let response: Response
  try {
    response = await fetch(url)
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : String(e)
    throw new Error(
      `Network error fetching files from ungh for ${owner}/${repo}@${branch}: ${errorMsg}`
    )
  }
  if (!response.ok) {
    if (response.status === 403 || response.status === 429) {
      throw new Error(`ungh rate limit: ${response.status} for ${owner}/${repo}@${branch}`)
    }
    const errorText = await response.text().catch(() => '')
    throw new Error(
      `Failed to fetch files from ungh: ${response.status} ${response.statusText} for ${owner}/${repo}@${branch}${errorText ? ` - ${errorText.slice(0, 100)}` : ''}`
    )
  }

  const data = (await response.json()) as FilesResponse
  return data.files
}

interface GitHubTreeResponse {
  tree: Array<{
    path: string
    mode: string
    sha: string
    size?: number
    type: string
  }>
  truncated: boolean
}

async function getRepoFilesFromGitHub(
  owner: string,
  repo: string,
  branch: string
): Promise<Array<GitHubFile>> {
  const url = `${GITHUB_API_BASE}/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`
  let response: Response
  try {
    response = await fetch(url, { headers: { 'User-Agent': '2md' } })
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : String(e)
    throw new Error(
      `Network error fetching files from GitHub API for ${owner}/${repo}@${branch}: ${errorMsg}`
    )
  }
  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
    throw new Error(
      `GitHub API error: ${response.status} ${response.statusText} for ${owner}/${repo}@${branch}${errorText ? ` - ${errorText.slice(0, 100)}` : ''}`
    )
  }

  const data = (await response.json()) as GitHubTreeResponse
  return data.tree
    .filter(item => item.type === 'blob')
    .map(item => ({
      path: item.path,
      mode: item.mode,
      sha: item.sha,
      size: item.size ?? 0
    }))
}

export async function getRepoFiles(
  owner: string,
  repo: string,
  branch: string
): Promise<Array<GitHubFile>> {
  try {
    return await getRepoFilesFromUngh(owner, repo, branch)
  } catch (e) {
    if (e instanceof Error && e.message.includes('rate limit')) {
      return await getRepoFilesFromGitHub(owner, repo, branch)
    }
    throw e
  }
}

export async function getDefaultBranch(
  owner: string,
  repo: string,
  token?: string
): Promise<string> {
  const headers: Record<string, string> = { 'User-Agent': '2md' }
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }
  const response = await fetch(`${GITHUB_API_BASE}/repos/${owner}/${repo}`, {
    headers
  })
  if (!response.ok) {
    return 'main'
  }
  const data = (await response.json()) as { default_branch: string }
  return data.default_branch
}

export async function getFileContent(
  owner: string,
  repo: string,
  branch: string,
  path: string,
  retries = 3
): Promise<string> {
  const encodedPath = path.split('/').map(encodeURIComponent).join('/')
  const url = `${RAW_GITHUB_BASE}/${owner}/${repo}/${encodeURIComponent(branch)}/${encodedPath}`

  let lastError: Error | null = null
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      let response: Response
      try {
        response = await fetch(url)
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : String(e)
        if (attempt < retries - 1) {
          lastError = new Error(
            `Network error fetching file (attempt ${attempt + 1}/${retries}) for ${owner}/${repo}@${branch}/${path}: ${errorMsg}`
          )
          await new Promise(r => setTimeout(r, 100 * 2 ** attempt))
          continue
        }
        throw new Error(
          `Network error fetching file for ${owner}/${repo}@${branch}/${path}: ${errorMsg}`
        )
      }
      if (response.ok) return response.text()
      if (response.status === 429 || response.status >= 500) {
        const errorText = await response.text().catch(() => '')
        lastError = new Error(
          `Failed to fetch file (attempt ${attempt + 1}/${retries}): ${response.status} ${response.statusText} for ${owner}/${repo}@${branch}/${path}${errorText ? ` - ${errorText.slice(0, 100)}` : ''}`
        )
        await new Promise(r => setTimeout(r, 100 * 2 ** attempt))
        continue
      }
      const errorText = await response.text().catch(() => '')
      throw new Error(
        `Failed to fetch file: ${response.status} ${response.statusText} for ${owner}/${repo}@${branch}/${path}${errorText ? ` - ${errorText.slice(0, 100)}` : ''}`
      )
    } catch (e) {
      if (
        e instanceof Error &&
        (e.message.includes('429') ||
          e.message.includes('500') ||
          e.message.includes('Network error'))
      ) {
        if (attempt < retries - 1) {
          lastError = e
          await new Promise(r => setTimeout(r, 100 * 2 ** attempt))
          continue
        }
      }
      if (attempt === retries - 1) {
        throw e
      }
      lastError = e instanceof Error ? e : new Error(String(e))
      await new Promise(r => setTimeout(r, 100 * 2 ** attempt))
    }
  }
  throw (
    lastError ||
    new Error(`Failed to fetch file after ${retries} retries: ${owner}/${repo}@${branch}/${path}`)
  )
}

export async function fetchWithConcurrency<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  concurrency = 10
): Promise<R[]> {
  const results: R[] = []
  let index = 0

  async function worker() {
    while (index < items.length) {
      const i = index++
      results[i] = await fn(items[i]!)
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker))
  return results
}

export function filterFiles(
  files: Array<GitHubFile>,
  ignorePatterns: Array<string>
): Array<GitHubFile> {
  return files.filter(file => {
    const pathParts = file.path.split('/')
    return !ignorePatterns.some(pattern => {
      if (pattern.includes('/')) return file.path.startsWith(pattern) || file.path === pattern

      return pathParts.some(part => part === pattern)
    })
  })
}

export function filterByDirectory(files: Array<GitHubFile>, directory: string): Array<GitHubFile> {
  const normalizedDir = directory.replace(/\/$/, '')
  return files.filter(file => file.path.startsWith(`${normalizedDir}/`))
}

export function parseGitmodules(content: string): Array<Submodule> {
  const submodules: Array<Submodule> = []
  const lines = content.split('\n')

  let current: Partial<Submodule> | null = null

  for (const line of lines) {
    const trimmed = line.trim()

    const submoduleMatch = trimmed.match(/^\[submodule\s+"(.+)"\]$/)
    if (submoduleMatch) {
      if (current?.path && current?.url) {
        const parsed = parseSubmoduleUrl(current.url)
        if (parsed) {
          submodules.push({
            name: current.name!,
            path: current.path,
            url: current.url,
            owner: parsed.owner,
            repo: parsed.repo
          })
        }
      }
      current = { name: submoduleMatch[1] }
      continue
    }

    if (current) {
      const pathMatch = trimmed.match(/^path\s*=\s*(.+)$/)
      if (pathMatch) {
        current.path = pathMatch[1]
        continue
      }

      const urlMatch = trimmed.match(/^url\s*=\s*(.+)$/)
      if (urlMatch) {
        current.url = urlMatch[1]
      }
    }
  }

  if (current?.path && current?.url) {
    const parsed = parseSubmoduleUrl(current.url)
    if (parsed) {
      submodules.push({
        name: current.name!,
        path: current.path,
        url: current.url,
        owner: parsed.owner,
        repo: parsed.repo
      })
    }
  }

  return submodules
}

function parseSubmoduleUrl(url: string): { owner: string; repo: string } | null {
  const normalized = url.replace(/^git@github\.com:/, 'https://github.com/').replace(/\.git$/, '')

  const match = normalized.match(/github\.com\/([^/]+)\/([^/]+)/)
  if (!match?.[1] || !match[2]) return null

  return { owner: match[1], repo: match[2] }
}

export interface SubmoduleContent {
  submodule: Submodule
  files: Array<{ path: string; content: string }>
  error?: string
}

export async function fetchSubmodules(
  owner: string,
  repo: string,
  branch: string,
  allFiles: Array<GitHubFile>,
  maxDepth = 2,
  currentDepth = 0,
  visited = new Set<string>()
): Promise<Array<SubmoduleContent>> {
  if (currentDepth >= maxDepth) return []

  const repoKey = `${owner}/${repo}`
  if (visited.has(repoKey)) return []
  visited.add(repoKey)

  const hasGitmodules = allFiles.some(f => f.path === '.gitmodules')
  if (!hasGitmodules) return []

  let gitmodulesContent: string
  try {
    gitmodulesContent = await getFileContent(owner, repo, branch, '.gitmodules')
  } catch {
    return []
  }

  const submodules = parseGitmodules(gitmodulesContent)
  if (submodules.length === 0) return []

  const results: Array<SubmoduleContent> = []

  await Promise.all(
    submodules.map(async submodule => {
      try {
        const submoduleKey = `${submodule.owner}/${submodule.repo}`
        if (visited.has(submoduleKey)) {
          results.push({
            submodule,
            files: [],
            error: 'Circular reference detected'
          })
          return
        }

        const defaultBranch = await getDefaultBranch(submodule.owner, submodule.repo)
        const subFiles = await getRepoFiles(submodule.owner, submodule.repo, defaultBranch)

        const textFiles = subFiles.filter(f => isTextFile(f.path))

        const contents = await fetchWithConcurrency(
          textFiles.slice(0, 100),
          async file => {
            try {
              const content = await getFileContent(
                submodule.owner,
                submodule.repo,
                defaultBranch,
                file.path
              )
              return { path: `${submodule.path}/${file.path}`, content }
            } catch {
              return {
                path: `${submodule.path}/${file.path}`,
                content: '*Failed to fetch*'
              }
            }
          },
          10
        )

        results.push({ submodule, files: contents })

        const nestedResults = await fetchSubmodules(
          submodule.owner,
          submodule.repo,
          defaultBranch,
          subFiles,
          maxDepth,
          currentDepth + 1,
          visited
        )

        for (const nested of nestedResults) {
          results.push({
            ...nested,
            files: nested.files.map(f => ({
              ...f,
              path: `${submodule.path}/${f.path}`
            }))
          })
        }
      } catch (e) {
        results.push({
          submodule,
          files: [],
          error: e instanceof Error ? e.message : 'Unknown error'
        })
      }
    })
  )

  return results
}

export function isTextFile(path: string): boolean {
  const textExtensions = [
    // Markdown & docs
    '.md',
    '.mdx',
    '.markdown',
    '.txt',
    '.rst',
    '.adoc',
    '.org',
    '.tex',
    // JavaScript/TypeScript
    '.js',
    '.ts',
    '.jsx',
    '.tsx',
    '.mjs',
    '.cjs',
    '.mts',
    '.cts',
    '.d.ts',
    '.d.cts',
    '.d.mts',
    // Python
    '.py',
    '.pyi',
    '.pyx',
    // Ruby
    '.rb',
    '.rake',
    '.gemspec',
    // Go
    '.go',
    '.mod',
    '.sum',
    // Rust
    '.rs',
    // JVM
    '.java',
    '.kt',
    '.kts',
    '.scala',
    '.groovy',
    '.gradle',
    '.clj',
    '.cljs',
    // C/C++
    '.c',
    '.cpp',
    '.cc',
    '.cxx',
    '.h',
    '.hpp',
    '.hxx',
    // C#/F#
    '.cs',
    '.fs',
    '.fsx',
    // Web
    '.html',
    '.htm',
    '.css',
    '.scss',
    '.sass',
    '.less',
    '.styl',
    // Data/Config
    '.json',
    '.jsonc',
    '.json5',
    '.yaml',
    '.yml',
    '.toml',
    '.xml',
    '.ini',
    '.cfg',
    '.conf',
    '.env',
    '.properties',
    // Shell
    '.sh',
    '.bash',
    '.zsh',
    '.fish',
    '.ps1',
    '.psm1',
    '.bat',
    '.cmd',
    // Database
    '.sql',
    '.prisma',
    // GraphQL
    '.graphql',
    '.gql',
    // Frontend frameworks
    '.vue',
    '.svelte',
    '.astro',
    // Mobile
    '.swift',
    '.m',
    '.mm',
    '.dart',
    // Other languages
    '.lua',
    '.php',
    '.pl',
    '.pm',
    '.r',
    '.R',
    '.jl',
    '.ex',
    '.exs',
    '.erl',
    '.hrl',
    '.hs',
    '.elm',
    '.ml',
    '.mli',
    '.nim',
    '.zig',
    '.v',
    '.sol',
    '.vy',
    '.move',
    '.cairo',
    // DevOps/CI
    '.dockerfile',
    '.makefile',
    '.tf',
    '.tfvars',
    '.hcl',
    '.nix',
    // Misc
    '.gitignore',
    '.editorconfig',
    '.csv',
    '.tsv',
    '.diff',
    '.patch',
    '.proto',
    '.thrift',
    '.wasm',
    '.wat'
  ]

  const fileName = path.split('/').pop()?.toLowerCase() || ''

  const knownTextFiles = [
    'dockerfile',
    'makefile',
    'rakefile',
    'gemfile',
    'procfile',
    'justfile',
    'vagrantfile',
    'brewfile',
    'podfile',
    'cartfile',
    'fastfile',
    'appfile',
    'license',
    'licence',
    'readme',
    'changelog',
    'changes',
    'history',
    'contributing',
    'contributors',
    'authors',
    'maintainers',
    'codeowners',
    'security',
    'code_of_conduct',
    '.gitignore',
    '.gitattributes',
    '.gitmodules',
    '.editorconfig',
    '.prettierrc',
    '.prettierignore',
    '.eslintrc',
    '.eslintignore',
    '.babelrc',
    '.npmrc',
    '.nvmrc',
    '.node-version',
    '.python-version',
    '.ruby-version',
    '.tool-versions',
    '.env.example',
    '.env.local',
    '.env.development',
    '.env.production',
    '.dockerignore',
    '.stylelintrc',
    '.markdownlint'
  ]

  if (knownTextFiles.includes(fileName)) return true

  return textExtensions.some(ext => path.toLowerCase().endsWith(ext))
}
