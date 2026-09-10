import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

const backendTarget = (process.env.VITE_BACKEND_URL || 'http://localhost:18180').replace(/\/+$/, '')
const backendContextPath = (process.env.VITE_BACKEND_CONTEXT_PATH || '/pgp-ctr-msc-simulate-server').replace(/\/+$/, '')

export default defineConfig({
  plugins: [vue()],
  server: {
    // 监听所有网卡，使同一局域网内的其他电脑可以访问开发页面。
    host: '0.0.0.0',
    // 本地开发端口，可通过 VITE_DEV_PORT 覆盖。
    port: Number(process.env.VITE_DEV_PORT || 5183),
    // 端口被占用时直接失败，禁止 Vite 自动漂移到可能属于其他项目的端口。
    strictPort: true,
    // 浏览器始终访问同源 /api；代理显式补齐后端 Context Path，并将 Session Cookie 路径还原为浏览器可见的根路径。
    proxy: {
      '/api': {
        target: backendTarget,
        changeOrigin: true,
        rewrite: path => `${backendContextPath}${path}`,
        cookiePathRewrite: '/'
      }
    }
  }
})
