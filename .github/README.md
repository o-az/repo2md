# [2md](2md.sauce.wiki)

Converts GitHub repo, directory, or specific files into a single markdown document.

Give it to your agent and awatch it rip 💨

https://2md.sauce.wiki

## Skill

```sh
npx --yes skills@latest add o-az/skills --skill github-to-markdown
```

## Examples

**Whole repo**:

https://2md.sauce.wiki/https://github.com/vercel-labs/json-render

Generates: [2md.sauce.wiki/gh_vercel-labs_json-render.md](https://2md.sauce.wiki/gh_vercel-labs_json-render.md)

**Directory**:

https://2md.sauce.wiki/github.com/vercel-labs/json-render/tree/main/examples/dashboard

Generates: [2md.sauce.wiki/gh_vercel-labs_json-render_examples_dashboard.md](https://2md.sauce.wiki/gh_vercel-labs_json-render_examples_dashboard.md)

**Single file**:

https://2md.sauce.wiki/github.com/vercel-labs/json-render/blob/main/README.md

Generates: [2md.sauce.wiki/ghf_vercel-labs_json-render_README.md](https://2md.sauce.wiki/github.com/vercel-labs/json-render/blob/main/README.md)

**With submodules** (for Foundry/Solidity projects):

https://2md.sauce.wiki/github.com/transmissions11/solmate?submodules=true

Fetches the repo plus all git submodules (e.g., `lib/forge-std`, `lib/openzeppelin-contracts`).

## Filtering

Use `exclude` and `include` query params to filter files.

- excludes all files ending in `.test.ts`:

  ```sh
  ?exclude=.test.ts
  ```

- excludes all files ending in `.test.ts` and all files ending in `.spec.ts`:

  ```sh
  ?exclude=.test.ts&exclude=.spec.ts
  ```

- include only jsx/tsx files:

  ```sh
  ?include=.jsx&include=.tsx
  ```

- include TypeScript, exclude tests:

  ```sh
  ?include=.ts&exclude=.test.ts
  ```

### Supported patterns

<!-- - `.test.ts` — suffix match
- `src/` — directory match
- `*.test.*` — glob wildcard
- `test` — contains match -->

| pattern    | description     |
| ---------- | --------------- |
| `.test.ts` | suffix match    |
| `src/`     | directory match |
| `*.test.*` | glob wildcard   |
| `test`     | contains match  |

## CLI

```bash
npx --yes github:o-az/2md honojs/hono
npx --yes github:o-az/2md honojs/hono/src
npx --yes github:o-az/2md https://github.com/honojs/hono/blob/main/README.md
```

[source code](https://github.com/o-az/2md)
