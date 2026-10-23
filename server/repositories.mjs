import { mkdirSync, writeFileSync, readFileSync, unlinkSync, existsSync } from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { validateTripSnapshot } from './snapshotValidation.mjs'

export class RevisionConflictError extends Error { constructor(message='Trip revision conflict'){super(message);this.name='RevisionConflictError';this.code='REVISION_CONFLICT'} }
export class TripNotFoundError extends Error { constructor(message='Trip not found'){super(message);this.name='TripNotFoundError';this.code='TRIP_NOT_FOUND'} }

export class InMemoryTripSnapshotRepository {
  #items=new Map()
  async create(snapshot){ validateTripSnapshot(snapshot); if(this.#items.has(snapshot.tripId)) throw new Error('Trip already exists'); const value={revision:0,snapshot:structuredClone(snapshot)}; this.#items.set(snapshot.tripId,value); return structuredClone(value) }
  async list(){ return [...this.#items.values()].map(({revision,snapshot})=>({tripId:snapshot.tripId,name:snapshot.name,mapProvider:snapshot.mapProvider,revision})).sort((a,b)=>a.name.localeCompare(b.name)) }
  async load(tripId){ const value=this.#items.get(tripId); return value?structuredClone(value):null }
  async save(tripId,snapshot,expectedRevision){ validateTripSnapshot(snapshot,{expectedTripId:tripId}); const current=this.#items.get(tripId); if(!current) throw new TripNotFoundError(); if(current.snapshot.mapProvider!==snapshot.mapProvider) throw new Error('Trip mapProvider is immutable'); if(current.revision!==expectedRevision) throw new RevisionConflictError(); const next={revision:current.revision+1,snapshot:structuredClone(snapshot)}; this.#items.set(tripId,next); return next.revision }
  async delete(tripId){ return this.#items.delete(tripId) }
}

export class InMemoryProviderCacheRepository {
  #records=new Map(); #refs=new Map()
  async listAll(){ return [...this.#records.values()].map(row=>structuredClone(row)) }
  async deleteByCacheIds(ids){ for(const id of ids){this.#records.delete(id); for(const refs of this.#refs.values()) refs.delete(id)} }
  async findForTrip(tripId,key){ const refs=this.#refs.get(tripId); if(!refs)return undefined; for(const id of refs){const row=this.#records.get(id); if(row&&matches(row,key))return structuredClone(row)} }
  async findGlobal(key){ for(const row of this.#records.values())if(matches(row,key))return structuredClone(row) }
  async linkTripToCache(tripId,cacheId){ if(!this.#records.has(cacheId))return; const refs=this.#refs.get(tripId)??new Set(); refs.add(cacheId); this.#refs.set(tripId,refs) }
  async saveForTrip(tripId,record){ this.#records.set(record.cacheId,structuredClone(record)); await this.linkTripToCache(tripId,record.cacheId) }
}

function matches(row,key){return row.provider===key.provider&&row.policyKey===key.policyKey&&row.subjectKey===key.subjectKey}

export class SqliteRepositories {
  constructor(dbPath){
    if(dbPath!==':memory:') mkdirSync(path.dirname(path.resolve(dbPath)),{recursive:true})
    this.db=new DatabaseSync(dbPath)
    this.db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;')
    this.#migrate()
    this.trips=new SqliteTripSnapshotRepository(this.db)
    this.providerCache=new SqliteProviderCacheRepository(this.db)
    this.users=new SqliteUserRepository(this.db)
    this.sessions=new SqliteSessionRepository(this.db)
    this.access=new SqliteTripAccessRepository(this.db)
    this.telemetry=new SqliteTelemetryRepository(this.db)
    const attachmentDir=dbPath===':memory:'?path.resolve('.tripplanner-test-attachments'):path.join(path.dirname(path.resolve(dbPath)),'attachments')
    this.attachments=new SqliteAttachmentRepository(this.db,attachmentDir)
  }
  close(){this.db.close()}
  #migrate(){
    this.db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);`)
    const applied=new Set(this.db.prepare('SELECT version FROM schema_migrations ORDER BY version').all().map(row=>Number(row.version)))
    const migrations=[
      [1,`
        CREATE TABLE IF NOT EXISTS trips(
          id TEXT PRIMARY KEY, name TEXT NOT NULL, map_provider TEXT NOT NULL CHECK(map_provider IN ('GOOGLE','NAVER')),
          schema_version INTEGER NOT NULL, revision INTEGER NOT NULL, snapshot_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_trips_updated_at ON trips(updated_at DESC);
        CREATE TABLE IF NOT EXISTS provider_cache(
          cache_id TEXT PRIMARY KEY, provider TEXT NOT NULL CHECK(provider IN ('GOOGLE','NAVER')), policy_key TEXT NOT NULL, subject_key TEXT NOT NULL,
          fetched_at_epoch_ms INTEGER NOT NULL, value_json TEXT NOT NULL, UNIQUE(provider,policy_key,subject_key)
        );
        CREATE TABLE IF NOT EXISTS trip_cache_ref(
          trip_id TEXT NOT NULL, cache_id TEXT NOT NULL, PRIMARY KEY(trip_id,cache_id),
          FOREIGN KEY(trip_id) REFERENCES trips(id) ON DELETE CASCADE, FOREIGN KEY(cache_id) REFERENCES provider_cache(cache_id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_trip_cache_ref_trip ON trip_cache_ref(trip_id);
      `],
      [2,`
        CREATE TABLE IF NOT EXISTS users(
          id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('PENDING','ACTIVE','DISABLED')),
          must_change_password INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_users_status ON users(status,created_at);
        CREATE TABLE IF NOT EXISTS auth_sessions(
          token_hash TEXT PRIMARY KEY, subject_type TEXT NOT NULL CHECK(subject_type IN ('ADMIN','USER')), subject_id TEXT NOT NULL,
          expires_at_epoch_ms INTEGER NOT NULL, created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_auth_sessions_subject ON auth_sessions(subject_type,subject_id);
        CREATE INDEX IF NOT EXISTS idx_auth_sessions_expiry ON auth_sessions(expires_at_epoch_ms);
      `],
      [3,`
        CREATE TABLE IF NOT EXISTS user_permissions(
          user_id TEXT PRIMARY KEY, can_create_trips INTEGER NOT NULL DEFAULT 1, FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS trip_access_settings(
          trip_id TEXT PRIMARY KEY, access_mode TEXT NOT NULL CHECK(access_mode IN ('OPEN','RESTRICTED')), FOREIGN KEY(trip_id) REFERENCES trips(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS trip_access_users(
          trip_id TEXT NOT NULL, user_id TEXT NOT NULL, PRIMARY KEY(trip_id,user_id),
          FOREIGN KEY(trip_id) REFERENCES trips(id) ON DELETE CASCADE, FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_trip_access_users_user ON trip_access_users(user_id,trip_id);
      `],
      [4,`
        CREATE TABLE IF NOT EXISTS measurement_runs(
          id TEXT PRIMARY KEY, label TEXT NOT NULL, started_at_epoch_ms INTEGER NOT NULL, ended_at_epoch_ms INTEGER, started_by TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_measurement_runs_started ON measurement_runs(started_at_epoch_ms DESC);
        CREATE TABLE IF NOT EXISTS telemetry_events(
          id TEXT PRIMARY KEY, occurred_at_epoch_ms INTEGER NOT NULL, subject_type TEXT NOT NULL CHECK(subject_type IN ('ADMIN','USER')), subject_id TEXT NOT NULL,
          event_type TEXT NOT NULL, provider TEXT, trip_id TEXT, outcome TEXT NOT NULL DEFAULT 'ATTEMPT', run_id TEXT,
          FOREIGN KEY(trip_id) REFERENCES trips(id) ON DELETE SET NULL, FOREIGN KEY(run_id) REFERENCES measurement_runs(id) ON DELETE SET NULL
        );
        CREATE INDEX IF NOT EXISTS idx_telemetry_time ON telemetry_events(occurred_at_epoch_ms);
        CREATE INDEX IF NOT EXISTS idx_telemetry_type_time ON telemetry_events(event_type,occurred_at_epoch_ms);
        CREATE INDEX IF NOT EXISTS idx_telemetry_run ON telemetry_events(run_id,occurred_at_epoch_ms);
      `],
      [5,`
        CREATE TABLE IF NOT EXISTS trip_attachments(
          id TEXT PRIMARY KEY, trip_id TEXT NOT NULL, file_name TEXT NOT NULL, mime_type TEXT NOT NULL,
          size_bytes INTEGER NOT NULL, storage_name TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL, committed INTEGER NOT NULL DEFAULT 0,
          FOREIGN KEY(trip_id) REFERENCES trips(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_trip_attachments_trip ON trip_attachments(trip_id,created_at);
      `],
    ]
    for(const [version,sql] of migrations){
      if(applied.has(version))continue
      this.db.exec('BEGIN IMMEDIATE')
      try{this.db.exec(sql);this.db.prepare('INSERT INTO schema_migrations(version,applied_at) VALUES(?,?)').run(version,new Date().toISOString());this.db.exec('COMMIT')}
      catch(error){this.db.exec('ROLLBACK');throw error}
    }
    this.schemaVersion=Math.max(0,...this.db.prepare('SELECT version FROM schema_migrations').all().map(row=>Number(row.version)))
  }
}

class SqliteTripSnapshotRepository {
  constructor(db){this.db=db}
  async create(snapshot){
    validateTripSnapshot(snapshot)
    const now=new Date().toISOString(),json=JSON.stringify(snapshot)
    this.db.prepare('INSERT INTO trips(id,name,map_provider,schema_version,revision,snapshot_json,created_at,updated_at) VALUES(?,?,?,?,0,?,?,?)')
      .run(snapshot.tripId,snapshot.name,snapshot.mapProvider,snapshot.schemaVersion,json,now,now)
    return {revision:0,snapshot:structuredClone(snapshot)}
  }
  async list(){ return this.db.prepare('SELECT id AS tripId,name,map_provider AS mapProvider,revision FROM trips ORDER BY updated_at DESC').all().map(row=>({...row,revision:Number(row.revision)})) }
  async load(tripId){ const row=this.db.prepare('SELECT revision,snapshot_json FROM trips WHERE id=?').get(tripId); if(!row)return null; const snapshot=JSON.parse(String(row.snapshot_json)); validateTripSnapshot(snapshot,{expectedTripId:tripId}); return {revision:Number(row.revision),snapshot} }
  async save(tripId,snapshot,expectedRevision){
    validateTripSnapshot(snapshot,{expectedTripId:tripId})
    this.db.exec('BEGIN IMMEDIATE')
    try{
      const current=this.db.prepare('SELECT revision,map_provider FROM trips WHERE id=?').get(tripId)
      if(!current) throw new TripNotFoundError()
      if(String(current.map_provider)!==snapshot.mapProvider) throw new Error('Trip mapProvider is immutable')
      if(Number(current.revision)!==expectedRevision) throw new RevisionConflictError()
      const next=expectedRevision+1,now=new Date().toISOString()
      const result=this.db.prepare('UPDATE trips SET name=?,schema_version=?,revision=?,snapshot_json=?,updated_at=? WHERE id=? AND revision=?')
        .run(snapshot.name,snapshot.schemaVersion,next,JSON.stringify(snapshot),now,tripId,expectedRevision)
      if(Number(result.changes)!==1) throw new RevisionConflictError()
      this.db.exec('COMMIT'); return next
    }catch(error){this.db.exec('ROLLBACK');throw error}
  }
  async delete(tripId){
    this.db.exec('BEGIN IMMEDIATE')
    try{
      const result=this.db.prepare('DELETE FROM trips WHERE id=?').run(tripId)
      if(Number(result.changes)!==1){this.db.exec('ROLLBACK');return false}
      this.db.prepare('DELETE FROM provider_cache WHERE cache_id NOT IN (SELECT cache_id FROM trip_cache_ref)').run()
      this.db.exec('COMMIT');return true
    }catch(error){this.db.exec('ROLLBACK');throw error}
  }
}

class SqliteProviderCacheRepository {
  constructor(db){this.db=db}
  async listAll(){ return this.db.prepare('SELECT cache_id,provider,policy_key,subject_key,fetched_at_epoch_ms,value_json FROM provider_cache').all().map(cacheRow) }
  async deleteByCacheIds(ids){ if(!ids.length)return; this.db.exec('BEGIN'); try{const stmt=this.db.prepare('DELETE FROM provider_cache WHERE cache_id=?'); for(const id of ids)stmt.run(id);this.db.exec('COMMIT')}catch(e){this.db.exec('ROLLBACK');throw e} }
  async findForTrip(tripId,key){ const row=this.db.prepare(`SELECT c.cache_id,c.provider,c.policy_key,c.subject_key,c.fetched_at_epoch_ms,c.value_json FROM provider_cache c JOIN trip_cache_ref r ON r.cache_id=c.cache_id WHERE r.trip_id=? AND c.provider=? AND c.policy_key=? AND c.subject_key=? LIMIT 1`).get(tripId,key.provider,key.policyKey,key.subjectKey); return row?cacheRow(row):undefined }
  async findGlobal(key){ const row=this.db.prepare('SELECT cache_id,provider,policy_key,subject_key,fetched_at_epoch_ms,value_json FROM provider_cache WHERE provider=? AND policy_key=? AND subject_key=? LIMIT 1').get(key.provider,key.policyKey,key.subjectKey); return row?cacheRow(row):undefined }
  async linkTripToCache(tripId,cacheId){ this.db.prepare('INSERT OR IGNORE INTO trip_cache_ref(trip_id,cache_id) VALUES(?,?)').run(tripId,cacheId) }
  async saveForTrip(tripId,record){
    this.db.exec('BEGIN IMMEDIATE')
    try{
      this.db.prepare(`INSERT INTO provider_cache(cache_id,provider,policy_key,subject_key,fetched_at_epoch_ms,value_json) VALUES(?,?,?,?,?,?) ON CONFLICT(provider,policy_key,subject_key) DO UPDATE SET fetched_at_epoch_ms=excluded.fetched_at_epoch_ms,value_json=excluded.value_json`).run(record.cacheId,record.provider,record.policyKey,record.subjectKey,record.fetchedAtEpochMs,JSON.stringify(record.value))
      const actual=this.db.prepare('SELECT cache_id FROM provider_cache WHERE provider=? AND policy_key=? AND subject_key=?').get(record.provider,record.policyKey,record.subjectKey)
      this.db.prepare('INSERT OR IGNORE INTO trip_cache_ref(trip_id,cache_id) VALUES(?,?)').run(tripId,String(actual.cache_id))
      this.db.exec('COMMIT')
    }catch(e){this.db.exec('ROLLBACK');throw e}
  }
}
function cacheRow(row){return {cacheId:String(row.cache_id),provider:String(row.provider),policyKey:String(row.policy_key),subjectKey:String(row.subject_key),fetchedAtEpochMs:Number(row.fetched_at_epoch_ms),value:JSON.parse(String(row.value_json))}}

class SqliteUserRepository {
  constructor(db){this.db=db}
  async create({id,username,passwordHash,status='PENDING',mustChangePassword=false}){
    const now=new Date().toISOString()
    this.db.prepare('INSERT INTO users(id,username,password_hash,status,must_change_password,created_at,updated_at) VALUES(?,?,?,?,?,?,?)')
      .run(id,username,passwordHash,status,mustChangePassword?1:0,now,now)
    return this.getById(id)
  }
  #get(where,value){return this.db.prepare(`SELECT u.*,COALESCE(p.can_create_trips,1) AS can_create_trips FROM users u LEFT JOIN user_permissions p ON p.user_id=u.id WHERE ${where}`).get(value)}
  async getById(id){const row=this.#get('u.id=?',id);return row?userRow(row):null}
  async getByUsername(username){const row=this.#get('u.username=? COLLATE NOCASE',username);return row?userRow(row):null}
  async list(){return this.db.prepare(`SELECT u.*,COALESCE(p.can_create_trips,1) AS can_create_trips FROM users u LEFT JOIN user_permissions p ON p.user_id=u.id ORDER BY CASE u.status WHEN 'PENDING' THEN 0 WHEN 'ACTIVE' THEN 1 ELSE 2 END,u.created_at ASC`).all().map(userRow)}
  async setStatus(id,status){const now=new Date().toISOString();const result=this.db.prepare('UPDATE users SET status=?,updated_at=? WHERE id=?').run(status,now,id);return Number(result.changes)===1}
  async setPassword(id,passwordHash,mustChangePassword=true){const now=new Date().toISOString();const result=this.db.prepare('UPDATE users SET password_hash=?,must_change_password=?,updated_at=? WHERE id=?').run(passwordHash,mustChangePassword?1:0,now,id);return Number(result.changes)===1}
  async setPermissions(id,{canCreateTrips}){
    if(!this.db.prepare('SELECT 1 FROM users WHERE id=?').get(id))return false
    this.db.prepare(`INSERT INTO user_permissions(user_id,can_create_trips) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET can_create_trips=excluded.can_create_trips`).run(id,canCreateTrips?1:0)
    return true
  }
}

class SqliteSessionRepository {
  constructor(db){this.db=db}
  async create({tokenHash,subjectType,subjectId,expiresAt}){this.db.prepare('INSERT INTO auth_sessions(token_hash,subject_type,subject_id,expires_at_epoch_ms,created_at) VALUES(?,?,?,?,?)').run(tokenHash,subjectType,subjectId,expiresAt,new Date().toISOString())}
  async getValid(tokenHash,now){this.db.prepare('DELETE FROM auth_sessions WHERE expires_at_epoch_ms<=?').run(now);const row=this.db.prepare('SELECT subject_type,subject_id,expires_at_epoch_ms FROM auth_sessions WHERE token_hash=? AND expires_at_epoch_ms>?').get(tokenHash,now);return row?{subjectType:String(row.subject_type),subjectId:String(row.subject_id),expiresAt:Number(row.expires_at_epoch_ms)}:null}
  async delete(tokenHash){this.db.prepare('DELETE FROM auth_sessions WHERE token_hash=?').run(tokenHash)}
  async deleteForSubject(subjectType,subjectId,exceptTokenHash){if(exceptTokenHash)this.db.prepare('DELETE FROM auth_sessions WHERE subject_type=? AND subject_id=? AND token_hash<>?').run(subjectType,subjectId,exceptTokenHash);else this.db.prepare('DELETE FROM auth_sessions WHERE subject_type=? AND subject_id=?').run(subjectType,subjectId)}
}

class SqliteTripAccessRepository {
  constructor(db){this.db=db}
  async get(tripId){
    const row=this.db.prepare('SELECT access_mode FROM trip_access_settings WHERE trip_id=?').get(tripId)
    const allowedUserIds=this.db.prepare('SELECT user_id FROM trip_access_users WHERE trip_id=? ORDER BY user_id').all(tripId).map(item=>String(item.user_id))
    return {accessMode:row?String(row.access_mode):'OPEN',allowedUserIds}
  }
  async set(tripId,{accessMode,allowedUserIds=[]}){
    if(accessMode!=='OPEN'&&accessMode!=='RESTRICTED')throw new Error('Invalid Trip access mode')
    if(!this.db.prepare('SELECT 1 FROM trips WHERE id=?').get(tripId))throw new TripNotFoundError()
    this.db.exec('BEGIN IMMEDIATE')
    try{
      this.db.prepare(`INSERT INTO trip_access_settings(trip_id,access_mode) VALUES(?,?) ON CONFLICT(trip_id) DO UPDATE SET access_mode=excluded.access_mode`).run(tripId,accessMode)
      this.db.prepare('DELETE FROM trip_access_users WHERE trip_id=?').run(tripId)
      const insert=this.db.prepare('INSERT INTO trip_access_users(trip_id,user_id) VALUES(?,?)')
      for(const userId of [...new Set(allowedUserIds.map(String))])insert.run(tripId,userId)
      this.db.exec('COMMIT')
      return this.get(tripId)
    }catch(error){this.db.exec('ROLLBACK');throw error}
  }
  async canAccess(tripId,userId){
    const row=this.db.prepare('SELECT access_mode FROM trip_access_settings WHERE trip_id=?').get(tripId)
    if(!row||String(row.access_mode)==='OPEN')return true
    return !!this.db.prepare('SELECT 1 FROM trip_access_users WHERE trip_id=? AND user_id=?').get(tripId,userId)
  }
}

function userRow(row){return {id:String(row.id),username:String(row.username),passwordHash:String(row.password_hash),status:String(row.status),mustChangePassword:!!row.must_change_password,permissions:{canCreateTrips:row.can_create_trips===undefined?true:!!row.can_create_trips},createdAt:String(row.created_at),updatedAt:String(row.updated_at)}}



class SqliteAttachmentRepository {
  constructor(db,storageDir){this.db=db;this.storageDir=storageDir;mkdirSync(storageDir,{recursive:true})}
  async create({id,tripId,fileName,mimeType,bytes}){
    const storageName=`${id}.bin`,full=path.join(this.storageDir,storageName)
    writeFileSync(full,bytes)
    try{this.db.prepare('INSERT INTO trip_attachments(id,trip_id,file_name,mime_type,size_bytes,storage_name,created_at,committed) VALUES(?,?,?,?,?,?,?,0)').run(id,tripId,fileName,mimeType,bytes.length,storageName,new Date().toISOString())}
    catch(error){try{unlinkSync(full)}catch{};throw error}
    return {id,fileName,mimeType,sizeBytes:bytes.length}
  }
  async get(tripId,id){
    const row=this.db.prepare('SELECT id,file_name,mime_type,size_bytes,storage_name,created_at,committed FROM trip_attachments WHERE trip_id=? AND id=?').get(tripId,id)
    if(!row)return null
    const full=path.join(this.storageDir,String(row.storage_name));if(!existsSync(full))return null
    return {attachment:{id:String(row.id),fileName:String(row.file_name),mimeType:String(row.mime_type),sizeBytes:Number(row.size_bytes)},bytes:readFileSync(full)}
  }
  async list(tripId){return this.db.prepare('SELECT id,file_name,mime_type,size_bytes,storage_name,created_at,committed FROM trip_attachments WHERE trip_id=?').all(tripId).map(row=>({id:String(row.id),fileName:String(row.file_name),mimeType:String(row.mime_type),sizeBytes:Number(row.size_bytes),storageName:String(row.storage_name),createdAt:String(row.created_at),committed:!!row.committed}))}
  async reconcile(tripId,referencedIds,{uncommittedGraceMs=24*60*60*1000}={}){
    const keep=new Set(referencedIds)
    const mark=this.db.prepare('UPDATE trip_attachments SET committed=1 WHERE trip_id=? AND id=?')
    for(const id of keep)mark.run(tripId,id)
    const cutoff=Date.now()-Math.max(0,uncommittedGraceMs)
    for(const row of await this.list(tripId)){
      const staleDraft=!row.committed&&Date.parse(row.createdAt)<=cutoff
      const removedCommitted=row.committed&&!keep.has(row.id)
      if(!removedCommitted&&!staleDraft)continue
      try{unlinkSync(path.join(this.storageDir,row.storageName))}catch{}
      this.db.prepare('DELETE FROM trip_attachments WHERE trip_id=? AND id=?').run(tripId,row.id)
    }
  }
  async cleanupExpiredDrafts(graceMs=24*60*60*1000){
    const cutoff=new Date(Date.now()-Math.max(0,graceMs)).toISOString()
    const rows=this.db.prepare('SELECT trip_id,id,storage_name FROM trip_attachments WHERE committed=0 AND created_at<=?').all(cutoff)
    for(const row of rows){try{unlinkSync(path.join(this.storageDir,String(row.storage_name)))}catch{};this.db.prepare('DELETE FROM trip_attachments WHERE trip_id=? AND id=? AND committed=0').run(String(row.trip_id),String(row.id))}
    return rows.length
  }
  async deleteTripFiles(tripId){for(const row of await this.list(tripId))try{unlinkSync(path.join(this.storageDir,row.storageName))}catch{};this.db.prepare('DELETE FROM trip_attachments WHERE trip_id=?').run(tripId)}
}

class SqliteTelemetryRepository {
  constructor(db){this.db=db}
  async activeRun(){const row=this.db.prepare('SELECT id,label,started_at_epoch_ms,ended_at_epoch_ms,started_by FROM measurement_runs WHERE ended_at_epoch_ms IS NULL ORDER BY started_at_epoch_ms DESC LIMIT 1').get();return row?measurementRunRow(row):null}
  async startRun({id,label,startedAt,startedBy}){if(await this.activeRun())throw Object.assign(new Error('이미 진행 중인 Measurement Run이 있습니다.'),{statusCode:409,code:'MEASUREMENT_RUN_ACTIVE'});this.db.prepare('INSERT INTO measurement_runs(id,label,started_at_epoch_ms,ended_at_epoch_ms,started_by) VALUES(?,?,?,?,?)').run(id,label,startedAt,null,startedBy);return this.activeRun()}
  async stopRun(id,endedAt){const result=this.db.prepare('UPDATE measurement_runs SET ended_at_epoch_ms=? WHERE id=? AND ended_at_epoch_ms IS NULL').run(endedAt,id);if(Number(result.changes)!==1)return null;const row=this.db.prepare('SELECT id,label,started_at_epoch_ms,ended_at_epoch_ms,started_by FROM measurement_runs WHERE id=?').get(id);return row?measurementRunRow(row):null}
  async recentRuns(limit=10){return this.db.prepare('SELECT id,label,started_at_epoch_ms,ended_at_epoch_ms,started_by FROM measurement_runs ORDER BY started_at_epoch_ms DESC LIMIT ?').all(Math.max(1,Math.min(50,limit))).map(measurementRunRow)}
  async record({id,occurredAt,subjectType,subjectId,eventType,provider=null,tripId=null,outcome='ATTEMPT',runId=null}){this.db.prepare('INSERT INTO telemetry_events(id,occurred_at_epoch_ms,subject_type,subject_id,event_type,provider,trip_id,outcome,run_id) VALUES(?,?,?,?,?,?,?,?,?)').run(id,occurredAt,subjectType,subjectId,eventType,provider,tripId,outcome,runId)}
  async countsSince(sinceEpochMs,{runId=null}={}){
    const rows=runId?this.db.prepare('SELECT event_type,COUNT(*) AS count FROM telemetry_events WHERE run_id=? GROUP BY event_type ORDER BY event_type').all(runId):this.db.prepare('SELECT event_type,COUNT(*) AS count FROM telemetry_events WHERE occurred_at_epoch_ms>=? GROUP BY event_type ORDER BY event_type').all(sinceEpochMs)
    return Object.fromEntries(rows.map(row=>[String(row.event_type),Number(row.count)]))
  }
  async runCounts(runId){return this.countsSince(0,{runId})}
}
function measurementRunRow(row){return {id:String(row.id),label:String(row.label),startedAt:Number(row.started_at_epoch_ms),endedAt:row.ended_at_epoch_ms===null?null:Number(row.ended_at_epoch_ms),startedBy:String(row.started_by)}}
