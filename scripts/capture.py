"""Resumable capture of public site pages and their first-party dependencies."""
import argparse, concurrent.futures, hashlib, html, json, pathlib, re, subprocess, time
from urllib.parse import urljoin, urlsplit, urlunsplit, unquote
from html.parser import HTMLParser
import xml.etree.ElementTree as ET
ROOT=pathlib.Path(__file__).resolve().parent.parent
SOURCE=ROOT/'source'; SOURCE.mkdir(exist_ok=True)
ORIGIN='https://www.zermattsummit.org'; HOSTS={'www.zermattsummit.org','zermattsummit.org'}
manifest_path=SOURCE/'manifest.json'
manifest=json.loads(manifest_path.read_text()) if manifest_path.exists() else {'pages':{},'assets':{},'errors':{},'redirects':{}}
NS={'s':'http://www.sitemaps.org/schemas/sitemap/0.9'}

def fetch(url):
    result=subprocess.run(['curl','--fail','--location','--retry','2','--max-time','60','--silent','--show-error',url],capture_output=True)
    if result.returncode: raise RuntimeError(result.stderr.decode(errors='replace')[:500])
    return result.stdout

def normalize(url,base=ORIGIN+'/'):
    url=urljoin(base,html.unescape(url).replace('\\/','/'))
    p=urlsplit(url)
    if p.scheme not in ('http','https') or p.hostname not in HOSTS: return None
    return urlunsplit(('https','www.zermattsummit.org',p.path or '/',p.query,''))

def excluded(u):
    p=urlsplit(u)
    return any(x in p.path for x in ['/wp-json','/wp-admin','/wp-login','/xmlrpc.php','/feed/','/comments/']) or any(x in p.query for x in ['replytocom','s=','preview='])

def asset_url(u):
    p=urlsplit(u).path
    return bool(re.search(r'\.(?:pdf|png|jpe?g|gif|webp|svg|ico|css|js|woff2?|ttf|eot|mp4|mp3|zip|docx?|xlsx?|pptx?)$',p,re.I))

class References(HTMLParser):
    def __init__(self,base): super().__init__(convert_charrefs=True); self.base=base; self.pages=set(); self.assets=set()
    def handle_starttag(self,tag,attrs):
        a=dict(attrs)
        if tag=='meta' and a.get('property')=='og:image' and a.get('content'):
            u=normalize(a['content'],self.base)
            if u and asset_url(u): self.assets.add(u)
        for k in ['href','src','data-src','data-lazy-src','data-rocket-src','poster','data-poster','data-bg','data-lazy-srcset','srcset','data-srcset']:
            if k not in a or not a[k]: continue
            vals=[x.strip().split(' ')[0] for x in a[k].split(',')] if 'srcset' in k else [a[k]]
            for val in vals:
                u=normalize(val,self.base)
                if not u or excluded(u): continue
                if asset_url(u): self.assets.add(u)
                elif tag=='a' and k=='href': self.pages.add(u)

def text_assets(s,base):
    vals=re.findall(r'url\(\s*[\"\']?([^\)\"\']+)',s)
    vals+=re.findall(r'https?:(?:\\/|/){2}(?:www\.)?zermattsummit\.org[^\s\"\'<>\)]+',s)
    vals+=re.findall(r'[\"\']([^\"\']+\.(?:woff2?|ttf|eot|png|jpe?g|gif|webp|svg|css|js|pdf)(?:\?[^\"\']*)?)[\"\']',s)
    return {u for v in vals if (u:=normalize(v,base)) and asset_url(u)}

def save():
    manifest_path.write_text(json.dumps(manifest,indent=2,sort_keys=True))

parser=argparse.ArgumentParser();parser.add_argument('--delay',type=float,default=10);parser.add_argument('--concurrency',type=int,default=1);options=parser.parse_args()
# Read all sitemap records (including taxonomies and speaker archives).
urls=set()
index=fetch(ORIGIN+'/sitemap_index.xml'); (SOURCE/'sitemap_index.xml').write_bytes(index)
for loc in ET.fromstring(index).findall('./s:sitemap/s:loc',NS):
    if urlsplit(loc.text).path.rsplit('/',1)[-1] not in {'page-sitemap.xml','post-sitemap.xml','profiles-sitemap.xml','projects-sitemap.xml'}: continue
    path=SOURCE/urlsplit(loc.text).path.lstrip('/')
    if not path.exists():
        time.sleep(10); path.write_bytes(fetch(loc.text))
    urls.update(x.text for x in ET.parse(path).findall('./s:url/s:loc',NS))
