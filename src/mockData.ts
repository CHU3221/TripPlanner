import { collapsedRanges, t } from './model'
import type { MajorTransportData, TimelineLabel, VisitData } from './model'
import type { BucketItem, TripBase, TripPlace } from './domain/place'


export const initialPlaces: TripPlace[] = [
  { id: 'hongdae', name: '홍대', position: { lat: 37.5563, lng: 126.9236 } },
  { id: 'yongsan', name: '용산', position: { lat: 37.52995, lng: 126.96483 } },
  { id: 'ddp', name: 'DDP', position: { lat: 37.56744, lng: 127.00947 } },
  { id: 'busan-station', name: '부산역', position: { lat: 35.114495, lng: 129.03933 } },
  { id: 'busan-port', name: '부산항 국제여객터미널', position: { lat: 35.1177, lng: 129.0485 } },
  { id: 'tokyo-station', name: '도쿄역', position: { lat: 35.681236, lng: 139.767125 } },
  { id: 'tokyo-cruise-terminal', name: '도쿄 국제 크루즈 터미널', position: { lat: 35.6277, lng: 139.7788 } },
  { id: 'national-museum-of-korea', name: '국립중앙박물관', position: { lat: 37.52393, lng: 126.98037 } },
  { id: 'seongsu', name: '성수', position: { lat: 37.54457, lng: 127.0561 } },
  { id: 'tokyo-tower', name: '도쿄 타워', position: { lat: 35.6586, lng: 139.7454 } },
  { id: 'shibuya-crossing', name: '시부야 스크램블 교차로', position: { lat: 35.6595, lng: 139.7005 } },
  { id: 'seoul-station', name: '서울역', position: { lat: 37.5547, lng: 126.9706 } },
]

export const initialBucketItems: BucketItem[] = [
  { id: 'bucket-national-museum', placeId: 'national-museum-of-korea', title: '국립중앙박물관', meta: '서울 · 약 1시간', detail: '서울 · 약 1시간' },
  { id: 'bucket-seongsu', placeId: 'seongsu', title: '성수', meta: '서울', detail: '서울' },
  { id: 'bucket-tokyo-tower', placeId: 'tokyo-tower', title: '도쿄 타워', meta: '도쿄 · 약 1시간', detail: '도쿄 · 약 1시간' },
  { id: 'bucket-shibuya-crossing', placeId: 'shibuya-crossing', title: '시부야 스크램블 교차로', meta: '도쿄', detail: '도쿄' },
]

export const initialBases: TripBase[] = [
  { id: 'base-seoul-station', placeId: 'seoul-station', title: '서울역', meta: '거점 · 반복 배치 가능' },
]

export const initialVisits: VisitData[] = [
  { id: 'hongdae', placeId: 'hongdae', start: t.oct20(10), end: t.oct20(11), title: '홍대' },
  { id: 'yongsan', placeId: 'yongsan', start: t.oct20(12), end: t.oct20(14), title: '용산', detail: '아이파크몰 · 점심 · 쇼핑' },
  { id: 'ddp', placeId: 'ddp', start: t.oct20(15, 30), end: t.oct20(17), title: 'DDP', detail: '전시 관람' },
  { id: 'busan-station', placeId: 'busan-station', start: t.oct20(20, 8), end: t.oct20(20, 45), title: '부산역', detail: '도착 · 이동 준비' },
  { id: 'tokyo-station', placeId: 'tokyo-station', start: t.oct21(10), end: t.oct21(11, 30), title: '도쿄역', detail: '아침 · 주변 구경' },
]

export const initialLabels: TimelineLabel[] = [
  { id: 'label-seoul', at: t.oct20(10, 20), text: '서울' },
  { id: 'label-busan', at: t.oct20(20, 15), text: '부산' },
  { id: 'label-tokyo', at: t.oct21(9), text: '도쿄' },
]

export const transports: MajorTransportData[] = [
  {
    id: 'ktx', mode: 'TRAIN', serviceNumber: 'KTX 145', occupiedFrom: t.oct20(17, 30), occupiedUntil: t.oct20(20, 8),
    departure: { placeId: 'seoul-station', place: '서울역', departureAt: t.oct20(17, 30), detail: '승차 준비' },
    onboard: { title: 'KTX 145', route: '서울 → 부산', icon: 'train' },
    arrival: { placeId: 'busan-station', place: '부산역', arrivalAt: t.oct20(20, 8), detail: '도착' },
  },
  {
    id: 'camellia', mode: 'SHIP', occupiedFrom: t.oct20(22, 30), occupiedUntil: t.oct21(7, 30),
    departure: { placeId: 'busan-port', place: '부산항 국제여객터미널', departureAt: t.oct20(22, 30), detail: '승선수속 · 출국 · 승선' },
    onboard: { title: 'OVERNIGHT FERRY TEST', route: '부산 → 도쿄', icon: 'directions_boat' },
    arrival: { placeId: 'tokyo-cruise-terminal', place: '도쿄 국제 크루즈 터미널', arrivalAt: t.oct21(7, 30), detail: '하선 · 입국수속' },
    collapsedRange: collapsedRanges[0],
  },
]
