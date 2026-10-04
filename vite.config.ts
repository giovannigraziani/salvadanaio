import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base relativa: l'app funziona anche servita da una sottocartella (es. GitHub Pages)
export default defineConfig({
  base: './',
  plugins: [react()],
});
