// src/map/provider/contract.ts

import type { GeoPoint, PlaceProviderId, TripPlaceProviderRef } from '../../domain/place'

/**
 * TripPlanner Map Provider Contract
 *
 * 목적
 * ----
 * TripPlanner의 Application / Domain 계층이 NAVER Maps, Google Maps 등의
 * provider-specific API 구조를 직접 알지 않도록 경계를 정의한다.
 *
 * 이 Contract는 provider가 제공하는 모든 기능을 추상화하지 않는다.
 * 현재 TripPlanner가 실제로 필요로 하는 기능만 포함한다.
 *
 * 현재 책임:
 * - 지도 렌더링
 * - marker / path primitive 렌더링
 * - 장소 자연어 검색
 * - 주소 → 좌표 검색
 * - 두 좌표 사이 route 후보 조회
 *
 * 현재 책임이 아닌 것:
 * - TripPlace 생성
 * - Bucket / Visit / Base / MajorTransport 생성
 * - selection / hover / popup의 도메인 의미 결정
 * - Schedule의 영업시간 자동 조회
 * - 리뷰 / 사진 / 전화번호 / 평점
 * - RouteCandidate의 영속화
 * - 서로 다른 provider 데이터의 교차 사용
 *
 * Provider 구현이 이 Contract를 만족할 수 없다면
 * 임의 우회 구현을 추가하지 말고 Contract 변경을 먼저 제안한다.
 */


// ============================================================
// Provider Identity
// ============================================================

export type MapProviderId = PlaceProviderId

/**
 * Provider 내부 장소를 다시 참조하기 위한 opaque reference.
 *
 * invariant:
 * - Application은 id의 내부 형식을 해석하지 않는다.
 * - 비교 / 저장 / 동일 provider에 다시 전달하는 용도로만 사용한다.
 * - NAVER Trip과 Google Trip 사이에서 이 reference를 교환하지 않는다.
 */
export type ProviderPlaceRef = TripPlaceProviderRef


// ============================================================
// Place Search
// ============================================================

/**
 * 외부 provider 검색 결과.
 *
 * 아직 TripPlace가 아니다.
 *
 * 흐름:
 *
 * Provider
 *   → PlaceCandidate[]
 *   → 사용자 선택
 *   → TripPlanner confirm
 *   → TripPlace 생성
 *
 * Provider 구현은 TripPlace identity를 생성하지 않는다.
 */
export type PlaceCandidate = {
  /** Candidate data always belongs to exactly one provider, even when no stable sourceRef exists. */
  provider: MapProviderId

  /**
   * 사용자가 보는 장소명.
   */
  name: string

  /**
   * 후보를 구분하기 위한 사람이 읽을 수 있는 주소.
   */
  address?: string

  /**
   * 지도 표시 및 TripPlace.position에 사용할 좌표.
   */
  position: GeoPoint

  /**
   * 동일 provider 내부에서 장소를 다시 참조할 필요가 있을 때 사용하는 값.
   *
   * 주소검색처럼 provider의 고유 장소 ID가 없는 결과에서는 생략 가능하다.
   */
  sourceRef?: ProviderPlaceRef
}


/**
 * 장소 검색 Contract.
 *
 * 책임:
 * - 자연어 장소검색
 * - 주소검색
 * - 결과를 PlaceCandidate 형태로 정규화
 *
 * 비책임:
 * - TripPlace 생성
 * - Schedule 생성
 * - 영업시간 자동조회
 * - 후보 자동 선택
 */
export type PlaceAutocompleteSuggestion = {
  /** Provider-local suggestion identity; opaque to the Application. */
  id: string
  /** Human-readable primary label supplied by Autocomplete. */
  name: string
  /** Optional secondary/address-like label shown before Place Details is requested. */
  secondaryText?: string
}

/**
 * One user autocomplete interaction. A session may issue several suggestion queries
 * and exactly one selection/details request. cancel() is local-only and must not
 * trigger Place Details.
 */
