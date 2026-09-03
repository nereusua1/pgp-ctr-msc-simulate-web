import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    // 监听所有网卡，使同一局域网内的其他电脑可以访问开发页面。
    host: '0.0.0.0',
    // 本地开发端口，可通过 VITE_DEV_PORT 覆盖。
    port: Number(process.env.VITE_DEV_PORT || 5183),
    // 端口被占用时直接失败，禁止 Vite 自动漂移到可能属于其他项目的端口。
    strictPort: true,
    // 开发环境中将 API 请求代理到从 Nacos 配置启动的后端服务。
    proxy: { '/api': process.env.VITE_BACKEND_URL || 'http://localhost:8180' }
  }
})
