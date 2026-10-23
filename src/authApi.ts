export type UserPermissions={canCreateTrips:boolean}
export type AuthStatus={authenticated:false}|{authenticated:true;role:'ADMIN'|'USER';username:string;mustChangeAdminPassword?:boolean;mustChangePassword?:boolean;userId?:string;permissions?:UserPermissions}
export type RuntimeConfig={googleApiKey:string;googleMapId:string;naverClientId:string;providerCache:{googlePlacesPositionTtlHours:number}}
export type ManagedUser={id:string;username:string;status:'PENDING'|'ACTIVE'|'DISABLED';mustChangePassword:boolean;permissions:UserPermissions;createdAt:string;updatedAt:string}
export type TripAccessMode='OPEN'|'RESTRICTED'
export type TripAccessConfig={accessMode:TripAccessMode;allowedUserIds:string[]}
export type ManagedTripAccess=TripAccessConfig&{tripId:string;name:string;mapProvider:'GOOGLE'|'NAVER';revision:number}
export type CacheOperatorPolicy={ttlHours:number;safetyMarginHours?:number;retentionHours?:number}
export type CacheOperatorConfig={schemaVersion:1;cleanupPollHours:number;defaultSafetyMarginHours:number;allowCrossTripCacheReuse:boolean;policies:Record<string,CacheOperatorPolicy>}
export type CachePolicyView={key:string;provider:'GOOGLE'|'NAVER';ttlHours:number;maxTtlHours:number;retentionHours:number;safetyMarginHours:number;effectiveTtlHours:number;status:'VERIFIED'|'CONSERVATIVE'|'UNVERIFIED';crossTripReuse:'ALLOWED'|'FORBIDDEN'|'UNVERIFIED';refreshAfterHours:number|null;verifiedAt:string|null;notes:string|null}
export type CacheStatus={runtimeWiring:string;overridePath:string;overrideExists:boolean;operatorConfig:CacheOperatorConfig|null;error:string|null;note:string;legalCatalogVersion?:string;cleanupPollHours?:number;defaultSafetyMarginHours?:number;allowCrossTripCacheReuse?:boolean;policies?:CachePolicyView[];stats?:{records:number}|null}
export type MeasurementRun={id:string;label:string;startedAt:number;endedAt:number|null;startedBy:string;counts?:Record<string,number>}
export type UsageStatus={windows:Record<string,Record<string,number>>;activeRun:MeasurementRun|null;recentRuns:MeasurementRun[]}
export type SystemStatus={database?:{schemaVersion:number|null};maps:{googleConfigured:boolean;googleMapIdConfigured:boolean;naverConfigured:boolean};cache:CacheStatus|null}

async function api<T>(url:string,init?:RequestInit):Promise<T>{
  const response=await fetch(url,{credentials:'same-origin',...init,headers:{Accept:'application/json',...(init?.body?{'content-type':'application/json'}:{}),...(init?.headers??{})}})
  const body=await response.json().catch(()=>({})) as T&{message?:string}
  if(!response.ok)throw new Error(body.message??`요청에 실패했습니다. (${response.status})`)
  return body
}
export const authApi={
  status:()=>api<AuthStatus>('/api/auth/status'),
  login:(username:string,password:string)=>api<AuthStatus>('/api/auth/login',{method:'POST',body:JSON.stringify({username,password})}),
  signup:(username:string,password:string)=>api<{message:string}>('/api/auth/signup',{method:'POST',body:JSON.stringify({username,password})}),
  logout:()=>api<{ok:boolean}>('/api/auth/logout',{method:'POST'}),
  runtimeConfig:()=>api<RuntimeConfig>('/api/runtime-config'),
  setAdminCredentials:(adminId:string,password:string)=>api<AuthStatus>('/api/auth/admin-credentials',{method:'PUT',body:JSON.stringify({adminId,password})}),
  changePassword:(currentPassword:string,newPassword:string)=>api<AuthStatus>('/api/auth/password',{method:'PUT',body:JSON.stringify({currentPassword,newPassword})}),
  users:()=>api<{users:ManagedUser[]}>('/api/admin/users'),
  approve:(id:string)=>api<{ok:boolean}>(`/api/admin/users/${encodeURIComponent(id)}/approve`,{method:'POST'}),
  setUserStatus:(id:string,status:'ACTIVE'|'DISABLED')=>api<{ok:boolean}>(`/api/admin/users/${encodeURIComponent(id)}/status`,{method:'PUT',body:JSON.stringify({status})}),
  setUserPermissions:(id:string,permissions:UserPermissions)=>api<{ok:boolean;permissions:UserPermissions}>(`/api/admin/users/${encodeURIComponent(id)}/permissions`,{method:'PUT',body:JSON.stringify(permissions)}),
  resetUserPassword:(id:string,password:string)=>api<{ok:boolean;mustChangePassword:boolean}>(`/api/admin/users/${encodeURIComponent(id)}/reset-password`,{method:'PUT',body:JSON.stringify({password})}),
  system:()=>api<SystemStatus>('/api/admin/system'),
  setCachePolicy:(config:CacheOperatorConfig)=>api<CacheStatus>('/api/admin/cache-policy',{method:'PUT',body:JSON.stringify(config)}),
  tripAccessList:()=>api<{trips:ManagedTripAccess[]}>('/api/admin/trips/access'),
  tripAccess:(tripId:string)=>api<TripAccessConfig>(`/api/admin/trips/${encodeURIComponent(tripId)}/access`),
  setTripAccess:(tripId:string,value:TripAccessConfig)=>api<TripAccessConfig>(`/api/admin/trips/${encodeURIComponent(tripId)}/access`,{method:'PUT',body:JSON.stringify(value)}),
  usage:()=>api<UsageStatus>('/api/admin/usage'),
  startMeasurement:(label:string)=>api<MeasurementRun>('/api/admin/measurement-runs',{method:'POST',body:JSON.stringify({label})}),
  stopMeasurement:(id:string)=>api<MeasurementRun>(`/api/admin/measurement-runs/${encodeURIComponent(id)}/stop`,{method:'POST'}),
}
