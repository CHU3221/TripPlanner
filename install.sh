#!/usr/bin/env bash
# TripPlanner rootless Podman + Quadlet installer
# Tested against trip-planner-cache-operator.zip release layout (2026-10-25).
set -Eeuo pipefail
umask 077

BASE="${TP_BASE:-/home/container/pods}"
APP="$BASE/tripplanner"
ZIP="${TP_ZIP:-$BASE/trip-planner-cache-operator.zip}"
QDIR="$HOME/.config/containers/systemd"
WEB_PORT="${TP_PORT:-7603}"
SERVER_UNIT=tripplanner-server.service
WEB_UNIT=tripplanner-web.service
COMMAND="${1:-install}"
WORK=''

say() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
fail() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
cleanup() { if [[ -n "$WORK" && -d "$WORK" ]]; then rm -rf -- "$WORK"; fi; }
trap cleanup EXIT
trap 'printf "ERROR: line %s: %s\n" "$LINENO" "$BASH_COMMAND" >&2' ERR
need() { command -v "$1" >/dev/null 2>&1 || fail "명령어 '$1'이 없습니다. 설치 후 재실행하세요."; }
unit_exists() { [[ -f "$QDIR/${1%.service}.container" ]]; }

usage() {
  cat <<'EOF'
TripPlanner 설치 (rootless Podman + Quadlet)

사용법:
  bash install-tripplanner.sh install     처음 설치: ZIP 풀기, 이미지 빌드, Quadlet 등록 (시작하지 않음)
  bash install-tripplanner.sh activate    .env.local 수정 후 관리자 인증 구성 및 서비스 시작/재시작
  bash install-tripplanner.sh upgrade     재배포: 데이터/설정 보존, 이미지 재빌드, Quadlet 등록
  bash install-tripplanner.sh status      서비스/네트워크/HTTP 상태 확인

기본 경로:
  ZIP: /home/container/pods/trip-planner-cache-operator.zip
  소스/설정/DB: /home/container/pods/tripplanner
  HTTP: 127.0.0.1:7603

환경 변수로 변경 가능: TP_BASE, TP_ZIP, TP_PORT
주의: 설치 스크립트는 기존 DB·캐시·업로드 파일을 삭제하지 않습니다.
EOF
}

