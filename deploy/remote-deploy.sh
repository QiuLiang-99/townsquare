#!/bin/sh
set -eu

TAG="${1:-}"
IMAGE_NAME="${DEPLOY_IMAGE_NAME:-townsquare}"
ARCHIVE="${DEPLOY_ARCHIVE:-townsquare-image.tar.gz}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"

if [ -z "$TAG" ]; then
  echo "usage: $0 <image-tag>" >&2
  exit 2
fi

cd "$(dirname "$0")"

if [ ! -f "$ARCHIVE" ]; then
  echo "image archive not found: $ARCHIVE" >&2
  exit 2
fi

if docker compose version >/dev/null 2>&1; then
  compose() {
    docker compose -f "$COMPOSE_FILE" "$@"
  }
elif command -v docker-compose >/dev/null 2>&1; then
  compose() {
    docker-compose -f "$COMPOSE_FILE" "$@"
  }
else
  echo "Docker Compose is not installed" >&2
  exit 2
fi

previous_image="$(docker inspect --format '{{.Config.Image}}' townsquare 2>/dev/null || true)"
if [ -n "$previous_image" ] \
  && [ "$previous_image" != "$IMAGE_NAME:previous" ] \
  && docker image inspect "$previous_image" >/dev/null 2>&1; then
  docker tag "$previous_image" "$IMAGE_NAME:previous"
  echo "saved rollback image: $previous_image -> $IMAGE_NAME:previous"
fi

echo "loading $IMAGE_NAME:$TAG"
docker load < "$ARCHIVE"
docker tag "$IMAGE_NAME:$TAG" "$IMAGE_NAME:latest"

export TOWNSQUARE_IMAGE="$IMAGE_NAME:$TAG"
compose up -d --remove-orphans

attempt=0
healthy=false
while [ "$attempt" -lt 30 ]; do
  container_id="$(compose ps -q townsquare)"
  if [ -n "$container_id" ]; then
    state="$(docker inspect \
      --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' \
      "$container_id" 2>/dev/null || true)"
    echo "container state: ${state:-unknown}"
    if [ "$state" = "healthy" ]; then
      healthy=true
      break
    fi
    case "$state" in
      unhealthy|exited|dead)
        break
        ;;
    esac
  fi
  attempt=$((attempt + 1))
  sleep 2
done

if [ "$healthy" = "true" ]; then
  echo "deployment succeeded: $IMAGE_NAME:$TAG"
  exit 0
fi

echo "health check failed; collecting logs" >&2
compose logs --tail=100 townsquare >&2 || true

if [ -n "$previous_image" ] \
  && docker image inspect "$previous_image" >/dev/null 2>&1; then
  echo "rolling back to $previous_image" >&2
  export TOWNSQUARE_IMAGE="$previous_image"
  compose up -d --remove-orphans
fi

exit 1
