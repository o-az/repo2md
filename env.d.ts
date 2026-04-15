interface EnvironmentVariables {
  readonly PORT: string
  readonly ENVIRONMENT: 'development' | 'production'

  readonly LOGGING?: 'verbose' | 'normal' | 'silent' | undefined

  readonly APP_VERSION: string
}

// Node.js `process.env` auto-completion
declare namespace NodeJS {
  interface ProcessEnv extends EnvironmentVariables {
    readonly NODE_ENV: 'development' | 'production'
  }
}

// Bun `Bun.env` auto-completion
declare namespace Bun {
  interface Env extends EnvironmentVariables {
    readonly NODE_ENV: 'development' | 'production'
  }
}

// Bun/vite `import.meta.env` auto-completion
interface ImportMetaEnv extends EnvironmentVariables {}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
