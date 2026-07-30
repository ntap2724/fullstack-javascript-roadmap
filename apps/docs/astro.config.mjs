import starlight from '@astrojs/starlight';
import { defineConfig } from 'astro/config';

export default defineConfig({
  output: 'static',
  integrations: [
    starlight({
      title: 'Lộ trình Fullstack JavaScript',
      customCss: ['./src/styles/custom.css'],
    }),
  ],
});
