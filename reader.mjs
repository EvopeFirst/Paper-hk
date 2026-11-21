import {bucket,aesKey,unseal,passwordKey,objectRequest} from './oss.mjs'
const $=id=>document.getElementById(id)
const bytes=s=>Uint8Array.from(atob(s.trim()),c=>c.charCodeAt(0))
const decode=b=>JSON.parse(new TextDecoder().decode(b))
const pairStore='kjw.pair.'+bucket
let device=null,key,rows=[],cats=[],read=false
try { device=JSON.parse(localStorage.getItem(pairStore)||'null') } catch {}
let cache=null
try {
 cache=await caches.open('kjw-documents-'+bucket+'-'+location.pathname.replace(/[^a-z0-9]/gi,'_'))
} catch {}
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
let attachmentRequest=0,preparedFile=null,downloadUrl=null
const fileTypes={
 pdf:'application/pdf',
 doc:'application/msword',
 docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
}
function resetAttachment(){
 attachmentRequest++
 preparedFile=null
 $('shareFile').hidden=true
 $('shareFile').disabled=false
 $('saveFile').hidden=true
 $('saveFile').removeAttribute('href')
 if(downloadUrl)URL.revokeObjectURL(downloadUrl)
 downloadUrl=null
}
$('closeFile').onclick=()=>$('attachment').close()
$('attachment').onclose=resetAttachment
$('saveFile').onclick=()=>{
 $('attachmentHint').textContent='保存后，请到浏览器的「下载管理」点这个文件，或到「文件管理 → 最近」长按它，选择「更多 → 其他应用打开 → WPS Office」。'
}
$('shareFile').onclick=async()=>{
 if(!preparedFile)return
 const current=attachmentRequest
 $('shareFile').disabled=true
 try {
  // Call within this tap while the browser still grants user activation.
  await navigator.share({files:[preparedFile]})
 } catch(e){
  if(current===attachmentRequest){
   $('attachmentHint').textContent=e.name==='AbortError'?'已返回。可重新选择应用，或保存文件到手机。':'系统未能传递此文件。请点「保存到下载」，再从文件管理用 WPS 打开。'
  }
 } finally {if(current===attachmentRequest)$('shareFile').disabled=false}
}
async function openFile(button,a){
 resetAttachment()
 const current=attachmentRequest
 $('attachmentName').textContent=a.original
 $('attachmentHint').textContent='正在准备文件…'
 $('attachment').showModal()
 button.disabled=true
 try {
  const url=cachePath(a.object)
  let saved=null
  try {saved=await cache?.match(url)} catch {}
  const encrypted=await (saved||await objectRequest(device.reader,a.object)).arrayBuffer()
  const plain=await unseal(key,encrypted)
  if(!saved&&cache){try{await cache.put(url,new Response(encrypted))}catch{}}
  if(current!==attachmentRequest||!$('attachment').open)return
  const ext=a.original.split('.').pop().toLowerCase()
  const blob=new Blob([plain],{type:fileTypes[ext]||'application/octet-stream'})
  downloadUrl=URL.createObjectURL(blob)
  const save=$('saveFile')
  save.href=downloadUrl
  save.download=a.original
  save.hidden=false
  let canShare=false
  try {
   preparedFile=new File([blob],a.original,{type:blob.type})
   canShare=typeof navigator.share==='function'&&navigator.canShare?.({files:[preparedFile]})
  } catch {}
  $('shareFile').hidden=!canShare
  $('attachmentHint').textContent=canShare?'点「选择应用打开」，在系统面板中选 WPS Office。若列表中没有 WPS，可保存到下载后从文件管理打开。':'请点「保存到下载」，再从文件管理的「最近」中用 WPS Office 打开。如果之前已下载，可直接打开已有文件。'
 } catch(e){
  if(current===attachmentRequest)$('attachmentHint').textContent='附件准备失败 · '+e.message
 } finally {button.disabled=false}
}
async function refresh(){
 if(!device){$('pair').open=true;$('status').textContent='请导入电脑生成的配对文件。';render();return}
 key=await aesKey(bytes(device.key));const path=cachePath('index')
 const show=data=>{const index=decode(data);rows=index.rows;cats=index.cats;render()}
 let old=null
 try {old=await cache?.match(path)} catch {}
 let cached=false
 if(old){try{show(await unseal(key,await old.arrayBuffer()));cached=true;$('status').textContent='已显示本机目录，正在检查更新…'}catch{}}
 let buf
 try {buf=await (await objectRequest(device.reader,'index.bin')).arrayBuffer()}
 catch(e){
  const reason=e.message.startsWith('OSS ')?e.message:'请检查手机联网和香港桶的跨域来源（'+location.origin+'）'
  $('status').textContent='已配对，'+(cached?'显示上次目录':'尚未取得目录')+' · '+reason
  return
 }
 try {show(await unseal(key,buf))} catch {
  $('status').textContent='已配对，云端目录无法解密。请从显示已同步的电脑重新导出配对文件。'
  return
 }
 try {await cache.put(path,new Response(buf));$('status').textContent='目录已更新 · '+new Date().toLocaleTimeString()}
 catch {$('status').textContent='目录已更新，本次未能保存离线目录。'}
}
async function readPair(file,pass){
 if(!file)throw Error('请选择从电脑传来的 .kjwp 配对文件。')
 if(!pass)throw Error('请输入导出这份文件时设置的配对口令。')
 if(!globalThis.crypto?.subtle)throw Error('此页面无法使用浏览器解密，请在鸿蒙浏览器中打开 HTTPS 文献主页。')
 if(file.size>1024*1024)throw Error('选中的文件过大，请选择 .kjwp 配对文件。')
 let text
 try {text=typeof file.text==='function'?await file.text():await new Response(file).text()}
 catch {throw Error('手机未能读取所选文件。请先将它保存到手机文件管理，再重新选择。')}
 let packed
 try {packed=bytes(text);if(packed.length<45)throw Error()} catch {throw Error('配对文件内容不完整或格式有误，请重新传输原始 .kjwp 文件。')}
 let password
 try {password=await passwordKey(pass,packed.slice(0,16))}
 catch {throw Error('浏览器未能完成口令运算。请在系统浏览器的 HTTPS 页面重新尝试。')}
 let plain
 try {plain=await unseal(password,packed.slice(16))}
 catch {throw Error('无法解密配对文件。请核对这份文件导出时的口令；若仍失败，请重新导出并传输。')}
 let v
 try {v=decode(plain)} catch {throw Error('解密内容不是有效的配对文件。')}
 if(v?.type!=='pair-v1')throw Error('请选择手机配对文件（.kjwp）。')
 if(v.bucket!==bucket)throw Error('这份文件与香港桶不匹配，请用香港版电脑端重新导出。')
 if(!v.reader?.id||!v.reader?.secret||typeof v.key!=='string'||bytes(v.key).length!==32)throw Error('配对信息缺失，请从电脑重新导出。')
 return v
}
$('connect').onclick=async()=>{
 const button=$('connect')
 if(button.disabled)return
 button.disabled=true
 $('status').textContent='正在解密配对文件…'
 try {
  const v=await readPair($('file').files[0],$('pass').value)
  try {localStorage.setItem(pairStore,JSON.stringify(v))} catch {
   throw Error('文件已解密，但浏览器未能保存配对。请检查站点存储权限，或使用普通浏览标签页。')
  }
  device=v
  $('pass').value=''
  $('pair').open=false
  $('status').textContent='已配对，正在读取香港桶目录…'
  try {await refresh()} catch {$('status').textContent='配对已保存，目录加载失败。请重新打开主页重试。'}
 } catch(e){$('status').textContent=e.message} finally {button.disabled=false}
}
$('todo').onclick=()=>{read=false;render()};$('done').onclick=()=>{read=true;render()};$('filter').onchange=render
if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{})
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh().catch(e=>$('status').textContent=e.message)})
refresh().catch(e=>$('status').textContent=e.message)