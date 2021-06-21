#!/bin/sh

version="$1"
./build.sh $version
docker tag proximaone/proxima-db:$version us-west4-docker.pkg.dev/wired-framework-311403/proximaone/proxima-db:$version
docker push us-west4-docker.pkg.dev/wired-framework-311403/proximaone/proxima-db:$version
