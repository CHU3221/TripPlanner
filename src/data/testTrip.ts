import type { Trip } from '../domain/trip'

export const testTrip: Trip = {
  id: 'korea-tokyo-test',
  name: '포항 · 부산 · 도쿄',
  mapProvider: 'GOOGLE',

  places: [
    {
      id: 'pohang-terminal',
      name: '포항 시외버스터미널',
    },
    {
      id: 'busan-terminal',
      name: '부산 종합버스터미널',
    },
    {
      id: 'seomyeon',
      name: '서면',
    },
    {
      id: 'busan-port',
      name: '부산항 국제여객터미널',
    },
    {
      id: 'tokyo-cruise-terminal',
      name: '도쿄 국제 크루즈 터미널',
    },
    {
      id: 'tokyo-station',
      name: '도쿄역',
    },
  ],

  regions: [
    {
      id: 'pohang',
      name: 'POHANG',
      placeIds: ['pohang-terminal'],
    },
    {
      id: 'busan',
      name: 'BUSAN',
      placeIds: [
        'busan-terminal',
        'seomyeon',
        'busan-port',
      ],
    },
    {
      id: 'tokyo',
      name: 'TOKYO',
      placeIds: [
        'tokyo-cruise-terminal',
        'tokyo-station',
      ],
    },
  ],

  visits: [
    {
      id: 'visit-pohang-terminal',
      placeId: 'pohang-terminal',
      regionId: 'pohang',
      startAt: '2026-10-20T08:30:00+09:00',
    },
    {
      id: 'visit-busan-terminal',
      placeId: 'busan-terminal',
      regionId: 'busan',
    },
    {
      id: 'visit-seomyeon',
      placeId: 'seomyeon',
      regionId: 'busan',
      stayMinutes: 90,
    },
    {
      id: 'visit-busan-port',
      placeId: 'busan-port',
      regionId: 'busan',
    },
    {
      id: 'visit-tokyo-cruise-terminal',
      placeId: 'tokyo-cruise-terminal',
      regionId: 'tokyo',
    },
    {
      id: 'visit-tokyo-station',
      placeId: 'tokyo-station',
      regionId: 'tokyo',
    },
  ],

  transports: [
    {
      id: 'pohang-busan-bus',
      mode: 'BUS',

      fromPlaceId: 'pohang-terminal',
      toPlaceId: 'busan-terminal',

      serviceName: '시외버스',

      recommendedArrivalAt: '2026-10-20T08:40:00+09:00',
      departureAt: '2026-10-20T09:00:00+09:00',
      arrivalAt: '2026-10-20T10:40:00+09:00',
    },

    {
      id: 'overnight-ferry-test',
      mode: 'FERRY',

      fromPlaceId: 'busan-port',
      toPlaceId: 'tokyo-cruise-terminal',

      serviceName: 'OVERNIGHT FERRY TEST',

      recommendedArrivalAt: '2026-10-20T19:00:00+09:00',
      boardingAt: '2026-10-20T19:40:00+09:00',

      // 테스트용 시각
      departureAt: '2026-10-20T22:30:00+09:00',

      arrivalAt: '2026-10-21T07:30:00+09:00',
      availableAt: '2026-10-21T08:30:00+09:00',
    },
  ],
}