export interface PlaceAutocompleteSession {
  suggest(input: string): Promise<PlaceAutocompleteSuggestion[]>
  select(suggestion: PlaceAutocompleteSuggestion): Promise<PlaceCandidate>
  cancel(): void
}

export interface PlaceSearchProvider {
  /**
   * 자연어로 장소 후보를 검색한다.
   *
   * 예:
   * - "국립중앙박물관"
   * - "성수 카페"
   * - "하카타역"
   *
   * 후보 정렬 방식은 provider에 맡긴다.
   * TripPlanner는 결과 개수나 순위를 고정적으로 가정하지 않는다.
   */
  searchPlaces(query: string): Promise<PlaceCandidate[]>

  /**
   * 일반 장소 검색으로 찾기 어려운 경우의 fallback.
   *
   * 사용자가 입력한 주소 문자열을 좌표 후보로 변환한다.
   *
   * provider에 따라 하나 이상의 결과가 나올 수 있으므로 배열을 반환한다.
   */
  searchAddress(address: string): Promise<PlaceCandidate[]>

  /**
   * Optional provider-native autocomplete session. When present the UI should prefer
   * this over explicit Text Search for ordinary place picking.
   */
  createAutocompleteSession?(): Promise<PlaceAutocompleteSession>
}



// ============================================================
// Route Search
// ============================================================

export type RouteMode = 'WALK' | 'CAR' | 'TRANSIT'


export type RouteRequest = {
  origin: GeoPoint
  destination: GeoPoint
  /** Ordered intermediate coordinates; absent/empty means direct route. */
  waypoints?: readonly GeoPoint[]

  /**
   * Application은 ProviderCapabilities를 확인한 후
   * 지원되는 mode만 요청해야 한다.
   */
  mode: RouteMode
}


/**
 * Provider가 계산한 일시적인 route 결과.
 *
 * 이것은 ConnectionPlan 자체가 아니다.
 *
 * 기본 정책:
 * - TripPlanner Connection은 provider route 없이도 존재 가능
 * - 실제 route 조회 전에는 두 Place 사이의 단순 직선으로 표시 가능
 * - geometry / duration / distance는 기본적으로 transient
 *
 * Provider 약관과 별도 persistence 정책이 확정되지 않는 한
 * canonical Trip data로 저장하지 않는다.
 */
/**
 * Optional navigation steps provided by a route provider.
 * These values are provider-derived, request-local, and runtime-only.
 * They are NEVER part of ConnectionPlan, TripSnapshot, or History.
 * A missing field means the provider did not supply it: do not infer it.
 */
export type RouteTransitStep = {
  mode: 'WALK' | 'BUS' | 'SUBWAY' | 'TRAIN' | 'OTHER'
  /** A user-readable instruction, when supplied by the provider. */
  instruction?: string
  durationMinutes?: number
  distanceMeters?: number
  lineName?: string
  lineShortName?: string
  headsign?: string
  vehicleName?: string
  departureStop?: string
  arrivalStop?: string
  stopCount?: number
  /** Absolute ISO instant, rendered using the viewer's timezone. */
  departureAt?: string
  arrivalAt?: string
}

export type RouteCandidate = {
  /**
   * 현재 응답 안에서 후보를 구별하기 위한 transient identifier.
   *
   * 장기 identity로 사용하지 않는다.
   */
  id: string

  mode: RouteMode

  durationMinutes: number

  distanceMeters?: number

  /**
   * 사용자가 여러 후보를 구분할 때 사용할 짧은 설명.
   *
   * 예:
   * - "추천 경로"
   * - "통행료 최소"
   * - "환승 1회"
   */
  summary?: string

  /**
   * 실제 도로 / 철도 등을 따라 그릴 수 있는 geometry.
   *
   * provider가 제공하지 않으면 생략한다.
   * 이 경우 TripPlanner는 단순 Connection line을 사용할 수 있다.
   */
  geometry?: GeoPoint[]

  /** Optional, runtime-only multimodal directions; never persisted. */
  transitSteps?: readonly RouteTransitStep[]
}


