import { fileURLToPath } from 'node:url'
import { publicApiBaseUrl } from './lib/utils/api-url'

const migrationDir = fileURLToPath(new URL('./server/drizzle', import.meta.url))

export default defineNuxtConfig({
  compatibilityDate: '2025-10-01',
  ssr: false,
  srcDir: 'app',
  // The Hono package lives in server/. Nitro routes live in app/server.
  serverDir: 'app/server',
  css: ['~/assets/css/main.css'],
  modules: ['@nuxtjs/tailwindcss', '@pinia/nuxt'],
  typescript: {
    strict: true,
    typeCheck: false
  },
  runtimeConfig: {
    public: {
      apiBaseUrl: publicApiBaseUrl(),
      schoolEmailDomain: process.env.NUXT_PUBLIC_SCHOOL_EMAIL_DOMAIN || 'waprep.org',
      appName: 'Book Of Warnings'
    }
  },
  app: {
    head: {
      title: 'Book Of Warnings',
      meta: [
        { name: 'description', content: 'Authorized school directory and relationship database.' },
        { name: 'robots', content: 'noindex, nofollow' }
      ],
      htmlAttrs: { lang: 'en', class: 'dark' }
    }
  },
  nitro: {
    prerender: {
      crawlLinks: false
    },
    serverAssets: [{
      baseName: 'migrations',
      dir: migrationDir,
      pattern: '*.sql'
    }],
    routeRules: {
      '/api/**': { prerender: false }
    }
  }
})
