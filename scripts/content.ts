import { load, type CheerioAPI } from 'cheerio';
import { localize } from './shared.js';
export interface PageContent {url:string; path:string; title:string; description:string; language:string; kind:string; html:string; image:string; date:string; alternates:{language:string;url:string}[]; text:string; topics:string[]; speakerTypes:string[]; slides:{title:string;description:string;href:string;button:string}[]; testimonials:{quote:string;name:string;role:string;image:string}[]}
export const cleanText=(s:string)=>s.replace(/\s+/g,' ').trim();
export function extract(url:string,raw:string):PageContent {
 const $=load(raw); const path=new URL(url).pathname;
 const language=$('html').attr('lang')??'en';
 const kind=$('body').hasClass('single-profiles')?'speaker':$('body').hasClass('single-projects')?'project':$('body').hasClass('single-post')?'article':path==='/'||path==='/fr/'?'home':'page';
 let main=$('[data-elementor-type="wp-page"],[data-elementor-type="wp-post"],[data-elementor-type="single-post"],[data-elementor-type="single"]').first();
 if(!main.length)main=$('#site-content,.elementor-location-archive,.elementor-location-single,main,#site-content,.entry-content').first();
 if(!main.length)throw new Error(`No editorial content found: ${url}`);
 const clone=load(`<div id="content">${main.html()??''}</div>`); const root=clone('#content');
 const alternates=$('link[rel="alternate"][hreflang]').map((_,e)=>({language:$(e).attr('hreflang')??'',url:$(e).attr('href')??''})).get();
 const image=$('meta[property="og:image"]').attr('content')??'';
 const date=$('meta[property="article:published_time"]').attr('content')??'';
 const title=cleanText($('meta[property="og:title"]').attr('content')??$('title').text()).replace(/\s*[–—|-]\s*Zermatt Summit.*$/i,'');
 const description=$('meta[name="description"]').attr('content')??'';
 // Remove interface duplication and plugin controls, keeping editorial text and media.
 root.find('script,style,noscript,link,svg,object,embed,.elementor-nav-menu--dropdown,.elementor-menu-toggle,.elementor-swiper-button,.swiper-pagination,.ecs-load-more,.elementor-posts-nothing-found,.elementor-field-type-recaptcha_v3,input[type="hidden"],.elementor-background-overlay,.elementor-cta__bg-overlay').remove();
 root.find('[data-widget_type="nav-menu.default"]').each((_,e)=>{
  const node=clone(e); const nav=node.find('nav').first(); node.html(`<nav class="section-nav">${nav.html()??''}</nav>`);
 });
 root.find('[data-widget_type="video.default"]').each((_,e)=>{
  const node=clone(e);let settings:any={};try{settings=JSON.parse(node.attr('data-settings')??'{}')}catch{}
  const u=settings.youtube_url??settings.vimeo_url??settings.hosted_url?.url;
  if(!u)return;
  // Embedded videos load only after the visitor chooses to watch them.
  const label=language.startsWith('fr')?'Voir la vidéo':'Watch video';
  node.html(`<a class="video-link" href="${u.replace(/"/g,'&quot;')}" target="_blank" rel="noopener noreferrer">${label} ↗</a>`);
 });
 root.find('.elementor-accordion-item').each((_,e)=>{
  const n=clone(e),title=n.find('.elementor-tab-title').text(),body=n.find('.elementor-tab-content').html();
  n.replaceWith(`<details><summary>${title}</summary>${body??''}</details>`);
 });
 root.find('.elementor-cta__bg,[data-bg]').each((_,e)=>{
  const n=clone(e);let src=n.attr('data-bg')??n.attr('data-background-image')??'';
  if(!src){const style=n.attr('style')??'';src=style.match(/url\(["']?([^"')]+)/)?.[1]??'';}
  if(src)n.replaceWith(`<img src="${src}" alt="${(n.attr('aria-label')??'').replace(/"/g,'&quot;')}" loading="lazy" decoding="async">`);
 });
 root.find('img,source,iframe').each((_,e)=>{
  const n=clone(e);for(const [from,to]of[['data-lazy-src','src'],['data-lazy-srcset','srcset'],['data-lazy-sizes','sizes']])if(n.attr(from))n.attr(to,n.attr(from)!);
  if(e.tagName==='img'){n.attr('loading','lazy').attr('decoding','async');n.removeAttr('fetchpriority');}
 });
 root.find('.elementor-container').each((_,e)=>{
  const n=clone(e);const columns=n.children('.elementor-column').length;
  if(columns>=2&&!n.find('h1,h2').length&&/\b\d{1,2}:\d{2}\b/.test(n.text()))n.addClass('agenda-row');
 });
 // Replace widget-specific divs that carry editorial headings/quotes with semantic tags.
 for(const [selector,tag]of[['.elementor-slide-heading','h2'],['.elementor-slide-description','p'],['.elementor-testimonial__text','blockquote'],['.elementor-testimonial__name','strong'],['.elementor-cta__title','h3']]){
  root.find(selector).each((_,e)=>{const n=clone(e);if(e.tagName!==tag)n.replaceWith(`<${tag}>${n.html()??''}</${tag}>`)});
 }
 root.find('*').each((_,e)=>{
  const n=clone(e);const c=(n.attr('class')??'').split(/\s+/);const keep:string[]=[];
  const mapping:Record<string,string>={'elementor-top-section':'content-section','elementor-container':'content-row','elementor-row':'content-row','elementor-column':'content-column','elementor-widget':'content-block','ecs-posts':'card-grid','elementor-posts-container':'card-grid','elementor-cta':'content-card','elementor-button':'button','elementor-icon-list-items':'link-list','swiper-slide':'slide-card','elementor-testimonial':'testimonial','elementor-widget-image':'image-block','elementor-widget-text-editor':'prose-block','elementor-slide-button':'button','agenda-row':'agenda-row','section-nav':'section-nav','video-link':'video-link'};
  for(const item of c)if(mapping[item])keep.push(mapping[item]);
  const width=c.find(x=>/^elementor-col-\d+$/.test(x));if(width)keep.push(width.replace('elementor-col-','width-'));
  if(n.attr('data-elementor-type')==='loop')keep.push('editorial-card');
  if(e.tagName==='a'&&n.attr('target')==='_blank')n.attr('rel','noopener noreferrer');
  for(const attr of Object.keys(e.attribs??{}))if(attr.startsWith('data-')||attr.startsWith('on')||['style','class','tabindex'].includes(attr))n.removeAttr(attr);
  if(keep.length)n.attr('class',[...new Set(keep)].join(' '));
  for(const attr of ['href','src','action'])if(/^(?:javascript|vbscript):/i.test(n.attr(attr)??''))n.removeAttr(attr);
  if(e.tagName==='form')n.attr('class','editorial-form').attr('action','#').attr('method','post');
 });
 root.find('.content-column').each((_,e)=>{const n=clone(e);if(!cleanText(n.text())&&!n.find('img,iframe,video,form,input').length)n.remove();});
 // Discard empty layout scaffolding left over from the page builder.
 root.find('div').get().reverse().forEach(e=>{const n=clone(e);if(!n.attr('class')&&!n.attr('id')&&!n.attr('role'))n.replaceWith(n.html()??'');});
 // One page-level heading, with the original section label kept as an eyebrow.
 const h1s=root.find('h1');if(h1s.length>1){const first=h1s.first();if(first.text().trim().length<45)first.replaceWith(`<p class="eyebrow">${first.html()}</p>`);}
 let firstHeading=true;root.find('h1').each((_,e)=>{if(firstHeading){firstHeading=false;return}const n=clone(e);n.replaceWith(`<h2>${n.html()}</h2>`)});
 if(!root.find('h1').length)root.prepend(`<h1>${title.replace(/</g,'&lt;')}</h1>`);
 const html=localize(root.html()??'').replace(/[\r\n\t]+/g,' ').replace(/ {2,}/g,' ');const text=cleanText(root.text());
 const slides=main.find('[data-widget_type="slides.default"] .swiper-slide').map((_,e)=>({title:cleanText($(e).find('.elementor-slide-heading').text()),description:cleanText($(e).find('.elementor-slide-description').text()),href:localize($(e).find('.swiper-slide-inner').attr('href')??''),button:cleanText($(e).find('.elementor-slide-button').text())})).get();
 const testimonials=main.find('.elementor-testimonial').map((_,e)=>({quote:cleanText($(e).find('.elementor-testimonial__text').text()),name:cleanText($(e).find('.elementor-testimonial__name').text()),role:cleanText($(e).find('.elementor-testimonial__title').text()),image:localize($(e).find('img').attr('data-lazy-src')??$(e).find('img').attr('src')??'')})).get();
 const topics=main.attr('class')?.split(/\s+/).filter(c=>c.startsWith('category-')).map(c=>c.replace('category-',''))??[];
 const speakerTypes=(main.attr('class')??'').split(/\s+/).filter(c=>c.startsWith('speakers_type-')).map(c=>c.replace('speakers_type-',''));
 return{url,path,title,description,language,kind,html,image:localize(image),date,alternates,text,topics,speakerTypes,slides,testimonials};
}
