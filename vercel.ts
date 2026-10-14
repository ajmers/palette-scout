import { routes, type VercelConfig } from '@vercel/config/v1';

// Static Vite build. The paint data and swatch thumbnails are committed in public/, so the
// deployment only runs the front-end build — no scraping happens on Vercel.
export const config: VercelConfig = {
  framework: 'vite',
  buildCommand: 'npm run build',
  outputDirectory: 'dist',
  headers: [
    // Vite emits content-hashed filenames here, so they can be cached forever.
    routes.cacheControl('/assets/(.*)', { public: true, maxAge: '1 year', immutable: true }),
    // Swatch and data filenames are stable across data rebuilds: cache, but let a redeploy show
    // through quickly.
    routes.cacheControl('/swatches/(.*)', { public: true, maxAge: '1 day', staleWhileRevalidate: '1 week' }),
    routes.cacheControl('/data/(.*)', { public: true, maxAge: '1 hour', staleWhileRevalidate: '1 day' }),
  ],
};
