import { readFileSync } from 'node:fs';
export const ORIGIN = 'https://www.zermattsummit.org';
export interface RecordEntry { file: string; bytes: number; sha256: string; path?: string }
export interface Manifest { pages: Record<string, RecordEntry>; assets: Record<string, RecordEntry>; errors: Record<string,string>; captured_at?: string }
export const manifest = (): Manifest => JSON.parse(readFileSync('source/manifest.json','utf8'));
export function pagePath(url: string): string {
  const parsed = new URL(url);
  if (parsed.search) return `__queries/${Buffer.from(parsed.pathname + parsed.search).toString('base64url')}/index.html`;
  const path = decodeURI(parsed.pathname).replace(/^\/+|\/+$/g,'');
  if (path.split('/').includes('..')) throw new Error(`Unsafe path: ${url}`);
  return path ? `${path}/index.html` : 'index.html';
}
export function localize(text: string): string {
  return text.replace(/https?:\\\/\\\/(?:www\.)?zermattsummit\.org/g,'')
    .replace(/https?:\/\/(?:www\.)?zermattsummit\.org/g,'')
    .replace(/(?<!:)\/\/(?:www\.)?zermattsummit\.org/g,'');
}