export interface RouteProvider {
  /**
   * 두 좌표 사이의 route 후보를 조회한다.
   *
   * 중요한 invariant:
   * - 모든 Connection 생성 시 자동 호출하지 않는다.
   * - 사용자가 실제 경로 조회를 요청했을 때 호출하는 것을 기본으로 한다.
   * - 결과는 기본적으로 transient이다.
   */
  findRoutes(request: RouteRequest): Promise<RouteCandidate[]>
}


// ============================================================
// Provider Capabilities
// ============================================================

/**
 * Provider마다 실제 제공 가능한 기능이 다르므로
 * Application이 호출 전에 확인할 수 있도록 한다.
 *
 * capability=false인 기능에 대해
 * Provider가 가짜 fallback 결과를 만들어서는 안 된다.
 */
export type ProviderCapabilities = {
  placeSearch: boolean
  addressSearch: boolean

  routes: {
    walk: boolean
    car: boolean
    transit: boolean
  }
}


// ============================================================
// Map Rendering Primitives
// ============================================================

/**
 * Provider-neutral map color.
 *
 * Application이 결정한 기본 시각 색상이다.
 *
 * 권장 저장 형식:
 * - #RRGGBB
 * - 필요할 경우 #RRGGBBAA
 *
 * Provider implementation은 이 값을 자신의 Marker / Polyline 표현으로 변환한다.
 *
 * 중요한 invariant:
 * - 이 값은 NORMAL 상태의 base appearance이다.
 * - HOVERED / SELECTED / warning 등의 interaction emphasis는
 *   Application / Renderer 정책이 이 색보다 우선할 수 있다.
 * - Provider가 domain 의미를 보고 임의의 사용자 색을 결정하지 않는다.
 */
export type MapColor = string


export type MapMarkerState =
  | 'NORMAL'
  | 'HOVERED'
  | 'SELECTED'


/**
 * TripPlanner가 의미를 해석한 뒤 Renderer에 전달하는 순수 표시 데이터.
 *
 * 예:
 * badge=2가 "미배치 BucketItem 2개"라는 사실은
 * TripPlanner만 알고 Renderer는 알 필요가 없다.
 */
export type MapMarkerPrimitive = {
  id: string
  position: GeoPoint

  label?: string
  badge?: number
  /** Provider-neutral Material Symbol name for the primary visit category. */
  icon?: string

  /**
   * Application이 결정한 기본 marker 색상.
   *
   * 예:
   * - Visit별 사용자 지정 색
   * - MajorTransport endpoint 색
   *
   * 지정하지 않으면 renderer/provider의 기본 theme을 사용한다.
   */
  color?: MapColor

  /**
   * Provider-neutral marker footprint hint.
   * Application decides the semantic priority; renderer only maps this to SDK visuals.
   */
  size?: 'SMALL' | 'NORMAL'

  state?: MapMarkerState
}


export type MapPathState =
  | 'NORMAL'
  | 'HOVERED'
  | 'SELECTED'


/**
 * 지도 위에 표시할 선.
 *
 * 사용 예:
 * - 기본 Connection 직선
 * - 실제 Provider route geometry
 *
 * Provider는 이 선이 어떤 domain object에서 왔는지 해석하지 않는다.
 */
export type MapPathPrimitive = {
  id: string

  points: readonly GeoPoint[]

  stroke?: 'SOLID' | 'DASHED'
  direction?: 'NONE' | 'FORWARD'
  emphasis?: 'NORMAL' | 'STRONG'

  /**
   * Application이 결정한 기본 path 색상.
   *
   * CONNECTION / MAJOR_TRANSPORT 등의 domain 의미를
   * Renderer가 해석해서 색을 결정하면 안 된다.
   *
   * Application projection이 적절한 색을 선택해서 전달한다.
   */
  color?: MapColor

  /** Direction glyph color is independent from the connection/path stroke color. */
  directionColor?: MapColor

  /** Per-trip base stroke width in CSS pixels. */
  strokeWidthPx?: number

  state?: MapPathState
}


