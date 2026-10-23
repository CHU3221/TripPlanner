import { randomBytes, randomUUID } from 'node:crypto'
import { hashPassword, hashSessionToken, verifyPassword } from './passwords.mjs'

const SESSION_COOKIE='tp_session'
const SESSION_TTL_MS=7*24*60*60*1000
function httpError(statusCode,message,code='AUTH_ERROR'){return Object.assign(new Error(message),{statusCode,code})}
function normalizeUsername(value){const v=String(value??'').trim();if(!v)throw httpError(400,'ID를 입력해주세요.','INVALID_USERNAME');return v}
function parseCookies(req){const out={};for(const part of String(req.headers.cookie??'').split(';')){const at=part.indexOf('=');if(at>0)out[part.slice(0,at).trim()]=decodeURIComponent(part.slice(at+1).trim())}return out}
export function sessionTokenFromRequest(req){return parseCookies(req)[SESSION_COOKIE]??''}
export function sessionCookie(token,req,maxAgeSeconds=Math.floor(SESSION_TTL_MS/1000)){
  const secure=req.socket?.encrypted||String(req.headers['x-forwarded-proto']??'').split(',')[0].trim()==='https'
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure?'; Secure':''}`
}
export function clearSessionCookie(req){return sessionCookie('',req,0)}

export class AuthService{
  constructor({users,sessions,configStore,sessionTtlMs=SESSION_TTL_MS}){this.users=users;this.sessions=sessions;this.configStore=configStore;this.sessionTtlMs=sessionTtlMs}
  async current(req){
    const raw=sessionTokenFromRequest(req);if(!raw)return {authenticated:false}
    const session=await this.sessions.getValid(hashSessionToken(raw),Date.now())
    if(!session)return {authenticated:false}
    if(session.subjectType==='ADMIN')return {authenticated:true,role:'ADMIN',username:this.configStore.admin.id,mustChangeAdminPassword:this.configStore.admin.bootstrap}
    const user=await this.users.getById(session.subjectId)
    if(!user||user.status!=='ACTIVE')return {authenticated:false}
    return {authenticated:true,role:'USER',username:user.username,mustChangePassword:!!user.mustChangePassword,userId:user.id,permissions:{canCreateTrips:user.permissions?.canCreateTrips!==false}}
  }
  async login(username,password){
    if(this.configStore.adminConfigInvalid)throw httpError(503,'ADMIN_ID와 ADMIN_PASSWORD_HASH 설정 중 하나만 존재합니다. .env.local을 복구해주세요.','ADMIN_CONFIG_INVALID')
    const name=normalizeUsername(username)
    let role,subjectId,userMustChange=false,userPermissions={canCreateTrips:true}
    if(name.toLowerCase()===this.configStore.admin.id.toLowerCase()){
      const valid=this.configStore.admin.bootstrap?String(password)==='admin':await verifyPassword(password,this.configStore.admin.passwordHash)
      if(!valid)throw httpError(401,'ID 또는 비밀번호가 올바르지 않습니다.','INVALID_CREDENTIALS')
      role='ADMIN';subjectId='ADMIN'
    }else{
      const user=await this.users.getByUsername(name)
      if(!user||!(await verifyPassword(password,user.passwordHash)))throw httpError(401,'ID 또는 비밀번호가 올바르지 않습니다.','INVALID_CREDENTIALS')
      if(user.status==='PENDING')throw httpError(403,'관리자 승인 대기 중인 계정입니다.','ACCOUNT_PENDING')
      if(user.status!=='ACTIVE')throw httpError(403,'비활성화된 계정입니다.','ACCOUNT_DISABLED')
      role='USER';subjectId=user.id;userMustChange=!!user.mustChangePassword;userPermissions=user.permissions??{canCreateTrips:true}
    }
    const token=randomBytes(32).toString('base64url'),expiresAt=Date.now()+this.sessionTtlMs
    await this.sessions.create({tokenHash:hashSessionToken(token),subjectType:role,subjectId,expiresAt})
    return {token,expiresAt,status:role==='ADMIN'?{authenticated:true,role,username:this.configStore.admin.id,mustChangeAdminPassword:this.configStore.admin.bootstrap}:{authenticated:true,role,username:name,mustChangePassword:userMustChange,userId:subjectId,permissions:{canCreateTrips:userPermissions?.canCreateTrips!==false}}}
  }
  async logout(req){const raw=sessionTokenFromRequest(req);if(raw)await this.sessions.delete(hashSessionToken(raw))}
  async signup(username,password){
    const name=normalizeUsername(username)
    if(name.toLowerCase()===this.configStore.admin.id.toLowerCase()||name.toLowerCase()==='admin'&&this.configStore.admin.bootstrap)throw httpError(409,'사용할 수 없는 ID입니다.','USERNAME_RESERVED')
    if(await this.users.getByUsername(name))throw httpError(409,'이미 사용 중이거나 승인 대기 중인 ID입니다.','USERNAME_EXISTS')
    const passwordHash=await hashPassword(password),id=randomUUID()
    await this.users.create({id,username:name,passwordHash,status:'PENDING',mustChangePassword:false})
    return {id,username:name,status:'PENDING'}
  }
  async requireAuth(req){const status=await this.current(req);if(!status.authenticated)throw httpError(401,'로그인이 필요합니다.','UNAUTHENTICATED');return status}
  async requireAdmin(req){const status=await this.requireAuth(req);if(status.role!=='ADMIN')throw httpError(403,'관리자 권한이 필요합니다.','FORBIDDEN');return status}
  async setAdminCredentials(req,{adminId,password}){
    await this.requireAdmin(req)
    const id=normalizeUsername(adminId)
    if(await this.users.getByUsername(id))throw httpError(409,'일반 사용자와 같은 ID는 사용할 수 없습니다.','USERNAME_EXISTS')
    const passwordHash=await hashPassword(password)
    this.configStore.setAdminCredentials(id,passwordHash)
    const currentTokenHash=hashSessionToken(sessionTokenFromRequest(req))
    await this.sessions.deleteForSubject('ADMIN','ADMIN',currentTokenHash)
    return {authenticated:true,role:'ADMIN',username:id,mustChangeAdminPassword:false}
  }
  async changeOwnPassword(req,{currentPassword,newPassword}){
    const status=await this.requireAuth(req)
    if(status.role==='ADMIN'){
      const valid=this.configStore.admin.bootstrap?String(currentPassword)==='admin':await verifyPassword(currentPassword,this.configStore.admin.passwordHash)
      if(!valid)throw httpError(401,'현재 비밀번호가 올바르지 않습니다.','INVALID_CREDENTIALS')
      return this.setAdminCredentials(req,{adminId:this.configStore.admin.id,password:newPassword})
    }
    const user=await this.users.getById(status.userId)
    if(!user||!(await verifyPassword(currentPassword,user.passwordHash)))throw httpError(401,'현재 비밀번호가 올바르지 않습니다.','INVALID_CREDENTIALS')
    await this.users.setPassword(user.id,await hashPassword(newPassword),false)
    await this.sessions.deleteForSubject('USER',user.id,hashSessionToken(sessionTokenFromRequest(req)))
    return {...status,mustChangePassword:false}
  }
}
