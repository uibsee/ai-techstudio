// MCP 서버(functions/)가 함께 싣고 갈 데이터 — 빌드가 만든 public/ai 를 functions/data 로 (firebase.json predeploy)
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const from = path.join(root, 'public', 'ai');
const to = path.join(root, 'functions', 'data');
if (!fs.existsSync(path.join(from, 'index.json'))) throw new Error('public/ai 가 없어요 — 먼저 npm run export-ai');
fs.rmSync(to, { recursive: true, force: true });
fs.cpSync(from, to, { recursive: true });
console.log('MCP 데이터 → functions/data');
