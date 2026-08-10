import { cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const sourceFile = path.join(projectRoot, 'src', 'index.js');
const outputDirectory = path.join(projectRoot, 'dist');

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });
await cp(sourceFile, path.join(outputDirectory, 'index.js'));

console.log(`Built ${path.relative(projectRoot, path.join(outputDirectory, 'index.js'))}`);
