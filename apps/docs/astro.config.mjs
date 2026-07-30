import starlight from '@astrojs/starlight';
import { defineConfig } from 'astro/config';
import { curriculumRuntime } from './src/lib/curriculum-runtime.js';
import { loadSidebar } from './src/lib/sidebar.js';

const sidebar = await loadSidebar(curriculumRuntime);

export default defineConfig({
  output: 'static',
  integrations: [
    starlight({
      title: 'Lộ trình Fullstack JavaScript',
      customCss: ['./src/styles/custom.css'],
      sidebar,
      components: {
        PageTitle: './src/components/PageTitle.astro',
      },
    }),
  ],
});