(SOURCE/'sitemap-urls.json').write_text(json.dumps(sorted(urls),indent=2))
print(f'Sitemap discovery: {len(urls)} URLs',flush=True)
# Include translated counterparts and discover all links recursively.
allowed={normalize(u).rstrip('/') for u in urls}; allowed.update({ORIGIN,ORIGIN+'/fr'})
manifest['pages']={u:r for u,r in manifest['pages'].items() if u.rstrip('/') in allowed}
manifest['errors']={u:e for u,e in manifest['errors'].items() if u.rstrip('/') in allowed}
manifest['assets']={u:r for u,r in manifest['assets'].items() if '/uploads/' in u and pathlib.Path(urlsplit(u).path).suffix.lower() not in {'.css','.js'}}
queue={normalize(u) for u in urls}; queue.add(ORIGIN+'/'); queue.add(ORIGIN+'/fr/')
assets=set(manifest['assets']);assets.add(ORIGIN+'/wp-content/uploads/2026/03/bild.png');seen=set()
def capture_page(u):
    key=hashlib.sha256(u.encode()).hexdigest()[:24]+'.html'; file=SOURCE/'pages'/key
    data=file.read_bytes() if file.exists() else fetch(u)
    if not file.exists(): file.write_bytes(data)
    s=data.decode('utf-8',errors='replace')
    if '<html' not in s.lower(): raise RuntimeError('Non-HTML page')
    refs=References(u); refs.feed(s)
    return u,key,data,refs,text_assets(s,u)
with concurrent.futures.ThreadPoolExecutor(max_workers=options.concurrency) as pool:
    while queue:
        batch=[]
        for u in sorted(queue,key=lambda x:(x!=ORIGIN+'/',x))[:options.concurrency]:
            queue.remove(u)
            if u in seen or excluded(u): continue
            seen.add(u)
            if asset_url(u): assets.add(u); continue
            batch.append(u)
        network_needed=any(not (SOURCE/'pages'/(hashlib.sha256(u.encode()).hexdigest()[:24]+'.html')).exists() for u in batch)
        futures={pool.submit(capture_page,u):u for u in batch}
        for fut in concurrent.futures.as_completed(futures):
            u=futures[fut]
            try:
                u,key,data,refs,extra=fut.result()
                manifest['pages'][u]={'file':'pages/'+key,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()}
                manifest['errors'].pop(u,None)
                assets.update(u for u in refs.assets if '/uploads/' in u and pathlib.Path(urlsplit(u).path).suffix.lower() not in {'.css','.js'})
                queue.update(v for v in refs.pages-seen if v.rstrip('/') in allowed)
                save(); print(f"Pages {len(manifest['pages'])}, remaining {len(queue)}, assets {len(assets)}: {u}",flush=True)
            except Exception as e:
                manifest['errors'][u]=str(e); save(); print('PAGE ERROR',u,e,flush=True)
        if network_needed: time.sleep(options.delay)
# Assets are fetched in small batches like a browser's dependency loading.
pending=assets-set(manifest['assets']); done=set(manifest['assets'])
def capture_asset(u):
    key=hashlib.sha256(u.encode()).hexdigest()[:24]
    ext=pathlib.Path(urlsplit(u).path).suffix.lower() or '.bin'
    path=SOURCE/'assets'/(key+ext)
    data=path.read_bytes() if path.exists() else fetch(u)
    if not path.exists(): path.write_bytes(data)
    return u,{'file':'assets/'+path.name,'path':urlsplit(u).path,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()},data
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
    while pending:
        batch=sorted(pending); pending=set()
        futures={pool.submit(capture_asset,u):u for u in batch}
        for fut in concurrent.futures.as_completed(futures):
            try:
                u,record,data=fut.result(); manifest['assets'][u]=record; done.add(u); manifest['errors'].pop(u,None)
                if pathlib.Path(record['file']).suffix in {'.svg'}:
                    pending.update(text_assets(data.decode('utf-8',errors='replace'),u)-done)
                if len(done)%50==0: print(f'Assets {len(done)}, discovered {len(pending)}',flush=True)
                save()
            except Exception as e:
                manifest['errors'][futures[fut]]=str(e); save()
                print('ASSET ERROR',futures[fut],e,flush=True)
        pending-=done
manifest['captured_at']=time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()); save()
print(f"Capture complete: {len(manifest['pages'])} pages, {len(manifest['assets'])} assets",flush=True)
