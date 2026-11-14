#!/bin/sh
set -eu

PROJECT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$PROJECT_DIR"

IMAGE_REF="${IMAGE_REF:-ghcr.io/nodisease/townsquare:main}"
export IMAGE_REF

if docker compose version >/dev/null 2>&1; then
  compose() { docker compose -f docker-compose.yml "$@"; }
elif command -v docker-compose >/dev/null 2>&1; then
  compose() { docker-compose -f docker-compose.yml "$@"; }
else
  echo "Docker Compose is not installed" >&2
  exit 2
fi

# Preserve the currently running image ID before the mutable :main tag moves.
previous_id="$(docker inspect --format '{{.Image}}' townsquare 2>/dev/null || true)"
if [ -n "$previous_id" ]; then
  docker tag "$previous_id" townsquare:previous
fi

 echo "Checking $IMAGE_REF"
compose pull townsquare
new_id="$(docker image inspect --format '{{.Id}}' "$IMAGE_REF")"

if [ -n "$previous_id" ] && [ "$new_id" = "$previous_id" ]; then
  echo "Already running the current image"
  exit 0
fi

compose up -d --remove-orphans

attempt=0
healthy=false
while [ "$attempt" -lt 30 ]; do
  container_id="$(compose ps -q townsquare)"
  if [ -n "$container_id" ]; then
    state="$(docker inspect \
      --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' \
      "$container_id" 2>/dev/null || true)"
    echo "Container state: ${state:-unknown}"
    if [ "$state" = "healthy" ]; then
      healthy=true
      break
    fi
    case "$state" in
      unhealthy|exited|dead) break ;;
    esac
  fi
  attempt=$((attempt + 1))
  sleep 2
done

if [ "$healthy" = "true" ]; then
  echo "Deployment succeeded: $IMAGE_REF"
  exit 0
fi

compose logs --tail=100 townsquare >&2 || true
if [ -n "$previous_id" ] && docker image inspect townsquare:previous >/dev/null 2>&1; then
  echo "Health check failed; rolling back to previous image" >&2
  IMAGE_REF=townsquare:previous compose up -d --remove-orphans
else
  echo "Health check failed and no previous image is available to roll back to" >&2
fi
exit 1

