import { describe, expect, test } from 'vitest'

import type { GitHubFile } from '#github.ts'
import { applyFilters, matchesPattern, parseFilterParams } from '#filter.ts'

describe('parseFilterParams', () => {
  test('returns empty array for undefined/empty', () => {
    expect(parseFilterParams(undefined)).toEqual([])
    expect(parseFilterParams([])).toEqual([])
    expect(parseFilterParams(['', '   '])).toEqual([])
  })

  test('parses single pattern', () => {
    expect(parseFilterParams(['.test.ts'])).toEqual(['.test.ts'])
    expect(parseFilterParams(['{.test.ts}'])).toEqual(['.test.ts'])
  })

  test('parses multiple query params', () => {
    expect(parseFilterParams(['.test.ts', '.spec.ts'])).toEqual(['.test.ts', '.spec.ts'])
  })

  test('parses brace syntax', () => {
    expect(parseFilterParams(['{.test.ts,.spec.ts}'])).toEqual(['.test.ts', '.spec.ts'])
  })

  test('combines multiple params with brace syntax', () => {
    expect(parseFilterParams(['{.test.ts,.spec.ts}', '.e2e.ts'])).toEqual([
      '.test.ts',
      '.spec.ts',
      '.e2e.ts',
    ])
  })
})

describe('matchesPattern', () => {
  test('suffix matching', () => {
    expect(matchesPattern('src/foo.test.ts', '.test.ts')).toBe(true)
    expect(matchesPattern('src/foo.ts', '.test.ts')).toBe(false)
  })

  test('directory matching', () => {
    expect(matchesPattern('test/foo.ts', 'test/')).toBe(true)
    expect(matchesPattern('src/test/foo.ts', 'test/')).toBe(true)
    expect(matchesPattern('testing/foo.ts', 'test/')).toBe(false)
  })

  test('exact filename matching', () => {
    expect(matchesPattern('src/README.md', 'README.md')).toBe(true)
    expect(matchesPattern('README.txt', 'README.md')).toBe(false)
  })

  test('glob wildcard matching', () => {
    expect(matchesPattern('foo.test.ts', '*.test.*')).toBe(true)
    expect(matchesPattern('foo.ts', '*.test.*')).toBe(false)
  })
})

describe('applyFilters', () => {
  const mockFiles: GitHubFile[] = [
    { path: 'src/index.ts', mode: '100644', sha: 'a', size: 100 },
    { path: 'src/index.test.ts', mode: '100644', sha: 'b', size: 100 },
    { path: 'src/utils/helper.ts', mode: '100644', sha: 'c', size: 100 },
    { path: 'src/utils/helper.spec.ts', mode: '100644', sha: 'd', size: 100 },
    { path: 'README.md', mode: '100644', sha: 'f', size: 100 },
  ]

  test('no filters returns all files', () => {
    expect(applyFilters(mockFiles, undefined, undefined)).toEqual(mockFiles)
  })

  test('exclude with brace syntax', () => {
    const result = applyFilters(mockFiles, ['{.test.ts,.spec.ts}'], undefined)
    expect(result.map(f => f.path)).toEqual(['src/index.ts', 'src/utils/helper.ts', 'README.md'])
  })

  test('exclude with multiple query params', () => {
    const result = applyFilters(mockFiles, ['.test.ts', '.spec.ts'], undefined)
    expect(result.map(f => f.path)).toEqual(['src/index.ts', 'src/utils/helper.ts', 'README.md'])
  })

  test('include patterns', () => {
    const result = applyFilters(mockFiles, undefined, ['src/utils/'])
    expect(result.map(f => f.path)).toEqual(['src/utils/helper.ts', 'src/utils/helper.spec.ts'])
  })

  test('include then exclude', () => {
    const result = applyFilters(mockFiles, ['.test.ts', '.spec.ts'], ['.ts'])
    expect(result.map(f => f.path)).toEqual(['src/index.ts', 'src/utils/helper.ts'])
  })
})
