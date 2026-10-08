// AI 용 글 뽑기 — src/ai/exportData.ts 를 vite 로 node 에서 불러 public/ 에 쓴다. `npm run export-ai` (build 가 먼저 부른다)
import { createServer } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const server = await createServer({ root, configFile: path.join(root, 'vite.config.ts'), server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' });
try {
  const mod = await server.ssrLoadModule('/src/ai/exportData.ts');
  const files = await mod.buildAiFiles();
  const pub = path.join(root, 'public');
  fs.rmSync(path.join(pub, 'ai'), { recursive: true, force: true });
  let bytes = 0;
  for (const [rel, text] of Object.entries(files)) {
    const p = path.join(pub, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, text);
    bytes += Buffer.byteLength(text);
  }
  console.log(`AI 용 글 ${Object.keys(files).length}개 · ${(bytes / 1024 / 1024).toFixed(1)}MB → public/`);
} finally {
  await server.close();
}
