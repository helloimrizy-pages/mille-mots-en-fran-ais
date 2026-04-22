import fs from 'node:fs/promises';
import path from 'node:path';

export async function readJson<T>(p: string): Promise<T> {
  const txt = await fs.readFile(p, 'utf8');
  return JSON.parse(txt) as T;
}

export async function writeJson(p: string, data: unknown, pretty = true): Promise<void> {
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data), 'utf8');
}

export async function fileExists(p: string): Promise<boolean> {
  try { await fs.access(p); return true; } catch { return false; }
}
