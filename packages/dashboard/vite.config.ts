import path from 'path';
import { writeFileSync, mkdirSync } from 'fs';
import crypto from 'crypto';
import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const buildId = crypto.randomBytes(8).toString('hex');

function versionFilePlugin(): Plugin {
  return {
    name: 'version-file',
    apply: 'build',
    closeBundle() {
      const buildDir = path.resolve(__dirname, 'build');
      mkdirSync(buildDir, { recursive: true });
      writeFileSync(
        path.resolve(buildDir, 'version.json'),
        JSON.stringify({ buildId }),
      );
    },
  };
}

export default defineConfig({
  server: {
    port: 3001,
    host: '0.0.0.0',
  },
  define: {
    'import.meta.env.VITE_BUILD_ID': JSON.stringify(buildId),
  },
  plugins: [react(), versionFilePlugin()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    }
  },
  build: {
    outDir: 'build',
    emptyOutDir: true,
  },
});
