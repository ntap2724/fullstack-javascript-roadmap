import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

function safeTarget(target) {
  return (
    typeof target === 'string' &&
    target.length > 0 &&
    !path.posix.isAbsolute(target) &&
    !path.win32.isAbsolute(target) &&
    !target.split(/[\\/]/).includes('..')
  );
}

export async function collectEvidence(options) {
  if (!/^[0-9a-f]{40}$/.test(options.sourceCommit))
    throw new Error('sourceCommit must be 40 lowercase hex characters');
  await rm(options.outputRoot, { recursive: true, force: true });
  await mkdir(options.outputRoot, { recursive: true });
  const records = [];
  for (const file of options.files) {
    if (!safeTarget(file.target)) throw new Error(`unsafe evidence target: ${file.target}`);
    const destination = path.join(options.outputRoot, file.target);
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(file.source, destination);
    const bytes = await readFile(destination);
    records.push({
      path: file.target.replaceAll('\\', '/'),
      bytes: bytes.byteLength,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    });
  }
  records.sort((left, right) => left.path.localeCompare(right.path));
  const manifest = {
    schemaVersion: 1,
    sourceCommit: options.sourceCommit,
    generatedAt: options.generatedAt,
    workflowRun: options.workflowRun,
    files: records,
  };
  await writeFile(
    path.join(options.outputRoot, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  return manifest;
}
