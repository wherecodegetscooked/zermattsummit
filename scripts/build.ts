import { mkdirSync, readFileSync, writeFileSync, rmSync, existsSync, cpSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { load } from 'cheerio';
import { pagePath, ORIGIN } from './shared.js';
import type { Manifest } from './shared.js';
import type { PageContent } from './content.js';
import { shell, home, listing, esc } from './templates.js';
const pages=JSON.parse(readFileSync('content/pages.json','utf8')) as PageContent[];
rmSync('dist',{recursive:true,force:true});mkdirSync('dist',{recursive:true});
const write=(path:string,data:string|Buffer)=>{const dest=join('dist',path);mkdirSync(dirname(dest),{recursive:true});writeFileSync(dest,data)};
if(existsSync('public'))cpSync('public','dist',{recursive:true});
const articles=(p:PageContent)=>pages.filter(x=>x.kind==='article'&&x.language.startsWith(p.language.startsWith('fr')?'fr':'en')).sort((a,b)=>b.date.localeCompare(a.date));
const speakers=(p:PageContent)=>pages.filter(x=>x.kind==='speaker'&&x.language.startsWith(p.language.startsWith('fr')?'fr':'en')).sort((a,b)=>a.title.localeCompare(b.title));
const index:string[]=[];
const referenced=new Set<string>();
const capture:Manifest=existsSync('source/manifest.json')?JSON.parse(readFileSync('source/manifest.json','utf8')):{pages:{},assets:{},errors:{}};
const preload=existsSync('reports/preloaded-assets.json')?JSON.parse(readFileSync('reports/preloaded-assets.json','utf8')):{};
const assetMap=new Map<string,{file:string;bytes:number}>();
for(const [url,r] of Object.entries({...preload,...capture.assets}) as [string,{file:string;bytes:number}][])assetMap.set(new URL(url).pathname,r);
const missing:string[]=[];
const rendered:Record<string,string>={};
const generated: {url:string;title:string;entries:number}[]=[];
const aliases:Record<string,string>={
 '/speakers/romy-biner-hauser/':'/profiles/romy-biner-hauser/',
 '/speakers/anni-fryd-lyngstad/':'/profiles/anni-fryd-lyngstad/',
 '/speakers/elizabeth-sombart/':'/profiles/elizabeth-sombart2/',
 '/fr/speakers/romy-biner-hauser/':'/fr/profils/romy-biner-hauser/',
 '/fr/speakers/anni-fryd-lyngstad/':'/fr/profils/anni-fryd-lyngstad/',
 '/fr/speakers/elizabeth-sombart/':'/fr/profils/elisabeth-sombart/'
};
for(const p of pages)for(const [old,current]of Object.entries(aliases))p.html=p.html.replaceAll(`href="${old}"`,`href="${current}"`);

for(const p of pages){
 let body:string;
 const fr=p.language.startsWith('fr');
 if(p.kind==='home')body=home(p,pages);
 else if(p.path==='/insights/'||p.path==='/news/'||/\/(?:actualites|actualites-et-reflexions|nouvelles|perspicacites)\/$/.test(p.path))body=listing(p,articles(p),fr?'Actualités & idées':'News & insights');
 else if(p.path.endsWith('/speakers-of-every-edition/')||p.path.endsWith('/les-intervenants-de-chaque-edition/'))body=listing(p,speakers(p),fr?'Les intervenants':'Speakers of every edition').replace('class="page-main"','class="page-main speakers"');
 else body=`<main id="main" class="page-main" ${p.kind==='speaker'?'data-kind="speaker"':''}><div id="top" class="breadcrumbs"><a href="${fr?'/fr/':'/'}">Zermatt Summit</a> / ${esc(p.title)}</div><article class="content">${p.html}</article></main>`;
 rendered[p.url]=shell(p,body,pages);index.push(p.url);
}
// Small static directories replace WordPress taxonomy endpoints referenced by editorial pages.
const supportLinks=new Map<string,string>();
for(const p of pages){const $=load(p.html);$('a[href]').each((_,e)=>{const path=$(e).attr('href')??'';if(/^\/(?:topics|speakers_type)\//.test(path)||/^\/fr\/(?:sujets|type-denceintes)\//.test(path))supportLinks.set(path,$(e).text().trim());});}
const topicNames:Record<string,string>={'en-vedette':'featured','histoires':'stories','nouvelles':'news','bien-commun':'common-good','couverture-mediatique':'media-coverage'};
for(const [path,label]of supportLinks){
 const fr=path.startsWith('/fr/');const base=pages.find(p=>p.kind==='home'&&p.language.startsWith(fr?'fr':'en'))!;
 const slug=path.split('/').filter(Boolean).pop()!;
 const isSpeaker=path.includes('speakers_type')||path.includes('type-denceintes');
 const topic=topicNames[slug]??slug;
 const typeNames:Record<string,string>={'haut-parleur':'speaker','intervenante-invitee':'featured-speaker','conseil':'board','equipe':'team'};
 const entries=isSpeaker?speakers(base).filter(p=>p.speakerTypes.includes(typeNames[slug]??slug)):articles(base).filter(p=>p.topics.includes(topic));
 const p={...base,kind:'directory',url:ORIGIN+path,path,title:label||slug,description:'',image:'',alternates:[]};
 rendered[p.url]=shell(p,listing(p,entries,p.title),pages);index.push(p.url);generated.push({url:p.url,title:p.title,entries:entries.length});
}
for(const path of ['/summit-2020/registration/','/fr/sommet-2020/inscription/']){
 const fr=path.startsWith('/fr/');const base=pages.find(p=>p.kind==='home'&&p.language.startsWith(fr?'fr':'en'))!;
 const title=fr?'Les inscriptions sont closes':'Registration is closed';
 const p={...base,kind:'page',url:ORIGIN+path,path,title,description:'',image:'',alternates:[]};
 rendered[p.url]=shell(p,`<main id="main" class="page-main"><h1 id="top">${title}</h1><p>${fr?'Les inscriptions pour le sommet 2020 sont closes.':'Registration for the 2020 summit is closed.'}</p><a class="button" href="${fr?'/fr/contact/':'/contact/'}">Contact →</a></main>`,pages);index.push(p.url);generated.push({url:p.url,title,entries:0});
}
// Localize only media that is actually shown or offered as a download.
for(const [url,html]of Object.entries(rendered)){
 const $=load(html);
 $('img[src],source[src],a[href],meta[property="og:image"]').each((_,e)=>{
  const n=$(e),attr=e.tagName==='a'?'href':e.tagName==='meta'?'content':'src';const u=n.attr(attr)??'';
  if(!u.includes('/wp-content/uploads/'))return;
  if(/^https?:/.test(u)&&!['www.zermattsummit.org','zermattsummit.org'].includes(new URL(u).hostname))return;
  const path=new URL(u,ORIGIN).pathname;referenced.add(path);
  const r=assetMap.get(path);
  if(r&&existsSync(join('source',r.file))){const input=readFileSync(join('source',r.file));write(path.replace(/^\//,''),input);}
  else if(!existsSync(join('dist',path))){
   missing.push(path);
   if(e.tagName==='img'){
    const candidates=(n.attr('srcset')??'').split(',').map(x=>x.trim().split(' ')[0]).filter(x=>x.startsWith('/wp-content/uploads/')).reverse();
    const fallback=candidates.find(x=>assetMap.has(new URL(x,ORIGIN).pathname)||existsSync(join('dist',x)));
    if(fallback){const f=assetMap.get(new URL(fallback,ORIGIN).pathname);if(f&&existsSync(join('source',f.file)))write(fallback.replace(/^\//,''),readFileSync(join('source',f.file)));n.attr('src',fallback);}else n.remove();
   }else if(e.tagName==='meta')n.attr('content',ORIGIN+'/wp-content/uploads/2026/03/bild.png');
   else if(e.tagName==='a')n.removeAttr('href').attr('aria-disabled','true').attr('title','This document is currently unavailable.').addClass('unavailable-document');
  }
 });
 // Preserve responsive source sets, bringing in every requested rendition.
 $('[srcset]').each((_,e)=>{
  const n=$(e);const items=(n.attr('srcset')??'').split(',').map(s=>s.trim()).filter(Boolean);
  const valid=items.filter(item=>{const path=item.split(' ')[0];if(!path.startsWith('/wp-content/uploads/'))return false;const r=assetMap.get(new URL(path,ORIGIN).pathname);if(r&&existsSync(join('source',r.file))){write(path.replace(/^\//,''),readFileSync(join('source',r.file)));referenced.add(path);return true;}if(existsSync(join('dist',path))){referenced.add(path);return true;}return false;});
  if(valid.length)n.attr('srcset',valid.join(', '));else n.removeAttr('srcset');
 });
 write(pagePath(url),$.html());
}
write('site.css',readFileSync('src/site.css'));write('site.js',readFileSync('src/site.js'));
write('404.html',`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Page not found | Zermatt Summit</title><link rel="stylesheet" href="/site.css"><main class="page-main"><p class="eyebrow">Zermatt Summit</p><h1>Page not found</h1><p>The requested page could not be found.</p><a class="button" href="/">Return home →</a></main></html>`);
write('_redirects',Object.entries(aliases).map(([from,to])=>`${from} ${to} 301`).join('\n')+'\n/welcome/ / 301\n/fr/bienvenue/ /fr/ 301\n');
write('robots.txt',`User-agent: *\nAllow: /\nSitemap: ${ORIGIN}/sitemap.xml\n`);
write('sitemap.xml',`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${index.map(u=>`<url><loc>${esc(u)}</loc></url>`).join('')}</urlset>`);
write('_headers',`/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n  X-Frame-Options: SAMEORIGIN\n  Permissions-Policy: camera=(), microphone=(), geolocation=()\n`);
mkdirSync('reports',{recursive:true});
writeFileSync('reports/content-index.json',JSON.stringify(pages.map(({html,text,slides,testimonials,...metadata})=>metadata),null,2));
writeFileSync('reports/build.json',JSON.stringify({pages:pages.length,generatedDirectories:generated,referencedMedia:referenced.size,missingMedia:[...new Set(missing)],captureErrors:capture.errors},null,2));
console.log(`Built ${pages.length} editorial pages. Referenced media: ${referenced.size}. Missing at source/capture: ${new Set(missing).size}.`);
