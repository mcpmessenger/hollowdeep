import { defineConfig } from 'vite';
import { execSync } from 'child_process';

let buildId = 'dev';
try {
  buildId = execSync('git rev-parse --short HEAD').toString().trim();
} catch {
  /* not a git checkout */
}

export default defineConfig({
  server: { port: 5173 },
  define: {
    __BUILD_ID__: JSON.stringify(buildId),
  },
});
