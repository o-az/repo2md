function encodeBranch(branch: string): string {
  return branch.replace(/~/g, '~~').replace(/\//g, '~s')
}

function decodeBranch(encoded: string): string {
  return encoded.replace(/~s/g, '/').replace(/~~/g, '~')
}

export function toCleanPath(
  owner: string,
  repo: string,
  branch: string,
  path: string | undefined,
  isFile: boolean = false,
): string {
  const prefix = isFile ? 'ghf' : 'gh'
  const parts = [prefix, owner, `${repo}@${encodeBranch(branch)}`]
  if (path) {
    parts.push(...path.split('/'))
  }
  return `/${parts.join('_')}.md`
}

export function parseCleanPath(
  cleanPath: string,
): {
  owner: string
  repo: string
  branch: string
  path?: string
  isFile: boolean
} | null {
  if (
    (!cleanPath.startsWith('gh_') && !cleanPath.startsWith('ghf_')) ||
    !cleanPath.endsWith('.md')
  )
    return null
  const isFile = cleanPath.startsWith('ghf_')
  const withoutExt = cleanPath.slice(0, -3)
  const parts = withoutExt.split('_')
  if (parts.length < 3) return null
  const [, owner, repoWithBranch, ...rest] = parts
  if (!owner || !repoWithBranch) return null

  const atIndex = repoWithBranch.indexOf('@')
  const repo = atIndex >= 0 ? repoWithBranch.slice(0, atIndex) : repoWithBranch
  const encodedBranch =
    atIndex >= 0 ? repoWithBranch.slice(atIndex + 1) : 'main'
  const branch = decodeBranch(encodedBranch)

  if (!repo) return null
  return {
    owner,
    repo,
    branch,
    path: rest.length > 0 ? rest.join('/') : undefined,
    isFile,
  }
}
