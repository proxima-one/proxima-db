#!/bin/sh

export DOCKER_BUILDKIT=1
export VERSION=${1:-dev}
docker-compose build
