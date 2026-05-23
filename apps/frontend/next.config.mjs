import createNextIntlPlugin from 'next-intl/plugin';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');

const withNextIntl = createNextIntlPlugin(
  './src/i18n/request.ts'
);

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  webpack(config) {
    config.resolve.alias = {
      ...config.resolve.alias,
      '@shared-types': path.resolve(repoRoot, 'libs/shared-types/src/index.ts'),
      '@shared-utils': path.resolve(repoRoot, 'libs/shared-utils/src/index.ts'),
    };
    return config;
  },
};

export default withNextIntl(nextConfig);