preflight() {
  [[ "$(id -u)" -ne 0 ]] || fail 'root로 실행하지 마세요. rootless Podman 계정에서 실행하세요.'
  [[ "$WEB_PORT" =~ ^[0-9]+$ ]] && ((10#$WEB_PORT >= 1 && 10#$WEB_PORT <= 65535)) || fail 'TP_PORT에 유효한 포트를 지정하세요.'
  for cmd in podman systemctl unzip rsync curl mktemp; do need "$cmd"; done
  systemctl --user show-environment >/dev/null 2>&1 || fail 'user systemd에 연결되지 않았습니다. SSH로 container 계정에 로그인한 뒤 실행하세요.'
}

write_deploy_files() {
  local root="$1"
  mkdir -p "$root/deploy"
  cat > "$root/.containerignore" <<'EOF'
.env
.env.*
!.env.example
!.env.local.example
.tripplanner/
.git/
node_modules/
dist/
*.zip
EOF
  cat > "$root/Containerfile.server" <<'EOF'
FROM docker.io/library/node:24-alpine
WORKDIR /app
COPY server/ ./server/
COPY config/ ./config/
RUN mkdir -p /data
ENV TRIPPLANNER_SERVER_HOST=0.0.0.0 \
    TRIPPLANNER_SERVER_PORT=8787 \
    TRIPPLANNER_DB_PATH=/data/tripplanner.sqlite
EXPOSE 8787
CMD ["node", "server/index.mjs"]
EOF
  cat > "$root/deploy/nginx.conf" <<'EOF'
server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;
    client_max_body_size 10m;

    location /api/ {
        proxy_pass http://tripplanner-server:8787;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $http_x_forwarded_proto;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
EOF
  cat > "$root/Containerfile.web" <<'EOF'
FROM docker.io/library/node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM docker.io/library/nginx:alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/ /usr/share/nginx/html/
RUN chmod -R a+rX /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
EOF
}

write_quadlets() {
  local server_image="$1" web_image="$2"
  mkdir -p "$QDIR"
  cat > "$QDIR/tripplanner.network" <<'EOF'
[Network]
NetworkName=tripplanner-net
EOF
  cat > "$QDIR/tripplanner-server.container" <<EOF
[Unit]
Description=TripPlanner Backend
After=network-online.target
Wants=network-online.target

[Container]
Image=$server_image
ContainerName=tripplanner-server
Network=tripplanner.network
Volume=$APP/.env.local:/app/.env.local:Z
Volume=$APP/.tripplanner:/data:Z
Volume=$APP/config:/app/config:Z
Environment=TRIPPLANNER_SERVER_HOST=0.0.0.0
Environment=TRIPPLANNER_SERVER_PORT=8787
Environment=TRIPPLANNER_DB_PATH=/data/tripplanner.sqlite

[Service]
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
EOF
  cat > "$QDIR/tripplanner-web.container" <<EOF
[Unit]
Description=TripPlanner Web
Requires=tripplanner-server.service
After=tripplanner-server.service

[Container]
Image=$web_image
ContainerName=tripplanner-web
Network=tripplanner.network
PublishPort=127.0.0.1:$WEB_PORT:80

[Service]
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
EOF
  chmod 600 "$QDIR/tripplanner.network" "$QDIR/tripplanner-server.container" "$QDIR/tripplanner-web.container"
  systemctl --user daemon-reload
}

install_release() {
  local mode="$1" src new tag server_image web_image
  preflight
  [[ -f "$ZIP" ]] || fail "ZIP을 찾을 수 없습니다: $ZIP"
  [[ -f "$APP/package.json" ]] && [[ "$mode" == install ]] && fail "기존 프로젝트가 있습니다: $APP (업데이트는 upgrade 명령 사용)"
  [[ ! -e "$APP" ]] && [[ "$mode" == upgrade ]] && fail '기존 프로젝트가 없습니다. install로 실행하세요.'
  if [[ "$mode" == install && -d "$APP" && -n "$(ls -A "$APP")" ]]; then
    fail "기존 프로젝트 경로에 파일이 있습니다: $APP (자동 삭제를 막기 위해 중단합니다. upgrade를 사용하세요.)"
  fi
  if [[ "$mode" == install ]] && (unit_exists tripplanner-server.service || unit_exists tripplanner-web.service); then
    fail '기존 Quadlet이 등록되어 있습니다. 현재 설치가 새 설치인지 확인하고 upgrade로 실행하세요.'
  fi
  mkdir -p "$BASE"
  WORK="$(mktemp -d "$BASE/.tripplanner-install.XXXXXXXX")"
  say '릴리즈 ZIP 검증 및 압축 해제'
  unzip -tq "$ZIP" >/dev/null || fail 'ZIP 파일 검증 실패'
  mkdir -p "$WORK/unpack"
  unzip -q "$ZIP" -d "$WORK/unpack"
  local -a candidates=()
  while IFS= read -r -d '' file; do candidates+=("${file%/package.json}"); done < <(find "$WORK/unpack" -mindepth 1 -maxdepth 3 -name package.json -type f -print0)
  [[ "${#candidates[@]}" -eq 1 ]] || fail "package.json이 있는 프로젝트 루트가 정확히 1개여야 합니다. 찾음: ${#candidates[@]}개"
  src="${candidates[0]}"
  for f in server/index.mjs server/configStore.mjs config/provider-cache-policy.override.json package-lock.json index.html .env.local.example; do
    [[ -f "$src/$f" ]] || fail "필수 소스 파일이 없습니다: $f"
  done
  new="$WORK/source"
  mkdir -p "$new"
  rsync -a "$src/" "$new/"
  write_deploy_files "$new"

  say '운영 프로젝트 파일 설치'
  mkdir -p "$APP"
  if [[ "$mode" == upgrade ]]; then
    # Excluded files/dirs survive --delete; do not overwrite operator changes or SQLite.
    rsync -a --delete \
      --exclude='/.env.local' \
      --exclude='/.tripplanner/' \
      --exclude='/.git/' \
      --exclude='/public/favicon.svg' \
      --exclude='/config/provider-cache-policy.override.json' \
      --exclude='/config/map-appearance.config.json' \
      "$new/" "$APP/"
  else
    rsync -a --delete "$new/" "$APP/"
  fi
  if [[ ! -f "$APP/.env.local" ]]; then
    cp "$APP/.env.local.example" "$APP/.env.local"
    say '.env.local 템플릿 생성 (API 키 입력은 설치 후 vi 사용)'
  fi
  chmod 600 "$APP/.env.local"
  mkdir -p "$APP/.tripplanner"
  chmod 700 "$APP/.tripplanner"
  [[ -f "$APP/config/provider-cache-policy.override.json" ]] || fail '캐시 정책 설정 파일이 없습니다.'

  tag="operator-$(date +%Y%m%d%H%M%S)"
  server_image="localhost/tripplanner-server:$tag"
  web_image="localhost/tripplanner-web:$tag"

  say "Backend 이미지 빌드: $server_image"
  podman build -f "$APP/Containerfile.server" -t "$server_image" "$APP"
  say "Web 이미지 빌드: $web_image"
  podman build -f "$APP/Containerfile.web" -t "$web_image" "$APP"

  say 'Quadlet 파일 생성 및 systemd 반영'
  write_quadlets "$server_image" "$web_image"
  cat <<EOF

설치/빌드/Quadlet 등록이 끝났습니다. 아직 새 서비스를 외부에 공개하지 않았습니다.

1) API 키와 지도 설정 입력:
   vi "$APP/.env.local"

2) 입력 후 서비스 활성화 (관리자 비밀번호가 없으면 안전하게 초기 생성):
   bash "$BASE/install-tripplanner.sh" activate

3) 운영 설정: 관리자 페이지에서 캐시 TTL/보존기간 설정
   설정 파일: $APP/config/provider-cache-policy.override.json

참고: Quadlet generated service는 'systemctl --user enable'을 실행하지 않습니다.
      [Install] WantedBy=default.target + Linger=yes 구성을 사용합니다.
EOF
  if [[ "$mode" == upgrade ]]; then
    printf '\n업데이트 주의: 기존 컨테이너가 실행 중이었다면 새 이미지를 적용하려면 activate를 실행하세요.\n'
  fi
}

