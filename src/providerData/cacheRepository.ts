import type { PlaceProviderId } from '../domain/place'
import { LEGAL_PROVIDER_CACHE_CATALOG } from './legalPolicyCatalog'
import {
  cleanupPollIntervalMs,
  evaluateProviderCacheRecord,
  providerCacheLookupScope,
  type ProviderCachePolicyConfig,
  type ProviderCacheRecord,
} from './cachePolicy'

export type ProviderCacheLookupKey = {
  provider: PlaceProviderId
  policyKey: string
  subjectKey: string
}

/**
 * Backend persistence boundary for a physically shared cache plus logical Trip references.
 * Implement with SQLite/PostgreSQL/etc. later.
 */
export interface ProviderCacheRepository {
  listAll(): Promise<readonly ProviderCacheRecord<unknown>[]>
  deleteByCacheIds(cacheIds: readonly string[]): Promise<void>

  /** Only returns entries already referenced/allowed by this Trip. */
  findForTrip(tripId: string, key: ProviderCacheLookupKey): Promise<ProviderCacheRecord<unknown> | undefined>
  /** Searches the physically shared provider cache without a Trip filter. */
  findGlobal(key: ProviderCacheLookupKey): Promise<ProviderCacheRecord<unknown> | undefined>
  /** Adds logical permission/reference after a global hit is lawfully reused by this Trip. */
  linkTripToCache(tripId: string, cacheId: string): Promise<void>
}

/**
 * Lookup helper enforcing the configured scope.
 *
 * Default/current release behavior is TRIP because all current legal catalog crossTripReuse values
 * are FORBIDDEN or UNVERIFIED. Setting allowCrossTripCacheReuse=true alone cannot bypass that ceiling.
 */
export async function findUsableProviderCacheForTrip(
  repository: ProviderCacheRepository,
  tripId: string,
  key: ProviderCacheLookupKey,
  config: ProviderCachePolicyConfig,
  serverNowEpochMs: number,
): Promise<ProviderCacheRecord<unknown> | undefined> {
  const preflight = config.policies[key.policyKey]
  const legal = LEGAL_PROVIDER_CACHE_CATALOG[key.policyKey as keyof typeof LEGAL_PROVIDER_CACHE_CATALOG]
  // Never even ask a repository for prohibited content (NAVER defaults to 0).
  if (!preflight || !legal || preflight.provider !== key.provider || legal.provider !== key.provider) return undefined
  if (preflight.ttlHours === 0 || legal.maxTtlHours === 0) return undefined
  if (legal.maxTtlHours > 0 && (preflight.ttlHours === -1 || preflight.ttlHours > legal.maxTtlHours)) return undefined
  const scope = providerCacheLookupScope(key.policyKey, config)
  const record =
    scope === 'GLOBAL'
      ? await repository.findGlobal(key)
      : await repository.findForTrip(tripId, key)

  if (!record) return undefined
  const evaluation = evaluateProviderCacheRecord(record, config, serverNowEpochMs)
  if (!evaluation.cacheable || !evaluation.fresh) return undefined

  if (scope === 'GLOBAL') await repository.linkTripToCache(tripId, record.cacheId)
  return record
}

export async function purgeExpiredProviderCache(
  repository: ProviderCacheRepository,
  config: ProviderCachePolicyConfig,
  serverNowEpochMs: number,
): Promise<string[]> {
  const records = await repository.listAll()
  const deleteIds = records
    .filter(record => {
      const result = evaluateProviderCacheRecord(record, config, serverNowEpochMs)
      return !result.retained
    })
    .map(record => record.cacheId)

  if (deleteIds.length) await repository.deleteByCacheIds(deleteIds)
  return deleteIds
}

/**
 * Cleanup scheduler for a future server process.
 *
 * IMPORTANT: this poller is only garbage collection. Every cache read must validate freshness with
 * authoritative server time. Poll cadence never extends the legal/effective TTL.
 */
export class ProviderCacheExpiryPoller {
  private timer: ReturnType<typeof setInterval> | null = null

  constructor(
    private readonly repository: ProviderCacheRepository,
    private readonly getConfig: () => ProviderCachePolicyConfig,
    private readonly serverNow: () => number = Date.now,
  ) {}

  async runOnce(): Promise<string[]> {
    const config = this.getConfig()
    return purgeExpiredProviderCache(this.repository, config, this.serverNow())
  }

  start(): void {
    this.stop()
    void this.runOnce()
    const config = this.getConfig()
    this.timer = setInterval(() => {
      void this.runOnce()
    }, cleanupPollIntervalMs(config))
  }

  stop(): void {
    if (this.timer !== null) clearInterval(this.timer)
    this.timer = null
  }
}

/** Write capability is separate so read-only repositories cannot accidentally persist data. */
export interface ProviderCacheWriteRepository extends ProviderCacheRepository {
  /** Atomic upsert + Trip link; caller/backend owns physical uniqueness and authorization. */
  saveForTrip(tripId: string, record: ProviderCacheRecord<unknown>): Promise<void>
}

/**
 * Only call for a newly fetched provider response, never a cache hit.
 * The supplied time MUST come from the backend's authoritative clock. No provider response
 * can be saved if its policy is missing, forbidden, mismatched, or disabled by operator.
 */
export async function saveProviderResponseIfAllowed(
  repository: ProviderCacheWriteRepository,
  tripId: string,
  key: ProviderCacheLookupKey,
  cacheId: string,
  responseValue: unknown,
  config: ProviderCachePolicyConfig,
  serverFetchedAtEpochMs: number,
): Promise<boolean> {
  const policy = config.policies[key.policyKey]
  const legal = LEGAL_PROVIDER_CACHE_CATALOG[key.policyKey as keyof typeof LEGAL_PROVIDER_CACHE_CATALOG]
  if (!policy || !legal || policy.provider !== key.provider || legal.provider !== key.provider) return false
  if (policy.ttlHours === 0 || legal.maxTtlHours === 0) return false
  if (legal.maxTtlHours > 0 && (policy.ttlHours === -1 || policy.ttlHours > legal.maxTtlHours)) return false
  if (!tripId || !cacheId || !key.subjectKey || !Number.isFinite(serverFetchedAtEpochMs) || serverFetchedAtEpochMs < 0) return false
  const record: ProviderCacheRecord<unknown> = {
    cacheId,
    provider: key.provider,
    policyKey: key.policyKey,
    subjectKey: key.subjectKey,
    fetchedAtEpochMs: serverFetchedAtEpochMs,
    value: responseValue,
  }
  const evaluation = evaluateProviderCacheRecord(record, config, serverFetchedAtEpochMs)
  if (!evaluation.cacheable || !evaluation.fresh) return false
  await repository.saveForTrip(tripId, record)
  return true
}