// ============================================================
// Map Interaction
// ============================================================

/**
 * Renderer는 marker id까지만 Application에 돌려준다.
 *
 * Renderer가:
 * - BucketItem을 찾거나
 * - Visit을 선택하거나
 * - Popup 내용을 결정해서는 안 된다.
 */
export type MapPoiSelection = {
  provider: PlaceProviderId
  sourceRef: ProviderPlaceRef
  position: GeoPoint
}

export type MapInteractionHandlers = {
  onMarkerHover?: (markerId: string | null) => void
  onMarkerClick?: (markerId: string) => void

  onPathHover?: (pathId: string | null) => void
  onPathClick?: (pathId: string) => void

  /** Fired only for a genuine map-background click, not marker/path overlays. */
  onMapClick?: () => void
  /** Provider basemap POI click. Reading this event must not trigger a Place Details request. */
  onPoiClick?: (poi: MapPoiSelection) => void
}


// ============================================================
// Map Renderer
// ============================================================

export interface MapRenderer {
  /**
   * 지도 SDK와 rendering surface를 준비한다.
   *
   * container lifecycle은 Application이 소유한다.
   */
  mount(
    container: HTMLElement,
    handlers?: MapInteractionHandlers,
  ): Promise<void>

  /**
   * provider SDK listener / map instance / marker 등을 정리한다.
   */
  unmount(): void

  /**
   * 현재 Application state가 요구하는 marker 전체 상태를 반영한다.
   *
   * 구현은 diff-update를 사용해도 되고 재구성해도 되지만,
   * 외부에서 관찰되는 결과는 전달된 marker 목록과 일치해야 한다.
   */
  setMarkers(markers: readonly MapMarkerPrimitive[]): void

  /**
   * Connection 또는 실제 route geometry를 지도에 반영한다.
   */
  setPaths(paths: readonly MapPathPrimitive[]): void

  /**
   * 사용자의 명시적인 "장소보기" 등의 요청에 사용한다.
   *
   * marker hover / selection만으로 자동 focus하면 안 된다.
   */
  /**
   * Provider-specific numeric zoom levels must not leak into Application code.
   * The renderer chooses an appropriate place-detail zoom for its own SDK and
   * must not zoom out from an already more-detailed user view.
   */
  focus(position: GeoPoint): void

  /** Fit one or more user-owned/cached positions without provider data lookup. */
  fit?(positions: readonly GeoPoint[]): void
}


// ============================================================
// Provider Aggregate
// ============================================================

/**
 * 한 Trip에서 사용하는 provider bundle.
 *
 * 현재 정책:
 * - /nav/<trip> → NAVER bundle
 * - /goo/<trip> → GOOGLE bundle
 *
 * 한 Trip 안에서 서로 다른 provider implementation을
 * 섞어 사용하는 기능은 현재 지원하지 않는다.
 */
export interface MapProvider {
  readonly id: MapProviderId
  readonly capabilities: ProviderCapabilities

  readonly renderer: MapRenderer

  readonly places?: PlaceSearchProvider
  readonly routes?: RouteProvider
}


// ============================================================
// Error Semantics
// ============================================================

export type MapProviderErrorCode =
  | 'INVALID_REQUEST'
  | 'NOT_SUPPORTED'
  | 'AUTH_ERROR'
  | 'RATE_LIMITED'
  | 'NETWORK_ERROR'
  | 'PROVIDER_UNAVAILABLE'
  | 'UNKNOWN'


/**
 * Provider-specific exception/message를 Application 계층에 직접 노출하지 않는다.
 *
 * original error는 debugging 목적으로만 보관할 수 있다.
 */
export class MapProviderError extends Error {
  readonly code: MapProviderErrorCode
  readonly cause?: unknown

  constructor(
    code: MapProviderErrorCode,
    message: string,
    cause?: unknown,
  ) {
    super(message)
    this.name = 'MapProviderError'
    this.code = code
    this.cause = cause
  }
}

