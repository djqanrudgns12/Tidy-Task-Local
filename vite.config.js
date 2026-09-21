import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  // QA captures and native build outputs must not reload an active classroom session.
  server: { watch: { ignored: ['**/output/**', '**/src-tauri/**', '**/.local-fixtures/**'] } },
  plugins: [
    tailwindcss(),
    svelte()
  ],
})
