import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    host: true,
    allowedHosts: [
      "frfuck-dashboard-production.up.railway.app",
      "app.frfuck.xyz"
    ]
  },
  preview: {
    host: true,
    allowedHosts: [
      "frfuck-dashboard-production.up.railway.app",
      "app.frfuck.xyz"
    ]
  }
})
