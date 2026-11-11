#!/bin/sh
# Runtime bootstrap; the Node entrypoint shares normal Godkit installation.
set -eu
release=1.1.0
project=$PWD
godkit_home="$HOME/.godkit"
if [ "${GODKIT_HOME+x}" = x ]; then godkit_home=$GODKIT_HOME; fi
source_spec=
lock_file=
node_path=
project_only=
force_runtime=
rollback=
while [ "$#" -gt 0 ]; do
  case "$1" in
    --source|--project|--home|--runtime-lock|--node)
      [ "$#" -ge 2 ] || { echo "godkit installer: missing value for $1" >&2; exit 1; }
      case "$1" in
        --source) source_spec=$2;; --project) project=$2;; --home) godkit_home=$2;;
        --runtime-lock) lock_file=$2;; --node) node_path=$2;;
      esac
      shift 2;;
    --project-only) project_only=1; shift;;
    --force-runtime) force_runtime=1; shift;;
    --rollback) rollback=1; shift;;
    *) echo "godkit installer: unknown argument $1" >&2; exit 1;;
  esac
done
mkdir -p "$godkit_home"
godkit_home=$(cd "$godkit_home" && pwd -P)
scratch=$(mktemp -d "$godkit_home/.bootstrap.XXXXXX")
trap 'rm -rf "$scratch"' EXIT HUP INT TERM
download() {
  case "$1" in
    file://*) local_path=$(printf '%s' "$1" | sed 's|^file://||'); cp "$local_path" "$2";;
    https://*|http://127.0.0.1:*|http://localhost:*)
      if command -v curl >/dev/null 2>&1; then curl --fail --location --silent --show-error --connect-timeout 15 --max-time 180 "$1" -o "$2"
      elif command -v wget >/dev/null 2>&1; then wget -q --timeout=180 "$1" -O "$2"
      else echo 'godkit installer: curl or wget is required' >&2; exit 1; fi;;
    *) echo 'godkit installer: unsupported download URL' >&2; exit 1;;
  esac
}
script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
if [ -z "$lock_file" ]; then
  if [ -f "$script_dir/runtime-lock.json" ]; then lock_file=$script_dir/runtime-lock.json
  else lock_file=$scratch/runtime-lock.json; download "https://github.com/CodeForFee/godkit/releases/download/v$release/runtime-lock.json" "$lock_file"; fi
fi
lock_json=$(tr -d '\r\n' < "$lock_file")
json_string() { printf '%s' "$1" | sed -n 's/.*"'"$2"'"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p'; }
version=$(json_string "$lock_json" version)
base_url=$(json_string "$lock_json" baseUrl)
[ "$(json_string "$lock_json" godkitVersion)" = "$release" ] || { echo 'godkit installer: runtime lock release mismatch' >&2; exit 1; }
compatible() {
  [ -n "$1" ] && [ -x "$1" ] || return 1
  candidate_version=$("$1" --version 2>/dev/null) || return 1
  case "$candidate_version" in v22.*|v24.*|v26.*) return 0;; *) return 1;; esac
}
if [ -n "$node_path" ]; then
  compatible "$node_path" || { echo 'godkit installer: selected Node must be 22, 24 or 26' >&2; exit 1; }
elif [ -z "$force_runtime" ]; then
  candidate=$(command -v node 2>/dev/null || true)
  if compatible "$candidate"; then node_path=$candidate; fi
