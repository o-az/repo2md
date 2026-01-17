# 2md

Converts GitHub repositories, directories, or single files into a single Markdown document for easy consumption by LLMs or documentation tools.

## The URL

https://2md.sauce.wiki

## Examples

**Whole repo**

https://2md.sauce.wiki/https://github.com/vercel-labs/json-render

Generates: [2md.sauce.wiki/gh_vercel-labs_json-render.md](https://2md.sauce.wiki/gh_vercel-labs_json-render.md)

**Directory**

https://2md.sauce.wiki/github.com/vercel-labs/json-render/tree/main/examples/dashboard

Generates: [2md.sauce.wiki/gh_vercel-labs_json-render_examples_dashboard.md](https://2md.sauce.wiki/gh_vercel-labs_json-render_examples_dashboard.md)

**Single file**

https://2md.sauce.wiki/github.com/vercel-labs/json-render/blob/main/README.md

Generates: [2md.sauce.wiki/ghf_vercel-labs_json-render_README.md](https://2md.sauce.wiki/github.com/vercel-labs/json-render/blob/main/README.md)

## CLI

```bash
npx github:o-az/2md honojs/hono
npx github:o-az/2md honojs/hono/src
npx github:o-az/2md https://github.com/honojs/hono/blob/main/README.md
```
