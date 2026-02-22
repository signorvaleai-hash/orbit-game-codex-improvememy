#!/usr/bin/env bash
set -euo pipefail

if [ -d "/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home" ]; then
  export JAVA_HOME="/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home"
elif command -v /usr/libexec/java_home >/dev/null 2>&1; then
  JAVA_HOME_21="$(/usr/libexec/java_home -v 21 2>/dev/null || true)"
  if [ -n "$JAVA_HOME_21" ]; then
    export JAVA_HOME="$JAVA_HOME_21"
  fi
fi

if [ -z "${JAVA_HOME:-}" ]; then
  echo "JDK 21 not found. Install openjdk@21 or register a JDK 21 in /Library/Java/JavaVirtualMachines." >&2
  exit 1
fi

export PATH="$JAVA_HOME/bin:$PATH"

echo "Using JAVA_HOME=$JAVA_HOME"
cd android
./gradlew clean bundleRelease
