import http from 'node:http'
import { randomUUID } from 'node:crypto'
import { createEmptyTripSnapshot, validateTripSnapshot } from './snapshotValidation.mjs'
import { RevisionConflictError, TripNotFoundError } from './repositories.mjs'
import { clearSessionCookie, sessionCookie } from './auth.mjs'
import { hashPassword } from './passwords.mjs'

const JSON_LIMIT=2*1024*1024
const ATTACHMENT_LIMIT=8*1024*1024
const ATTACHMENT_MIME=new Set(['image/jpeg','image/png','image/webp'])
function attachmentSignatureMatches(bytes,mime){
  if(mime==='image/jpeg')return bytes.length>=3&&bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff
  if(mime==='image/png')return bytes.length>=8&&bytes.subarray(0,8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]))
  if(mime==='image/webp')return bytes.length>=12&&bytes.subarray(0,4).toString('ascii')==='RIFF'&&bytes.subarray(8,12).toString('ascii')==='WEBP'
  return false
}
function send(res,status,payload,headers={}){const body=JSON.stringify(payload);res.writeHead(status,{'content-type':'application/json; charset=utf-8','content-length':Buffer.byteLength(body),'cache-control':'no-store',...headers});res.end(body)}
async function readBytes(req,limit){let size=0,chunks=[];for await(const chunk of req){size+=chunk.length;if(size>limit)throw Object.assign(new Error('Request body too large'),{statusCode:413});chunks.push(chunk)}return Buffer.concat(chunks)}
async function readJson(req){let size=0,chunks=[];for await(const chunk of req){size+=chunk.length;if(size>JSON_LIMIT)throw Object.assign(new Error('Request body too large'),{statusCode:413});chunks.push(chunk)}if(!chunks.length)return {};try{return JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{throw Object.assign(new Error('Invalid JSON'),{statusCode:400})}}
function tripPath(pathname){const m=pathname.match(/^\/api\/trips\/([^/]+)$/);if(!m)return null;try{return decodeURIComponent(m[1])}catch{return null}}
function normalizeName(value){if(typeof value!=='string')throw Object.assign(new Error('여행 이름을 입력해주세요.'),{statusCode:400});const name=value.trim();if(!name||name.length>120)throw Object.assign(new Error('여행 이름은 1~120자로 입력해주세요.'),{statusCode:400});return name}
function publicUser(user){return {id:user.id,username:user.username,status:user.status,mustChangePassword:!!user.mustChangePassword,permissions:{canCreateTrips:user.permissions?.canCreateTrips!==false},createdAt:user.createdAt,updatedAt:user.updatedAt}}
function userIdPath(pathname,action){const m=pathname.match(new RegExp(`^/api/admin/users/([^/]+)/${action}$`));if(!m)return null;try{return decodeURIComponent(m[1])}catch{return null}}
function adminTripAccessPath(pathname){const m=pathname.match(/^\/api\/admin\/trips\/([^/]+)\/access$/);if(!m)return null;try{return decodeURIComponent(m[1])}catch{return null}}
function tripProviderCachePath(pathname){const m=pathname.match(/^\/api\/trips\/([^/]+)\/provider-cache$/);if(!m)return null;try{return decodeURIComponent(m[1])}catch{return null}}
function tripAttachmentCollectionPath(pathname){const m=pathname.match(/^\/api\/trips\/([^/]+)\/attachments$/);if(!m)return null;try{return decodeURIComponent(m[1])}catch{return null}}
function tripAttachmentPath(pathname){const m=pathname.match(/^\/api\/trips\/([^/]+)\/attachments\/([^/]+)$/);if(!m)return null;try{return {tripId:decodeURIComponent(m[1]),attachmentId:decodeURIComponent(m[2])}}catch{return null}}
function tripRevisionPath(pathname){const m=pathname.match(/^\/api\/trips\/([^/]+)\/revision$/);if(!m)return null;try{return decodeURIComponent(m[1])}catch{return null}}
function forbidden(message='이 여행에 접근할 권한이 없습니다.'){return Object.assign(new Error(message),{statusCode:403,code:'TRIP_FORBIDDEN'})}
const TELEMETRY_EVENTS=new Set(['GOOGLE_DYNAMIC_MAP','GOOGLE_AUTOCOMPLETE_REQUEST','GOOGLE_AUTOCOMPLETE_SESSION_START','GOOGLE_AUTOCOMPLETE_SESSION_SELECTED','GOOGLE_AUTOCOMPLETE_SESSION_ABANDONED','GOOGLE_PLACE_DETAILS_ESSENTIALS','GOOGLE_PLACE_DETAILS_PRO','GOOGLE_TEXT_SEARCH_PRO','GOOGLE_GEOCODING','GOOGLE_COMPUTE_ROUTES_ESSENTIALS','PROVIDER_CACHE_HIT','PROVIDER_CACHE_MISS','UX_TRIP_OPEN','UX_SAVE','UX_UNDO','UX_REDO','UX_CAPTURE_ENTER','UX_CAPTURE_EXIT','UX_PIN_REFRESH'])
function measurementStopPath(pathname){const m=pathname.match(/^\/api\/admin\/measurement-runs\/([^/]+)\/stop$/);if(!m)return null;try{return decodeURIComponent(m[1])}catch{return null}}

export function createTripPlannerServer({tripRepository,authService=null,userRepository=null,sessionRepository=null,accessRepository=null,providerCacheService=null,telemetryRepository=null,attachmentRepository=null,databaseSchemaVersion=null,configStore=null}){
  const requireAuth=async req=>authService?authService.requireAuth(req):({authenticated:true,role:'ADMIN',username:'test'})
  const requireAdmin=async req=>authService?authService.requireAdmin(req):({authenticated:true,role:'ADMIN',username:'test'})
  const requireTripAccess=async(req,tripId)=>{
    const actor=await requireAuth(req)
    if(actor.role==='ADMIN'||!accessRepository)return actor
    if(actor.userId&&await accessRepository.canAccess(tripId,actor.userId))return actor
    throw forbidden()
  }
  const recordTelemetry=async(actor,eventType,{provider=null,tripId=null,outcome='ATTEMPT'}={})=>{
    if(!telemetryRepository||!TELEMETRY_EVENTS.has(eventType))return
    const activeRun=await telemetryRepository.activeRun()
    await telemetryRepository.record({id:randomUUID(),occurredAt:Date.now(),subjectType:actor.role,subjectId:actor.role==='ADMIN'?'ADMIN':String(actor.userId),eventType,provider,tripId,outcome,runId:activeRun?.id??null})
  }
  const attachmentRefs=snapshot=>{const ids=[];const collect=item=>{for(const attachment of item?.attachments??[])if(attachment&&typeof attachment.id==='string')ids.push(attachment.id)};for(const item of snapshot.visits??[])collect(item);for(const item of snapshot.bucketItems??[])collect(item);for(const item of snapshot.bases??[])collect(item);return [...new Set(ids)]}
  return http.createServer(async(req,res)=>{
    try{
      const url=new URL(req.url??'/','http://localhost')
      if(url.pathname==='/api/health'&&req.method==='GET')return send(res,200,{ok:true,auth:!!authService})

      if(authService&&url.pathname==='/api/auth/status'&&req.method==='GET')return send(res,200,await authService.current(req))
      if(authService&&url.pathname==='/api/auth/login'&&req.method==='POST'){
        const body=await readJson(req),result=await authService.login(body.username,body.password)
        return send(res,200,result.status,{'set-cookie':sessionCookie(result.token,req)})
      }
      if(authService&&url.pathname==='/api/auth/signup'&&req.method==='POST'){
        const body=await readJson(req),created=await authService.signup(body.username,body.password)
        return send(res,201,{user:created,message:'가입 요청을 등록했습니다. 관리자 승인 후 로그인할 수 있습니다.'})
      }
      if(authService&&url.pathname==='/api/auth/logout'&&req.method==='POST'){
        await authService.logout(req);return send(res,200,{ok:true},{'set-cookie':clearSessionCookie(req)})
      }
      if(authService&&url.pathname==='/api/auth/admin-credentials'&&req.method==='PUT'){
        const body=await readJson(req),status=await authService.setAdminCredentials(req,{adminId:body.adminId,password:body.password})
        return send(res,200,status)
      }
      if(authService&&url.pathname==='/api/auth/password'&&req.method==='PUT'){
        const body=await readJson(req),status=await authService.changeOwnPassword(req,{currentPassword:body.currentPassword,newPassword:body.newPassword})
        return send(res,200,status)
      }

      if(url.pathname==='/api/runtime-config'&&req.method==='GET'){
        await requireAuth(req)
        const runtime=configStore?configStore.runtimeConfig():{googleApiKey:'',googleMapId:'',naverClientId:''}
        let providerCache={googlePlacesPositionTtlHours:0}
        try{const policy=configStore?.providerCachePolicy();providerCache={googlePlacesPositionTtlHours:policy?.policies?.['GOOGLE.PLACES.POSITION']?.ttlHours??0}}catch{}
        return send(res,200,{...runtime,providerCache})
      }

      if(url.pathname==='/api/admin/users'&&req.method==='GET'){
        await requireAdmin(req)
        return send(res,200,{users:userRepository?(await userRepository.list()).map(publicUser):[]})
      }
      const approveId=userIdPath(url.pathname,'approve')
      if(approveId&&req.method==='POST'){
        await requireAdmin(req);if(!userRepository||!(await userRepository.setStatus(approveId,'ACTIVE')))return send(res,404,{code:'USER_NOT_FOUND',message:'사용자를 찾을 수 없습니다.'})
        return send(res,200,{ok:true})
      }
      const statusId=userIdPath(url.pathname,'status')
      if(statusId&&req.method==='PUT'){
        await requireAdmin(req);const body=await readJson(req);if(body.status!=='ACTIVE'&&body.status!=='DISABLED')return send(res,400,{code:'INVALID_STATUS',message:'ACTIVE 또는 DISABLED만 지정할 수 있습니다.'})
        if(!userRepository||!(await userRepository.setStatus(statusId,body.status)))return send(res,404,{code:'USER_NOT_FOUND',message:'사용자를 찾을 수 없습니다.'})
        if(body.status==='DISABLED'&&sessionRepository)await sessionRepository.deleteForSubject('USER',statusId)
        return send(res,200,{ok:true})
      }
      const permissionId=userIdPath(url.pathname,'permissions')
      if(permissionId&&req.method==='PUT'){
        await requireAdmin(req);const body=await readJson(req)
        if(typeof body.canCreateTrips!=='boolean')return send(res,400,{code:'INVALID_PERMISSIONS',message:'canCreateTrips는 boolean이어야 합니다.'})
        if(!userRepository?.setPermissions||!(await userRepository.setPermissions(permissionId,{canCreateTrips:body.canCreateTrips})))return send(res,404,{code:'USER_NOT_FOUND',message:'사용자를 찾을 수 없습니다.'})
        return send(res,200,{ok:true,permissions:{canCreateTrips:body.canCreateTrips}})
      }
      const resetId=userIdPath(url.pathname,'reset-password')
      if(resetId&&req.method==='PUT'){
        await requireAdmin(req);const body=await readJson(req);const passwordHash=await hashPassword(body.password)
        if(!userRepository||!(await userRepository.setPassword(resetId,passwordHash,true)))return send(res,404,{code:'USER_NOT_FOUND',message:'사용자를 찾을 수 없습니다.'})
        if(sessionRepository)await sessionRepository.deleteForSubject('USER',resetId)
        return send(res,200,{ok:true,mustChangePassword:true})
      }
      if(url.pathname==='/api/admin/system'&&req.method==='GET'){
        await requireAdmin(req)
        const runtime=configStore?.runtimeConfig()??{},cache=configStore?.cachePolicyStatus()??null
        const cacheStats=providerCacheService?await providerCacheService.stats():null
        return send(res,200,{database:{schemaVersion:databaseSchemaVersion??null},maps:{googleConfigured:!!runtime.googleApiKey,googleMapIdConfigured:!!runtime.googleMapId,naverConfigured:!!runtime.naverClientId},cache:cache?{...cache,stats:cacheStats}:null})
      }
      if(url.pathname==='/api/telemetry'&&req.method==='POST'){
        const actor=await requireAuth(req),body=await readJson(req),eventType=String(body.eventType??'')
        if(!TELEMETRY_EVENTS.has(eventType))return send(res,400,{code:'INVALID_TELEMETRY_EVENT',message:'지원하지 않는 telemetry event입니다.'})
        const provider=body.provider===null||body.provider===undefined?null:String(body.provider)
        if(provider!==null&&provider!=='GOOGLE'&&provider!=='NAVER')return send(res,400,{code:'INVALID_PROVIDER',message:'telemetry provider가 올바르지 않습니다.'})
        const tripId=body.tripId?String(body.tripId):null
        if(tripId)await requireTripAccess(req,tripId)
        await recordTelemetry(actor,eventType,{provider,tripId,outcome:String(body.outcome??'ATTEMPT').slice(0,24)})
        return send(res,202,{ok:true})
      }
      if(url.pathname==='/api/admin/usage'&&req.method==='GET'){
        await requireAdmin(req)
        if(!telemetryRepository)return send(res,200,{windows:{},activeRun:null,recentRuns:[]})
        const now=Date.now(),windows={}
        for(const [key,hours] of [['24h',24],['7d',24*7],['30d',24*30]])windows[key]=await telemetryRepository.countsSince(now-hours*3600000)
        const activeRun=await telemetryRepository.activeRun(),recent=await telemetryRepository.recentRuns(8)
        const recentRuns=[]
        for(const run of recent)recentRuns.push({...run,counts:await telemetryRepository.runCounts(run.id)})
        return send(res,200,{windows,activeRun,recentRuns})
      }
      if(url.pathname==='/api/admin/measurement-runs'&&req.method==='POST'){
        const actor=await requireAdmin(req),body=await readJson(req)
        if(!telemetryRepository)return send(res,503,{code:'TELEMETRY_UNAVAILABLE',message:'Telemetry 저장소를 사용할 수 없습니다.'})
        const raw=typeof body.label==='string'?body.label.trim():''
        const label=(raw||`Measurement ${new Date().toISOString().slice(0,19)}`).slice(0,80)
        return send(res,201,await telemetryRepository.startRun({id:randomUUID(),label,startedAt:Date.now(),startedBy:actor.username}))
      }
      const stopRunId=measurementStopPath(url.pathname)
      if(stopRunId&&req.method==='POST'){
        await requireAdmin(req)
        if(!telemetryRepository)return send(res,503,{code:'TELEMETRY_UNAVAILABLE',message:'Telemetry 저장소를 사용할 수 없습니다.'})
        const stopped=await telemetryRepository.stopRun(stopRunId,Date.now())
        return stopped?send(res,200,stopped):send(res,404,{code:'MEASUREMENT_RUN_NOT_FOUND',message:'진행 중인 Measurement Run을 찾을 수 없습니다.'})
      }
      if(url.pathname==='/api/admin/cache-policy'&&req.method==='PUT'){
        await requireAdmin(req)
        if(!configStore)return send(res,503,{code:'CONFIG_UNAVAILABLE',message:'서버 설정 저장소를 사용할 수 없습니다.'})
        const body=await readJson(req),status=configStore.setProviderCachePolicy(body)
        if(providerCacheService){await providerCacheService.purge();providerCacheService.restart()}
        return send(res,200,{...status,stats:providerCacheService?await providerCacheService.stats():null})
      }
      if(url.pathname==='/api/admin/trips/access'&&req.method==='GET'){
        await requireAdmin(req)
        const trips=await tripRepository.list()
        const enriched=await Promise.all(trips.map(async trip=>({...trip,...(accessRepository?await accessRepository.get(trip.tripId):{accessMode:'OPEN',allowedUserIds:[]})})))
        return send(res,200,{trips:enriched})
      }
      const adminAccessTripId=adminTripAccessPath(url.pathname)
      if(adminAccessTripId&&req.method==='GET'){
        await requireAdmin(req)
        if(!(await tripRepository.load(adminAccessTripId)))return send(res,404,{code:'TRIP_NOT_FOUND',message:'여행을 찾을 수 없습니다.'})
        return send(res,200,accessRepository?await accessRepository.get(adminAccessTripId):{accessMode:'OPEN',allowedUserIds:[]})
      }
      if(adminAccessTripId&&req.method==='PUT'){
        await requireAdmin(req);const body=await readJson(req)
        if(body.accessMode!=='OPEN'&&body.accessMode!=='RESTRICTED')return send(res,400,{code:'INVALID_ACCESS_MODE',message:'OPEN 또는 RESTRICTED만 지정할 수 있습니다.'})
        if(!Array.isArray(body.allowedUserIds)||body.allowedUserIds.some(id=>typeof id!=='string'))return send(res,400,{code:'INVALID_ACCESS_USERS',message:'allowedUserIds가 올바르지 않습니다.'})
        const result=accessRepository?await accessRepository.set(adminAccessTripId,{accessMode:body.accessMode,allowedUserIds:body.allowedUserIds}):{accessMode:'OPEN',allowedUserIds:[]}
        return send(res,200,result)
      }

      if(url.pathname==='/api/trips'&&req.method==='GET'){
        const actor=await requireAuth(req),trips=await tripRepository.list()
        if(actor.role==='ADMIN'||!accessRepository)return send(res,200,{trips})
        const visible=[]
        for(const trip of trips)if(actor.userId&&await accessRepository.canAccess(trip.tripId,actor.userId))visible.push(trip)
        return send(res,200,{trips:visible})
      }
      if(url.pathname==='/api/trips'&&req.method==='POST'){
        const actor=await requireAuth(req)
        if(actor.role!=='ADMIN'&&actor.permissions?.canCreateTrips===false)throw Object.assign(new Error('새 여행을 생성할 권한이 없습니다.'),{statusCode:403,code:'TRIP_CREATE_FORBIDDEN'})
        const body=await readJson(req),name=normalizeName(body.name),mapProvider=body.mapProvider??'GOOGLE'
        if(mapProvider!=='GOOGLE'&&mapProvider!=='NAVER')return send(res,400,{code:'INVALID_PROVIDER',message:'지원하지 않는 지도 Provider입니다.'})
        const snapshot=createEmptyTripSnapshot({tripId:randomUUID(),name,mapProvider})
        const created=await tripRepository.create(snapshot)
        return send(res,201,created)
      }
      const cacheTripId=tripProviderCachePath(url.pathname)
      if(cacheTripId&&req.method==='GET'){
        const actor=await requireTripAccess(req,cacheTripId)
        if(!providerCacheService)return send(res,200,{enabled:false,hit:false})
        const policyKey=url.searchParams.get('policyKey')?.trim()??'',subjectKey=url.searchParams.get('subjectKey')?.trim()??''
        if(!policyKey||!subjectKey)return send(res,400,{code:'INVALID_CACHE_KEY',message:'policyKey와 subjectKey가 필요합니다.'})
        const provider=policyKey.startsWith('GOOGLE.')?'GOOGLE':policyKey.startsWith('NAVER.')?'NAVER':''
        if(!provider)return send(res,400,{code:'INVALID_CACHE_KEY',message:'지원하지 않는 캐시 정책입니다.'})
        const result=await providerCacheService.get(cacheTripId,{provider,policyKey,subjectKey})
        await recordTelemetry(actor,result.hit?'PROVIDER_CACHE_HIT':'PROVIDER_CACHE_MISS',{provider,tripId:cacheTripId,outcome:result.hit?'HIT':'MISS'})
        return send(res,200,{enabled:result.enabled,hit:result.hit,...(result.hit?{value:result.value,fetchedAtEpochMs:result.fetchedAtEpochMs,evaluation:result.evaluation}:{}),ttlHours:result.policy?.ttlHours??0,maxTtlHours:result.policy?.maxTtlHours??0})
      }
      if(cacheTripId&&req.method==='PUT'){
        await requireTripAccess(req,cacheTripId)
        if(!providerCacheService)return send(res,200,{stored:false,reason:'UNAVAILABLE'})
        const body=await readJson(req),policyKey=String(body.policyKey??''),subjectKey=String(body.subjectKey??''),provider=policyKey.startsWith('GOOGLE.')?'GOOGLE':policyKey.startsWith('NAVER.')?'NAVER':''
        if(!provider||!subjectKey)return send(res,400,{code:'INVALID_CACHE_KEY',message:'캐시 키가 올바르지 않습니다.'})
        return send(res,200,await providerCacheService.put(cacheTripId,{provider,policyKey,subjectKey,value:body.value}))
      }

      const attachmentCollectionTripId=tripAttachmentCollectionPath(url.pathname)
      if(attachmentCollectionTripId&&req.method==='POST'){
        await requireTripAccess(req,attachmentCollectionTripId)
        if(!attachmentRepository)return send(res,503,{code:'ATTACHMENTS_UNAVAILABLE',message:'첨부 저장소를 사용할 수 없습니다.'})
        const mime=String(req.headers['content-type']??'').split(';')[0].trim().toLowerCase()
        if(!ATTACHMENT_MIME.has(mime))return send(res,415,{code:'INVALID_ATTACHMENT_TYPE',message:'JPEG, PNG, WebP 이미지만 첨부할 수 있습니다.'})
        const encoded=String(req.headers['x-tripplanner-file-name']??'image');let fileName='image'
        try{fileName=decodeURIComponent(encoded)}catch{fileName='image'}
        fileName=fileName.replace(/[\\/\0]/g,'_').slice(0,180)||'image'
        const bytes=await readBytes(req,ATTACHMENT_LIMIT)
        if(!bytes.length)return send(res,400,{code:'EMPTY_ATTACHMENT',message:'빈 파일은 첨부할 수 없습니다.'})
        if(!attachmentSignatureMatches(bytes,mime))return send(res,415,{code:'ATTACHMENT_SIGNATURE_MISMATCH',message:'파일 내용이 이미지 형식과 일치하지 않습니다.'})
        const attachment=await attachmentRepository.create({id:randomUUID(),tripId:attachmentCollectionTripId,fileName,mimeType:mime,bytes})
        return send(res,201,{attachment})
      }
      const attachmentTarget=tripAttachmentPath(url.pathname)
      if(attachmentTarget&&req.method==='GET'){
        await requireTripAccess(req,attachmentTarget.tripId)
        const found=attachmentRepository?await attachmentRepository.get(attachmentTarget.tripId,attachmentTarget.attachmentId):null
        if(!found){res.writeHead(404,{'cache-control':'no-store'});return res.end()}
        res.writeHead(200,{'content-type':found.attachment.mimeType,'content-length':found.bytes.length,'content-disposition':`inline; filename*=UTF-8''${encodeURIComponent(found.attachment.fileName)}`,'cache-control':'private, max-age=3600'})
        return res.end(found.bytes)
      }

      const revisionTripId=tripRevisionPath(url.pathname)
      if(revisionTripId&&req.method==='GET'){
        await requireTripAccess(req,revisionTripId);const loaded=await tripRepository.load(revisionTripId)
        return loaded?send(res,200,{revision:loaded.revision}):send(res,404,{code:'TRIP_NOT_FOUND',message:'여행을 찾을 수 없습니다.'})
      }

      const tripId=tripPath(url.pathname)
      if(tripId&&req.method==='GET'){
        await requireTripAccess(req,tripId);const loaded=await tripRepository.load(tripId)
        return loaded?send(res,200,loaded):send(res,404,{code:'TRIP_NOT_FOUND',message:'여행을 찾을 수 없습니다.'})
      }
      if(tripId&&req.method==='PUT'){
        await requireTripAccess(req,tripId);const body=await readJson(req)
        if(!Number.isInteger(body.expectedRevision)||body.expectedRevision<0)return send(res,400,{code:'INVALID_REVISION',message:'expectedRevision이 올바르지 않습니다.'})
        validateTripSnapshot(body.snapshot,{expectedTripId:tripId})
        const revision=await tripRepository.save(tripId,body.snapshot,body.expectedRevision)
        if(attachmentRepository)try{await attachmentRepository.reconcile(tripId,attachmentRefs(body.snapshot))}catch(error){console.warn('Attachment reconcile failed after Trip save:',error)}
        return send(res,200,{revision})
      }
      if(tripId&&req.method==='DELETE'){
        await requireAdmin(req)
        if(attachmentRepository)await attachmentRepository.deleteTripFiles(tripId)
        const deleted=await tripRepository.delete?.(tripId)
        return deleted?send(res,200,{ok:true}):send(res,404,{code:'TRIP_NOT_FOUND',message:'여행을 찾을 수 없습니다.'})
      }
      send(res,404,{code:'NOT_FOUND',message:'API 경로를 찾을 수 없습니다.'})
    }catch(error){
      if(error instanceof RevisionConflictError)return send(res,409,{code:'REVISION_CONFLICT',message:'다른 편집 내용이 먼저 저장되었습니다. 다시 불러온 뒤 저장해주세요.'})
      if(error instanceof TripNotFoundError)return send(res,404,{code:'TRIP_NOT_FOUND',message:'여행을 찾을 수 없습니다.'})
      const status=Number(error?.statusCode)||400
      send(res,status,{code:error?.code??'BAD_REQUEST',message:error instanceof Error?error.message:'요청을 처리하지 못했습니다.'})
    }
  })
}
