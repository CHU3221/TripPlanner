# TripPlanner — 일정 재정렬 후 경로 캐시 복원 패치

## 원인

`src/connectionRuntime.ts`의 `savedRouteCacheRequests()`는 타임라인에서 **현재 인접한 연결만** 순회했습니다.

1. `1→2→3` 중 `1→2` 자동 경로를 조회·저장하면 해당 `ConnectionPlan`과 서버의 Mock Routes 캐시가 남습니다.
2. `1→3→2`로 저장 후 불러오면 `1→2` 연결은 현재 인접하지 않으므로, 기존 함수가 그 경로의 캐시 조회 요청을 생성하지 않습니다.
3. 이후 `1→2→3`으로 순서만 바꾸면 앱은 캐시를 자동 조회하지 않고 이미 복원된 `routeRuntime`만 사용하므로 `1→2`가 미계산으로 표시됩니다.
4. `1→2→3` 상태로 다시 저장 후 불러오면 그제야 `1→2`가 인접해져 SQLite 캐시에서 복원됩니다.

캐시 누락·삭제가 아니라 **복원 대상 선택 조건의 문제**였습니다.

## 변경 내용

- 현재 인접 여부와 무관하게 저장된 `ConnectionPlan`의 `ROUTE_API` 연결을 찾아 캐시 복원 요청을 만듭니다.
- 연결 양끝 Visit/Transport의 고유 ID, 좌표, 이동수단, 경유지, Provider, 선택 후보 ID를 검증합니다.
- 캐시를 찾아온 비활성 연결은 메모리에만 보관하고, 지도·타임라인에는 기존과 같이 **현재 인접한 연결만** 표시합니다.
- 새로고침이나 순서 변경으로 Google/Mock 경로 API를 **자동 호출하지 않습니다**. 서버의 Trip Provider 캐시 조회(GET)만 사용합니다.
- 캐시 TTL=0이면 복원하지 않는 기존 로직을 그대로 유지합니다. TTL=-1/양수의 서버 정책도 변경하지 않습니다.
- 새로 인접하게 된 `1→3`, `3→2`를 과거에 조회하지 않았다면 자동 경로가 없어 보이는 것은 정상입니다. 다른 두 장소의 `1→2` 캐시를 무단으로 전용하지 않습니다.

## 패치 적용

패치 ZIP에는 아래 4개 파일만 들어 있습니다.

- `src/connectionRuntime.ts`
- `tests/run-route-cache-reorder-tests.mjs`
- `package.json` (기존 `test:route-cache`에 회귀 테스트 연결)
- `ROUTE_CACHE_REORDER_FIX.md`

### 서버 소스 덮어쓰기

```bash
cd /home/container/pods/tripplanner
unzip -o /home/container/pods/TripPlanner-route-cache-reorder-patch.zip -d .
npm run test:route-cache
```

### Web 컨테이너만 재빌드 및 재생성

**주의:** 기존 Quadlet에서 사용하는 이미지 이름을 그대로 재빌드해야 합니다.

```bash
QDIR="$HOME/.config/containers/systemd"
WEB_IMAGE=$(sed -n 's/^Image=//p' "$QDIR/tripplanner-web.container" | head -1)
printf '현재 Web 이미지: %s\n' "$WEB_IMAGE"

cd /home/container/pods/tripplanner
podman build -f Containerfile.web -t "$WEB_IMAGE" .

# 빌드가 성공한 경우에만 실행
systemctl --user stop tripplanner-web.service
podman rm -f tripplanner-web 2>/dev/null || true
systemctl --user start tripplanner-web.service
curl -fsSI http://127.0.0.1:7603/
```

이 패치는 프론트엔드에서 캐시 복원 요청을 생성하는 코드만 수정하므로 Backend 이미지를 다시 빌드할 필요가 없습니다.
기존 Podman 네트워크, Quadlet 파일, DNS, Cloudflare Tunnel, Google Mock 서버/라우팅 설정, `.env.local`, SQLite 및 Provider 캐시 정책 파일을 변경하지 않습니다.

## 수동 재현

1. `GOOGLE.ROUTES.RESULT` TTL=-1인 상태에서 `1→2→3`으로 구성하고 `1→2` Mock 자동 경로를 선택·저장합니다.
2. `1→3→2`로 바꾸고 저장합니다.
3. 새로고침합니다. `1→2`는 현재 인접하지 않으므로 **지도에 표시되지 않아야 정상**입니다.
4. 다시 `1→2→3`으로 순서만 되돌립니다. **별도의 재조회 및 재저장 없이** `1→2`의 소요시간, 대중교통 단계와 지도 경로가 복원되어야 합니다.
5. `1→3`, `3→2`의 자동 경로는 별도의 저장된 RouteIntent/캐시가 없다면 여전히 미계산으로 남는 것이 정상입니다.
6. TTL=0으로 변경·저장하면 기존 규칙에 따라 서버 캐시 삭제 및 새로고침 복원 차단이 유지되어야 합니다.

커밋 메시지: `fix(routes): restore cached routes across timeline reordering`
