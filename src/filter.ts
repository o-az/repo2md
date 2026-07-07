import type { GitHubFile } from '#github.ts'

/**
 * Parse filter patterns from: - Brace syntax: `{.test.ts,.spec.ts}` → ['.test.ts', '.spec.ts'] -
 * Multiple query params: `['A', 'B']` → ['A', 'B']
 */
export function parseFilterParams(values: string[] | undefined): string[] {
  if (!values?.length) return []

  return values.flatMap(value => {
    const trimmed = value.trim()
    if (!trimmed) return []

    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      return trimmed
        .slice(1, -1)
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)
    }

    return [trimmed]
  })
}

/**
 * Check if a file path matches a pattern.
 *
 * - `.test.ts` → suffix match
 * - `src/` → directory match
 * - `*.test.*` → glob match
 * - `test` → contains match
 */
export function matchesPattern(filePath: string, pattern: string): boolean {
  if (pattern.includes('*')) {
    const regex = new RegExp(
      `^${pattern
        .split('*')
        .map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('.*')}$`
    )
    const fileName = filePath.split('/').pop() ?? ''
    return regex.test(filePath) || regex.test(fileName)
  }

  if (pattern.startsWith('.')) return filePath.endsWith(pattern)

  if (pattern.endsWith('/')) {
    return filePath.startsWith(pattern) || filePath.includes(`/${pattern}`)
  }

  if (pattern.includes('/')) {
    return filePath.startsWith(pattern) || filePath.includes(`/${pattern}`)
  }

  const fileName = filePath.split('/').pop() ?? ''
  return fileName === pattern || filePath.includes(pattern)
}

/** Apply include (whitelist) then exclude (blacklist) filters. */
export function applyFilters(
  files: GitHubFile[],
  exclude: string[] | undefined,
  include: string[] | undefined
): GitHubFile[] {
  const includePatterns = parseFilterParams(include)
  const excludePatterns = parseFilterParams(exclude)

  let result = files

  if (includePatterns.length > 0) {
    result = result.filter(f => includePatterns.some(p => matchesPattern(f.path, p)))
  }

  if (excludePatterns.length > 0) {
    result = result.filter(f => !excludePatterns.some(p => matchesPattern(f.path, p)))
  }

  return result
}
