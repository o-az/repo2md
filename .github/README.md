# 2md

Converts GitHub repositories, directories, or single files into a single Markdown document for easy consumption by LLMs or documentation tools. Use the clean URL format with `gh_` for repos/directories or `ghf_` for single files.

## Examples

- Whole repo: [2md.sauce.wiki/gh_vercel-labs_json-render.md](https://2md.sauce.wiki/gh_vercel-labs_json-render.md)
- Directory: [2md.sauce.wiki/gh_vercel-labs_json-render_examples_dashboard.md](https://2md.sauce.wiki/gh_vercel-labs_json-render_examples_dashboard.md)
- Single file: [2md.sauce.wiki/ghf_vercel-labs_json-render_README.md.md](https://2md.sauce.wiki/ghf_vercel-labs_json-render_README.md.md)

You can also paste any GitHub URL directly (e.g., `2md.sauce.wiki/github.com/owner/repo`) and it will redirect to the clean format.

## CLI

```bash
npx github:o-az/2md honojs/hono
npx github:o-az/2md honojs/hono/src
npx github:o-az/2md https://github.com/honojs/hono/blob/main/README.md
```
