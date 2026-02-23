import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
    plugins: [react(), tailwindcss()],
    base: '/app/',  // Base path when served from FastAPI at /app/*
    server: {
        port: 5173,
        proxy: {
            '/api': {
                target: 'http://localhost:5023',
                changeOrigin: true,
            },
            '/covers': {
                target: 'http://localhost:5023',
                changeOrigin: true,
            },
        },
    },
    build: {
        outDir: 'dist',
    },
})
