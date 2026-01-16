const UNGH_BASE = 'https://ungh.cc'
const RAW_GITHUB_BASE = 'https://raw.githubusercontent.com'

export interface GitHubFile {
  path: string
  mode: string
  sha: string
  size: number
}

export interface FilesResponse {
  meta: { sha: string }
  files: GitHubFile[]
}

export interface ParsedGitHubUrl {
  type: 'repo' | 'directory' | 'file'
  owner: string
  repo: string
  branch: string
  path?: string
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
    return { type: 'repo', owner, repo, branch: 'main' }
  }

  const urlType = parts[2]
  const branch = parts[3] ?? 'main'
  const path = parts.slice(4).join('/')

  if (urlType === 'blob') {
    return { type: 'file', owner, repo, branch, path }
  }

  if (urlType === 'tree') {
    return path
      ? { type: 'directory', owner, repo, branch, path }
      : { type: 'repo', owner, repo, branch }
  }

  return { type: 'repo', owner, repo, branch: 'main' }
}

export async function getRepoFiles(
  owner: string,
  repo: string,
  branch: string,
): Promise<GitHubFile[]> {
  const response = await fetch(
    `${UNGH_BASE}/repos/${owner}/${repo}/files/${branch}`,
  )
  if (!response.ok) {
    throw new Error(`Failed to fetch files: ${response.status}`)
  }
  const data = (await response.json()) as FilesResponse
  return data.files
}

export async function getFileContent(
  owner: string,
  repo: string,
  branch: string,
  path: string,
): Promise<string> {
  const url = `${RAW_GITHUB_BASE}/${owner}/${repo}/${branch}/${path}`
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to fetch file: ${response.status}`)
  }
  return response.text()
}

export function filterFiles(
  files: GitHubFile[],
  ignorePatterns: string[],
): GitHubFile[] {
  return files.filter(file => {
    const pathParts = file.path.split('/')
    return !ignorePatterns.some(pattern => {
      if (pattern.includes('/')) {
        return file.path.startsWith(pattern) || file.path === pattern
      }
      return pathParts.some(part => part === pattern)
    })
  })
}

export function filterByDirectory(
  files: GitHubFile[],
  directory: string,
): GitHubFile[] {
  const normalizedDir = directory.replace(/\/$/, '')
  return files.filter(file => file.path.startsWith(`${normalizedDir}/`))
}

export function isTextFile(path: string): boolean {
  const textExtensions = [
    '.md',
    '.markdown',
    '.txt',
    '.rst',
    '.adoc',
    '.js',
    '.ts',
    '.jsx',
    '.tsx',
    '.mjs',
    '.cjs',
    '.py',
    '.rb',
    '.go',
    '.rs',
    '.java',
    '.kt',
    '.scala',
    '.c',
    '.cpp',
    '.h',
    '.hpp',
    '.cs',
    '.html',
    '.htm',
    '.css',
    '.scss',
    '.sass',
    '.less',
    '.json',
    '.yaml',
    '.yml',
    '.toml',
    '.xml',
    '.ini',
    '.env',
    '.sh',
    '.bash',
    '.zsh',
    '.fish',
    '.ps1',
    '.sql',
    '.graphql',
    '.gql',
    '.vue',
    '.svelte',
    '.astro',
    '.dockerfile',
    '.makefile',
    '.gitignore',
    '.editorconfig',
  ]

  const fileName = path.split('/').pop()?.toLowerCase() || ''

  const knownTextFiles = [
    'dockerfile',
    'makefile',
    'rakefile',
    'gemfile',
    'procfile',
    'license',
    'readme',
    'changelog',
    'contributing',
    'authors',
    '.gitignore',
    '.gitattributes',
    '.editorconfig',
    '.prettierrc',
    '.eslintrc',
    '.babelrc',
    '.npmrc',
    '.nvmrc',
  ]

  if (knownTextFiles.includes(fileName)) return true

  return textExtensions.some(ext => path.toLowerCase().endsWith(ext))
}
