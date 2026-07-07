import * as z from 'zod/mini'
import { defineConfig, loadEnv } from 'vite'
import { cloudflare } from '@cloudflare/vite-plugin'
import { default as vitePluginDevtoolsJson } from 'vite-plugin-devtools-json'

const enabledSchema = z.stringbool()

const devFlagsSchema = z.object({
  ALLOWED_HOSTS: z.prefault(z.string(), ''),
  PORT: z.prefault(z.coerce.number(), 6969),
  DISABLE_CACHE: z.prefault(enabledSchema, 'false'),
  VITE_DEVTOOLS: z.prefault(enabledSchema, 'false'),
  VITE_FORWARD_CONSOLE: z.prefault(enabledSchema, 'false')
})

export default defineConfig(config => {
  const env = loadEnv(config.mode, process.cwd(), '')

  const { data: devFlags, success, error } = devFlagsSchema.safeParse(env)
  if (!success) throw new Error(`Invalid dev flags - ${z.prettifyError(error)}`)

  const allowedHosts = devFlags.ALLOWED_HOSTS.split(',')
    .map(h => h.trim())
    .filter(Boolean)
  const devtools = config.mode !== 'production' && devFlags.VITE_DEVTOOLS

  return {
    devtools,
    plugins: [cloudflare(), vitePluginDevtoolsJson()],
    server: {
      allowedHosts,
      port: devFlags.PORT,
      forwardConsole: devFlags.VITE_FORWARD_CONSOLE
    }
  }
})
