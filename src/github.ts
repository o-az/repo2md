const UNGH_BASE = 'https://ungh.cc'
const RAW_GITHUB_BASE = 'https://raw.githubusercontent.com'
const GITHUB_API_BASE = 'https://api.github.com'

export interface GitHubFile {
  path: string
  mode: string
  sha: string
  size: number
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
  token?: string,
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
    path: segments.join('/') || undefined,
  }
}

export function parseGitHubUrl(url: string): ParsedGitHubUrl {
  const cleaned = url
    .replace(/^https?:\/\/(www\.)?github\.com\//, '')
    .replace(/\/$/, '')

  const parts = cleaned.split('/')
  const owner = parts[0] ?? ''
  const repo = parts[1] ?? ''

  if (!owner || !repo) {
    throw new Error('Invalid GitHub URL: missing owner or repo')
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
    'changelog',
  ]
  const isFile = fileName.includes('.') || knownFiles.includes(fileName)

  return isFile
    ? { type: 'file', owner, repo, path: shortPath }
    : { type: 'directory', owner, repo, path: shortPath }
}

async function getRepoFilesFromUngh(
  owner: string,
  repo: string,
  branch: string,
): Promise<Array<GitHubFile>> {
  const response = await fetch(
    `${UNGH_BASE}/repos/${owner}/${repo}/files/${encodeURIComponent(branch)}`,
  )
  if (!response.ok) {
    if (response.status === 403 || response.status === 429) {
      throw new Error(`ungh rate limit: ${response.status}`)
    }
    throw new Error(`Failed to fetch files: ${response.status}`)
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
  branch: string,
): Promise<Array<GitHubFile>> {
  const response = await fetch(
    `${GITHUB_API_BASE}/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
    { headers: { 'User-Agent': '2md' } },
  )
  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.status}`)
  }

  const data = (await response.json()) as GitHubTreeResponse
  return data.tree
    .filter(item => item.type === 'blob')
    .map(item => ({
      path: item.path,
      mode: item.mode,
      sha: item.sha,
      size: item.size ?? 0,
    }))
}

export async function getRepoFiles(
  owner: string,
  repo: string,
  branch: string,
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
  token?: string,
): Promise<string> {
  const headers: Record<string, string> = { 'User-Agent': '2md' }
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }
  const response = await fetch(`${GITHUB_API_BASE}/repos/${owner}/${repo}`, {
    headers,
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
): Promise<string> {
  const encodedPath = path.split('/').map(encodeURIComponent).join('/')
  const url = `${RAW_GITHUB_BASE}/${owner}/${repo}/${encodeURIComponent(branch)}/${encodedPath}`
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Failed to fetch file: ${response.status}`)

  return response.text()
}

export function filterFiles(
  files: Array<GitHubFile>,
  ignorePatterns: Array<string>,
): Array<GitHubFile> {
  return files.filter(file => {
    const pathParts = file.path.split('/')
    return !ignorePatterns.some(pattern => {
      if (pattern.includes('/'))
        return file.path.startsWith(pattern) || file.path === pattern

      return pathParts.some(part => part === pattern)
    })
  })
}

export function filterByDirectory(
  files: Array<GitHubFile>,
  directory: string,
): Array<GitHubFile> {
  const normalizedDir = directory.replace(/\/$/, '')
  return files.filter(file => file.path.startsWith(`${normalizedDir}/`))
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
    '.wat',
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
    '.markdownlint',
  ]

  if (knownTextFiles.includes(fileName)) return true

  return textExtensions.some(ext => path.toLowerCase().endsWith(ext))
}