has_key() {
  local key="$1"
  grep -Eq "^[[:space:]]*(export[[:space:]]+)?${key}[[:space:]]*=[[:space:]]*[^[:space:]#]+" "$APP/.env.local"
}

configure_admin_if_needed() {
  local id pass confirm img hash
  if has_key ADMIN_ID && has_key ADMIN_PASSWORD_HASH; then
    say '관리자 계정 해시 설정 확인: 기존 값 유지'
    return
  fi
  if has_key ADMIN_ID || has_key ADMIN_PASSWORD_HASH; then
    fail '.env.local에 ADMIN_ID와 ADMIN_PASSWORD_HASH가 한쪽만 있습니다. 둘 다 설정하거나 둘 다 지우세요.'
  fi
  [[ -t 0 ]] || fail '관리자 비밀번호 초기 생성에는 대화형 터미널이 필요합니다.'
  say '외부 공개 전 관리자 계정을 설정합니다. admin/admin 부트스트랩을 노출하지 않습니다.'
  read -r -p '관리자 ID [admin]: ' id
  id="${id:-admin}"
  [[ -n "$id" ]] || fail '관리자 ID가 비어 있습니다.'
  read -rs -p '새 관리자 비밀번호: ' pass; printf '\n'
  [[ -n "$pass" ]] || fail '비밀번호는 비어 있을 수 없습니다.'
  read -rs -p '새 관리자 비밀번호 확인: ' confirm; printf '\n'
  [[ "$pass" == "$confirm" ]] || fail '비밀번호가 일치하지 않습니다.'
  img="$(sed -n 's/^Image=//p' "$QDIR/tripplanner-server.container" | head -n 1)"
  [[ "$img" == localhost/tripplanner-server:* ]] || fail 'Backend 이미지 설정을 찾지 못했습니다.'
  # Password goes through STDIN (never a shell command argument or process environment).
  hash="$(printf '%s' "$pass" | podman run --rm -i --entrypoint node "$img" --input-type=module -e \
    'import fs from "node:fs"; import { hashPassword } from "./server/passwords.mjs"; console.log(await hashPassword(fs.readFileSync(0,"utf8")))')"
  unset pass confirm
  [[ "$hash" == scrypt\$* ]] || fail '관리자 비밀번호 해시 생성에 실패했습니다.'
  # Both keys absent: append. Store only hash, never plaintext password.
  printf '\nADMIN_ID=%s\nADMIN_PASSWORD_HASH=%s\n' "$id" "$hash" >> "$APP/.env.local"
  chmod 600 "$APP/.env.local"
  say '관리자 비밀번호 해시 저장 완료 (평문 저장 없음)'
}

