export function toCleanPath(
  owner: string,
  repo: string,
  path: string | undefined,
  isFile: boolean = false,
): string {
  const prefix = isFile ? 'ghf' : 'gh'
  const parts = [prefix, owner, repo]
  if (path) {
    parts.push(...path.split('/'))
  }
  return `/${parts.join('_')}.md`
}

export function parseCleanPath(
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
