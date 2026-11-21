import {aesKey,unseal,passwordKey,objectRequest} from './oss.mjs'
const $=id=>document.getElementById(id)
const bytes=s=>Uint8Array.from(atob(s.trim()),c=>c.charCodeAt(0))
const decode=b=>JSON.parse(new TextDecoder().decode(b))
let device=JSON.parse(localStorage.getItem('kjw.pair')||'null'),key,rows=[],cats=[],read=false
const cache=await caches.open('kjw-documents-'+location.pathname.replace(/[^a-z0-9]/gi,'_'))
const cachePath=n=>new URL('./offline/'+n,location.href).href
function el(tag,text){const n=document.createElement(tag);n.textContent=text;return n}
function render(){
 $('todo').setAttribute('aria-selected',!read);$('done').setAttribute('aria-selected',read)
 const category=$('filter').value,options=[new Option('全部类别',''),...cats.map(c=>new Option(c,c))]
 $('filter').replaceChildren(...options);$('filter').value=cats.includes(category)?category:''
 const selected=rows.filter(r=>r.read===read&&(!category||r.cat===category)).sort((a,b)=>b.date.localeCompare(a.date))
 $('heading').textContent=(read?'已读文献':'待读文献')+' · '+selected.length
 $('list').replaceChildren()
 for(const r of selected){const a=el('article',''),meta=el('div',r.cat+' · '+new Date(r.date).toLocaleString()),note=el('p',r.note)
 meta.className='meta';note.className='note';a.append(meta,el('h3',r.title),note)
 if(/^https?:\/\//i.test(r.url)){const link=el('a','查看出处');link.href=r.url;link.rel='noreferrer';link.target='_blank';a.append(link)}
 const actions=el('div','');actions.className='actions'
 for(const kind of ['pdf','word'])if(r[kind]){const b=el('button',kind==='pdf'?'PDF 原文':'Word 中文版');b.onclick=()=>openFile(b,r[kind]);actions.append(b)}
 a.append(actions);$('list').append(a)}
 if(!selected.length)$('list').append(el('p','当前区域没有文献。'))
}
async function openFile(button,a){
 button.disabled=true
 try{const url=cachePath(a.object);let saved=await cache.match(url),encrypted=saved?await saved.arrayBuffer():await (await objectRequest(device.reader,a.object)).arrayBuffer()
 const plain=await unseal(key,encrypted)
 if(!saved)await cache.put(url,new Response(encrypted))
 const ext=a.original.split('.').pop().toLowerCase(),type={pdf:'application/pdf',doc:'application/msword',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'}[ext]
 const link=el('a','保存或打开 '+a.original),href=URL.createObjectURL(new Blob([plain],{type}));link.href=href;link.download=a.original;link.className='button';button.after(link);button.remove();link.click()
 $('status').textContent='附件已缓存。可从浏览器下载记录用 WPS 打开。'
 }catch(e){$('status').textContent='附件打开失败 · '+e.message}finally{button.disabled=false}
}
async function refresh(){
 if(!device){$('pair').open=true;$('status').textContent='请导入电脑生成的配对文件。';render();return}
 key=await aesKey(bytes(device.key));const path=cachePath('index')
 const show=data=>{const index=decode(data);rows=index.rows;cats=index.cats;render()}
 const old=await cache.match(path)
 if(old){try{show(await unseal(key,await old.arrayBuffer()));$('status').textContent='已显示本机目录，正在检查更新…'}catch{}}
 try{const buf=await (await objectRequest(device.reader,'index.bin')).arrayBuffer();show(await unseal(key,buf));await cache.put(path,new Response(buf));$('status').textContent='目录已更新 · '+new Date().toLocaleTimeString()}
 catch(e){$('status').textContent=(old?'显示上次保存的目录':'尚未取得目录')+' · '+e.message}
}
$('connect').onclick=async()=>{try{const f=$('file').files[0];if(!f)throw Error('请选择配对文件')
 const b=bytes(await f.text()),p=await passwordKey($('pass').value,b.slice(0,16)),v=decode(await unseal(p,b.slice(16)))
 if(v.type!=='pair-v1')throw Error('文件类型无效');device=v;localStorage.setItem('kjw.pair',JSON.stringify(v));$('pass').value='';$('pair').open=false;await refresh()}catch(e){$('status').textContent='配对失败，请检查文件和口令。'}}
$('todo').onclick=()=>{read=false;render()};$('done').onclick=()=>{read=true;render()};$('filter').onchange=render
if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{})
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh().catch(e=>$('status').textContent=e.message)})
refresh().catch(e=>$('status').textContent=e.message)