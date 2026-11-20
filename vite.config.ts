// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// Never set ssr.external or resolve.external: the Worker has no runtime module resolution, so
// the build fails. Never add compression (compressPublicAssets, vite-plugin-compression):
// hosting already compresses at the edge.
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

const SUPABASE_URL = 
  process.env.VITE_SUPABASE_URL || 
  process.env.SUPABASE_URL || 
  "https://c--6c66f2ea-3e91-414a-b2c2-909adcc8d1c2-prod.lovable.cloud";

const SUPABASE_PUBLISHABLE_KEY = 
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY || 
  process.env.SUPABASE_PUBLISHABLE_KEY || 
  "sb_publishable_01NTxvBF5E5s7ytRSslwOA_UKZY_elb";

const SUPABASE_PROJECT_ID = 
  process.env.VITE_SUPABASE_PROJECT_ID || 
  process.env.SUPABASE_PROJECT_ID || 
  "aqadaiobpwdksntscahz";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    define: {
      "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(SUPABASE_URL),
      "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(SUPABASE_PUBLISHABLE_KEY),
      "import.meta.env.VITE_SUPABASE_PROJECT_ID": JSON.stringify(SUPABASE_PROJECT_ID),
      "import.meta.env['VITE_SUPABASE_URL']": JSON.stringify(SUPABASE_URL),
      "import.meta.env['VITE_SUPABASE_PUBLISHABLE_KEY']": JSON.stringify(SUPABASE_PUBLISHABLE_KEY),
      "import.meta.env['VITE_SUPABASE_PROJECT_ID']": JSON.stringify(SUPABASE_PROJECT_ID),
      "process.env.SUPABASE_URL": JSON.stringify(SUPABASE_URL),
      "process.env.SUPABASE_PUBLISHABLE_KEY": JSON.stringify(SUPABASE_PUBLISHABLE_KEY),
      "process.env.SUPABASE_PROJECT_ID": JSON.stringify(SUPABASE_PROJECT_ID),
      "process.env['SUPABASE_URL']": JSON.stringify(SUPABASE_URL),
      "process.env['SUPABASE_PUBLISHABLE_KEY']": JSON.stringify(SUPABASE_PUBLISHABLE_KEY),
      "process.env['SUPABASE_PROJECT_ID']": JSON.stringify(SUPABASE_PROJECT_ID),
    },
  },
});

