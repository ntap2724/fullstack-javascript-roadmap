import { scanPublicationTree } from '../../packages/publication-scanner/src/scan-tree.js';

const root = process.argv[2];
if (!root) throw new Error('Usage: scan-publication-fixture.ts <root>');
const result = await scanPublicationTree(root);
console.log(JSON.stringify(result));
process.exitCode = result.ok ? 0 : 1;
