const enc=new TextEncoder()
const hex=b=>Array.from(new Uint8Array(b),v=>v.toString(16).padStart(2,'0')).join('')
async function mac(key,value){
 const k=await crypto.subtle.importKey('raw',key,{name:'HMAC',hash:'SHA-256'},false,['sign'])
 return crypto.subtle.sign('HMAC',k,enc.encode(value))
}
export const bucket='kjw-paper-a7f3k9d2',region='cn-beijing'
export async function objectRequest(auth,name,method='GET',body){
 const time=new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'')
 const day=time.slice(0,8),scope=[day,region,'oss','aliyun_v4_request'].join('/')
 const path='/reader-v1/'+name
 const headers={'x-oss-content-sha256':'UNSIGNED-PAYLOAD','x-oss-date':time}
 const canon=Object.entries(headers).map(([k,v])=>k+':'+v+'\n').join('')
 const req=[method,'/'+bucket+path,'',canon,'','UNSIGNED-PAYLOAD'].join('\n')
 const digest=hex(await crypto.subtle.digest('SHA-256',enc.encode(req)))
 let key=enc.encode('aliyun_v4'+auth.secret)
 for(const part of scope.split('/')) key=await mac(key,part)
 const sig=hex(await mac(key,['OSS4-HMAC-SHA256',time,scope,digest].join('\n')))
 headers.Authorization='OSS4-HMAC-SHA256 Credential='+auth.id+'/'+scope+',Signature='+sig
 const response=await fetch('https://'+(auth.domain||bucket+'.oss-'+region+'.aliyuncs.com')+path,{method,headers,body,cache:'no-store',signal:AbortSignal.timeout(120000)})
 if(!response.ok) throw Error('OSS '+response.status+' '+((await response.text()).match(/<Code>([^<]+)/)?.[1]||'请检查权限、设备时间及网络'))
 return response
}
export async function aesKey(bytes){return crypto.subtle.importKey('raw',bytes,'AES-GCM',false,['encrypt','decrypt'])}
export async function seal(key,data){
 const iv=crypto.getRandomValues(new Uint8Array(12)),cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,data)
 return new Uint8Array(await new Blob([iv,cipher]).arrayBuffer())
}
export async function unseal(key,data){return crypto.subtle.decrypt({name:'AES-GCM',iv:data.slice(0,12)},key,data.slice(12))}
export async function passwordKey(password,salt){
 const raw=await crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveKey'])
 return crypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',salt,iterations:600000},raw,{name:'AES-GCM',length:256},false,['encrypt','decrypt'])
}