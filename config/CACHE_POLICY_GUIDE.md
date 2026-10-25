# 캐시 설정 운영 가이드

유일한 캐시 정책 설정 파일: `config/provider-cache-policy.override.json` (환경변수 `PROVIDER_CACHE_POLICY_OVERRIDE`로 경로 변경 가능). 관리 페이지의 변경도 이 파일에 저장됩니다. 서버는 설정값의 형식 및 논리적 일관성만 검증하며 공급자 약관의 최대 캐싱 기간을 강제하지 않습니다. **운영자는 실제 계약, API 종류, 콘텐츠 종류 및 최신 약관을 확인해야 합니다.** 설정 자유화는 데이터 저장 권한을 부여하지 않습니다.

- `ttlHours`: `0` 사용하지 않음, 양수 시간 동안 활성 캐시, `-1` 무기한 활성
- `retentionHours`: 비활성/만료 캐시의 물리적 보존 기한; `0` 즉시 보존하지 않음, `-1` 무기한. 활성 TTL 이상으로 지정.
- `defaultSafetyMarginHours`: 양수 TTL에서 차감. TTL보다 작아야 함.
- `cleanupPollHours`: 만료 레코드 삭제 주기. 조회 시 만료 여부는 별도 검사됨.
- `allowCrossTripCacheReuse`: 서로 다른 여행 간 공유 캐시 조회를 허용. 테넌트 격리 및 제공자 이용 조건을 검토할 것.

참고: Google Places의 Place ID, 좌표, 명칭/주소/사진/리뷰에는 서로 다른 저장 규정이 적용될 수 있습니다. NAVER Local Search, Geocoding, Directions5도 각 서비스별 이용 조건을 확인하세요. 특히 장기/영구 보존 및 Trip 간 재사용은 운영자가 별도 검토해야 합니다.

**기술적 주의:** 이 버전에서 실제 공급자 응답의 캐시 연결은 필드별로 구현되어 있습니다. 설정만 활성화해도 아직 캐시 저장 코드가 없는 항목은 자동 캐싱되지 않습니다.