fi
if [ -z "$node_path" ]; then
  case "$(uname -s)" in Darwin) platform=darwin;; Linux) platform=linux;; *) echo 'godkit installer: use install.ps1 on Windows' >&2; exit 1;; esac
  case "$(uname -m)" in x86_64|amd64) arch=x64;; arm64|aarch64) arch=arm64;; *) echo 'godkit installer: unsupported CPU' >&2; exit 1;; esac
  case "$version" in 24.[0-9]*.[0-9]*) ;; *) echo 'godkit installer: lock must pin Node24' >&2; exit 1;; esac
  archive_json=$(printf '%s' "$lock_json" | sed -n 's/.*"'"$platform-$arch"'"[[:space:]]*:[[:space:]]*{\([^}]*\)}.*/\1/p')
  archive=$(json_string "$archive_json" file)
  checksum=$(json_string "$archive_json" sha256)
  case "$archive" in node-v24.*-"$platform-$arch".tar.gz) ;; *) echo 'godkit installer: runtime archive missing/invalid' >&2; exit 1;; esac
  [ "$(printf '%s' "$checksum" | wc -c | tr -d ' ')" = 64 ] && ! printf '%s' "$checksum" | grep '[^0-9a-f]' >/dev/null || { echo 'godkit installer: invalid checksum' >&2; exit 1; }
  runtime_dir=$godkit_home/runtime/$version-$platform-$arch
  node_path=$runtime_dir/bin/node
  if ! compatible "$node_path"; then
    download "$base_url/$archive" "$scratch/$archive"
    if command -v sha256sum >/dev/null 2>&1; then actual=$(sha256sum "$scratch/$archive" | cut -d ' ' -f 1)
    elif command -v shasum >/dev/null 2>&1; then actual=$(shasum -a 256 "$scratch/$archive" | cut -d ' ' -f 1)
    else echo 'godkit installer: SHA256 utility required' >&2; exit 1; fi
    [ "$actual" = "$checksum" ] || { echo 'godkit installer: runtime checksum mismatch; existing installation kept' >&2; exit 1; }
    tar -tzf "$scratch/$archive" | while IFS= read -r entry; do
      case "$entry" in /*|../*|*/../*|*/..) echo 'godkit installer: unsafe archive path' >&2; exit 1;; esac
    done
    mkdir "$scratch/runtime"
    tar -xzf "$scratch/$archive" -C "$scratch/runtime" --strip-components=1
    compatible "$scratch/runtime/bin/node" || { echo 'godkit installer: downloaded runtime check failed' >&2; exit 1; }
    mkdir -p "$godkit_home/runtime"
    [ ! -e "$runtime_dir" ] || { echo 'godkit installer: existing runtime damaged; remove it explicitly' >&2; exit 1; }
    mv "$scratch/runtime" "$runtime_dir"
  fi
fi
case "$node_path" in /*) ;; *) node_path=$(cd "$(dirname "$node_path")" && pwd -P)/$(basename "$node_path");; esac
if [ -n "$source_spec" ] && [ -d "$source_spec" ] && [ -f "$source_spec/bin/bootstrap.js" ]; then
  payload=$(CDPATH= cd -- "$source_spec" && pwd)
elif [ -f "$script_dir/../bin/bootstrap.js" ]; then payload=$(CDPATH= cd -- "$script_dir/.." && pwd)
else
  node_dir=$(dirname "$node_path")
  npm_cli=$node_dir/../lib/node_modules/npm/bin/npm-cli.js
  [ -f "$npm_cli" ] || npm_cli=$node_dir/node_modules/npm/bin/npm-cli.js
  [ -f "$npm_cli" ] || { echo 'godkit installer: selected runtime has no npm; use --force-runtime' >&2; exit 1; }
  payload_spec=@codeforfee/godkit@$release
  if [ -n "$source_spec" ] && [ -f "$source_spec" ]; then
    payload_spec=$(CDPATH= cd -- "$(dirname -- "$source_spec")" && pwd)/$(basename -- "$source_spec")
  fi
  "$node_path" "$npm_cli" install --prefix "$scratch/payload" --ignore-scripts --no-audit --no-fund --package-lock=false -- "$payload_spec"
  payload=$scratch/payload/node_modules/@codeforfee/godkit
fi
set -- "$payload/bin/bootstrap.js" --project "$project" --home "$godkit_home"
[ -z "$source_spec" ] || set -- "$@" --source "$source_spec"
[ -z "$project_only" ] || set -- "$@" --project-only
[ -z "$rollback" ] || set -- "$@" --rollback
"$node_path" "$@"
