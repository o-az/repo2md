function encodeBranch(branch: string): string {
  return branch.replace(/~/g, '~~').replace(/\//g, '~s')
}

function decodeBranch(encoded: string): string {
  const SENTINEL = '\u0000'
  return encoded
    .replace(/~~/g, SENTINEL)
    .replace(/~s/g, '/')
    .replace(new RegExp(SENTINEL, 'g'), '~')
}

export function toCleanPath(
  owner: string,
  repo: string,
  branch: string,
  path: string | undefined,
  isFile: boolean = false,
  extension: 'md' | 'txt' = 'md'
): string {
  const prefix = isFile ? 'ghf' : 'gh'
  const parts = [prefix, owner, `${repo}@${encodeBranch(branch)}`]
  if (path) {
    parts.push(...path.split('/'))
  }
  return `/${parts.join('_')}.${extension}`
}

export function parseCleanPath(cleanPath: string): {
  owner: string
  repo: string
  branch: string
  path?: string
  isFile: boolean
  extension: 'md' | 'txt'
} | null {
  const isMd = cleanPath.endsWith('.md')
  const isTxt = cleanPath.endsWith('.txt')
  if ((!cleanPath.startsWith('gh_') && !cleanPath.startsWith('ghf_')) || (!isMd && !isTxt))
    return null
  const isFile = cleanPath.startsWith('ghf_')
  const extension: 'md' | 'txt' = isTxt ? 'txt' : 'md'
  const extLength = extension.length + 1
  const withoutExt = cleanPath.slice(0, -extLength)
  const parts = withoutExt.split('_')
  if (parts.length < 3) return null
  const [, owner, repoWithBranch, ...rest] = parts
  if (!owner || !repoWithBranch) return null

  const atIndex = repoWithBranch.indexOf('@')
  const repo = atIndex >= 0 ? repoWithBranch.slice(0, atIndex) : repoWithBranch
  const encodedBranch = atIndex >= 0 ? repoWithBranch.slice(atIndex + 1) : 'main'
  const branch = decodeBranch(encodedBranch)

  if (!repo) return null
  return {
    owner,
    repo,
    branch,
    path: rest.length > 0 ? rest.join('/') : undefined,
    isFile,
    extension
  }
}
