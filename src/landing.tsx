import { Hono } from 'hono'
import { marked } from 'marked'
import { html, raw } from 'hono/html'

import readmeContent from '#README.md?raw'
import packageJSON from '#package.json' with { type: 'json' }

const landingApp = new Hono<{ Bindings: Cloudflare.Env }>()

// TODO: more head tags
const Layout = (props: { parsedMarkdown: string }) => html`
  <html>
    <head>
      <meta charset="UTF-8" />
      <title>${packageJSON.name}</title>
      <meta
        name="description"
        content="${packageJSON.description}" />
      <meta
        property="og:type"
        content="article" />
      <meta
        property="og:title"
        content="${packageJSON.name}" />
    </head>
    <body style="font-family: monospace; max-width: 800px; margin: 0 auto; padding: 2rem;">
      ${props.parsedMarkdown}
    </body>
  </html>
`

const parsedReadme = marked.parse(readmeContent)

landingApp.get('/', context => context.html(<Layout parsedMarkdown={raw(parsedReadme)} />))

landingApp.get('/llms.txt', context => context.text(readmeContent))

landingApp.get('/llms-full.txt', context => context.text(readmeContent))

export { landingApp }
