import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Not 5173: that's another project's frontend port on this same dev
    // machine, so the two can run side by side without a port clash.
    port: 5176,
    // During local development (npm run dev), forward API calls to
    // the FastAPI backend (see `target` below for the current port).
    // This lets the frontend code use relative URLs like "/api/stats"
    // everywhere -
    // the same URLs that work once FastAPI serves the built frontend
    // directly (see backend/app/main.py), so nothing needs to change
    // between dev mode and the "share with friends" build.
    proxy: {
      '/api': {
        // Not 8000 (or 8010): this dev machine accumulates zombie
        // listeners on backend ports that `Stop-Process`/`taskkill`
        // cannot reclaim (they don't even show up as real processes
        // once "orphaned" - likely some local security/proxy tooling
        // duplicating the socket). If this port ever misbehaves the
        // same way, bump it again here and in the restart commands
        // rather than trying to kill whatever's squatting on the old one.
        target: 'http://127.0.0.1:8040',
        changeOrigin: true,
      },
    },
  },
})
