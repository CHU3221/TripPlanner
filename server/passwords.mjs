import { randomBytes, scrypt as scryptCallback, timingSafeEqual, createHash } from 'node:crypto'
import { promisify } from 'node:util'

const scrypt=promisify(scryptCallback)
const N=16384,r=8,p=1,KEYLEN=64

export async function hashPassword(password){
  const normalized=String(password??'')
  if(normalized.length===0)throw Object.assign(new Error('비밀번호를 입력해주세요.'),{statusCode:400,code:'PASSWORD_REQUIRED'})
  const salt=randomBytes(16)
  const derived=await scrypt(normalized,salt,KEYLEN,{N,r,p,maxmem:64*1024*1024})
  return `scrypt$${N}$${r}$${p}$${salt.toString('base64url')}$${Buffer.from(derived).toString('base64url')}`
}

export async function verifyPassword(password,encoded){
  const parts=String(encoded??'').split('$')
  if(parts.length!==6||parts[0]!=='scrypt')return false
  const n=Number(parts[1]),rr=Number(parts[2]),pp=Number(parts[3])
  if(!Number.isInteger(n)||!Number.isInteger(rr)||!Number.isInteger(pp)||n<2||rr<1||pp<1)return false
  try{
    const salt=Buffer.from(parts[4],'base64url'),expected=Buffer.from(parts[5],'base64url')
    const actual=Buffer.from(await scrypt(String(password??''),salt,expected.length,{N:n,r:rr,p:pp,maxmem:64*1024*1024}))
    return actual.length===expected.length&&timingSafeEqual(actual,expected)
  }catch{return false}
}

export const hashSessionToken=token=>createHash('sha256').update(String(token)).digest('hex')
