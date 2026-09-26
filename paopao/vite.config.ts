import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages serves the repo at /paopao/. For Flask (served from the site root) build with VITE_BASE=./
export default defineConfig({
  base: process.env.VITE_BASE || '/paopao/',
  plugins: [react()],
  server: { proxy: { '/api': 'http://127.0.0.1:5000' } },
  preview: { allowedHosts: true },
});
