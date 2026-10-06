import { existsSync, readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { load } from 'cheerio';
import { pagePath } from './shared.js';
import type { PageContent } from './content.js';
const pages=JSON.parse(readFileSync('content/pages.json','utf8')) as PageContent[];
const brokenLinks=new Map<string,Set<string>>(),missingAssets=new Map<string,Set<string>>();
const failures:string[]=[];
function add(map:Map<string,Set<string>>,path:string,page:string){if(!map.has(path))map.set(path,new Set());map.get(path)!.add(page)}
function resolves(path:string){const p=decodeURI(path.split(/[?#]/)[0]);return existsSync(join('dist',p))||existsSync(join('dist',p,'index.html'))}
const text=(s:string)=>s.replace(/\s+/g,' ').trim();
for(const p of pages){
 const file=join('dist',pagePath(p.url));if(!existsSync(file)){failures.push(`Missing page: ${p.url}`);continue;}
 const $=load(readFileSync(file,'utf8'));
 if($('h1').length!==1)failures.push(`Expected one page heading: ${p.url}`);
 if($('script[src*="wp-"],link[href*="elementor"]').length)failures.push(`Legacy runtime: ${p.url}`);
 const isListing=p.path==='/insights/'||p.path==='/news/'||/\/(?:nouvelles|perspicacites|speakers-of-every-edition|les-intervenants-de-chaque-edition)\/$/.test(p.path);
 if(p.kind!=='home'&&!isListing){
  const source=load(p.html);source('img,script,style').remove();
  const output=load($('article.content').html()??'');output('img,script,style').remove();
  if(text(source.root().text())!==text(output.root().text()))failures.push(`Editorial text changed: ${p.url}`);
 }
 if(p.kind==='home')for(const t of p.testimonials)if(!$('#main').text().includes(t.quote))failures.push(`Missing testimonial: ${p.url}: ${t.name}`);
 $('a[href]').each((_,e)=>{const href=$(e).attr('href')!;if(href.startsWith('/')&&!href.startsWith('//')&&!resolves(href))add(brokenLinks,href,p.url)});
 $('img[src],source[src],script[src],link[rel="stylesheet"]').each((_,e)=>{const u=$(e).attr('src')??$(e).attr('href')??'';if(u.startsWith('/')&&!u.startsWith('//')&&!resolves(u))add(missingAssets,u,p.url)});
}
const files=(dir:string):string[]=>readdirSync(dir).flatMap(p=>{const f=join(dir,p);return statSync(f).isDirectory()?files(f):[f]});
const paths=files('dist');
for(const f of paths)if(statSync(f).size>25*1024*1024)failures.push(`Exceeds Cloudflare 25 MiB asset limit: ${f}`);
if(paths.length>20000)failures.push(`Exceeds Pages/free Workers 20,000 file limit: ${paths.length}`);
const serialize=(m:Map<string,Set<string>>)=>[...m].map(([url,r])=>({url,referrers:[...r]}));
const report={pages:pages.length,files:paths.length,bytes:paths.reduce((n,f)=>n+statSync(f).size,0),failures,brokenInternalLinks:serialize(brokenLinks),missingAssets:serialize(missingAssets)};
writeFileSync('reports/verification.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({pages:report.pages,files:report.files,failures:failures.length,brokenLinks:brokenLinks.size,missingAssets:missingAssets.size},null,2));
if(failures.length||missingAssets.size||brokenLinks.size){console.error(failures.slice(0,15).join('\n'));process.exitCode=1;}
