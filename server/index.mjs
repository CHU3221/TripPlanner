import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { SqliteRepositories } from './repositories.mjs'
import { createTripPlannerServer } from './app.mjs'
import { ServerConfigStore } from './configStore.mjs'
import { AuthService } from './auth.mjs'
import { ProviderCacheService } from './providerCacheService.mjs'

const here=path.dirname(fileURLToPath(import.meta.url))
const root=path.resolve(here,'..')
const configStore=new ServerConfigStore(root)
const values=configStore.values
const defaultDb=path.resolve(here,'../.tripplanner/tripplanner.sqlite')
const dbPath=values.TRIPPLANNER_DB_PATH?.trim()||defaultDb
const host=values.TRIPPLANNER_SERVER_HOST?.trim()||'127.0.0.1'
const port=Number(values.TRIPPLANNER_SERVER_PORT||8787)
if(!Number.isInteger(port)||port<1||port>65535)throw new Error('TRIPPLANNER_SERVER_PORT must be 1..65535')
if(configStore.adminConfigInvalid)console.warn('WARNING: ADMIN_ID and ADMIN_PASSWORD_HASH must either both exist or both be absent. Admin login will fail until fixed.')
const repositories=new SqliteRepositories(dbPath)
const authService=new AuthService({users:repositories.users,sessions:repositories.sessions,configStore})
const providerCacheService=new ProviderCacheService({repository:repositories.providerCache,configStore})
providerCacheService.start()
void repositories.attachments.cleanupExpiredDrafts().catch(error=>console.warn('Attachment draft cleanup failed:',error))
const attachmentCleanupTimer=setInterval(()=>{void repositories.attachments.cleanupExpiredDrafts().catch(error=>console.warn('Attachment draft cleanup failed:',error))},60*60*1000)
attachmentCleanupTimer.unref?.()
const server=createTripPlannerServer({tripRepository:repositories.trips,userRepository:repositories.users,sessionRepository:repositories.sessions,accessRepository:repositories.access,providerCacheService,telemetryRepository:repositories.telemetry,attachmentRepository:repositories.attachments,databaseSchemaVersion:repositories.schemaVersion,authService,configStore})
server.listen(port,host,()=>console.log(`TripPlanner backend listening on http://${host}:${port}\nDB: ${dbPath}\nAdmin: ${configStore.admin.bootstrap?'bootstrap admin/admin (password setup required)':configStore.admin.id}`))
function shutdown(){providerCacheService.stop();clearInterval(attachmentCleanupTimer);server.close(()=>{repositories.close();process.exit(0)})}
process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown)
