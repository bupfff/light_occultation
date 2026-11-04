import { defineConfig } from 'vite'

export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/light_occultation/' : '/',
  server: {
    port: 3000,
    open: true
  }
}))