activate() {
  preflight
  [[ -f "$APP/.env.local" ]] || fail '.env.local이 없습니다. install을 먼저 실행하세요.'
  [[ -f "$QDIR/tripplanner-server.container" && -f "$QDIR/tripplanner-web.container" ]] || fail 'Quadlet 파일이 없습니다. install 또는 upgrade를 먼저 실행하세요.'
  configure_admin_if_needed
  say 'Quadlet 서비스 시작/재시작'
  systemctl --user daemon-reload
  systemctl --user restart "$SERVER_UNIT"
  systemctl --user restart "$WEB_UNIT"
  say '로컬 HTTP/API 확인'
  if ! curl -fsS --retry 8 --retry-delay 1 --retry-connrefused "http://127.0.0.1:$WEB_PORT/api/health"; then
    printf '\n서비스 로그:\n' >&2
    journalctl --user -u "$SERVER_UNIT" -u "$WEB_UNIT" -n 40 --no-pager >&2 || true
    fail 'API health check에 실패했습니다.'
  fi
  printf '\n'
  curl -fsSI "http://127.0.0.1:$WEB_PORT/" | head -n 1
  say '서비스 실행 성공'
  printf '로컬: http://127.0.0.1:%s/\n' "$WEB_PORT"
  printf '외부: Cloudflare Tunnel이 기존에 이 포트를 가리킨다면 https://trip.chucode.com/\n'
  printf '관리자 캐시 설정은 웹 관리자 페이지에서 조정하세요.\n'
  printf '확인: systemctl --user status %s %s\n' "$SERVER_UNIT" "$WEB_UNIT"
}

status() {
  need systemctl; need podman; need curl
  systemctl --user --no-pager --full status "$SERVER_UNIT" "$WEB_UNIT" || true
  podman ps -a --filter name=tripplanner || true
  printf '\n[Web]\n'; curl -sSI --max-time 5 "http://127.0.0.1:$WEB_PORT/" | head -n 1 || true
  printf '[API]\n'; curl -sS --max-time 5 "http://127.0.0.1:$WEB_PORT/api/health" || true
  printf '\n'
  command -v loginctl >/dev/null 2>&1 && loginctl show-user "$(id -un)" -p Linger || true
}

case "$COMMAND" in
  install) install_release install ;;
  upgrade) install_release upgrade ;;
  activate|restart) activate ;;
  status) status ;;
  -h|--help|help) usage ;;
  *) usage; fail "알 수 없는 명령어: $COMMAND" ;;
esac
