#!/usr/bin/env bash
# Sync the Fly.io production SQLite DB down to the local ./migrated.db.
#
#   bash scripts/sync-prod-db.sh
#
# Takes a consistent snapshot on the machine (VACUUM INTO, so WAL state is
# folded in and a live server can keep writing), gzips it, pulls it over the
# Fly SSH tunnel, and swaps it in locally after an integrity check.
# The previous local DB is kept as ./migrated.db.bak.<timestamp>.
set -euo pipefail

APP="${FLY_APP:-piece-v2}"
REMOTE_DB="${REMOTE_DB:-/data/piece.db}"
LOCAL_DB="${LOCAL_DB:-migrated.db}"

# /data has little headroom; stage the snapshot on the root fs instead.
REMOTE_SNAP="/tmp/prod-sync.db"
REMOTE_GZ="$REMOTE_SNAP.gz"

cd "$(dirname "$0")/.."
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
# bun.exe / flyctl.exe don't understand Git Bash's /tmp/... paths.
STAGE_NATIVE="$STAGE"
if command -v cygpath >/dev/null 2>&1; then STAGE_NATIVE="$(cygpath -m "$STAGE")"; fi

# flyctl on Windows always exits 1 ("The handle is invalid.") when tearing the
# SSH tunnel down, so its exit code is useless — check for a sentinel instead.
# The script is piped in base64-encoded to keep it clear of -C quoting.
remote() {
  local b64 out
  b64=$(printf '%s\necho __RC_OK__\n' "$1" | base64 -w0)
  out=$(flyctl ssh console -a "$APP" \
        -C "sh -c 'echo $b64 | base64 -d | sh -e'" </dev/null 2>&1) || true
  echo "$out" | grep -v -e '^__RC_OK__$' -e '^Connecting to ' -e '^Error: The handle is invalid.$' || true
  case "$out" in
    *__RC_OK__*) return 0 ;;
    *) echo "remote command failed:" >&2; echo "$1" >&2; return 1 ;;
  esac
}

echo "==> Snapshotting $REMOTE_DB on $APP"
remote "rm -f $REMOTE_SNAP $REMOTE_GZ
bun -e \"const{Database}=require('bun:sqlite');const d=new Database('$REMOTE_DB');d.exec(\\\"VACUUM INTO '$REMOTE_SNAP'\\\");d.close()\"
gzip -1 $REMOTE_SNAP
ls -lh $REMOTE_GZ"

echo "==> Downloading"
flyctl ssh sftp get "$REMOTE_GZ" "$STAGE_NATIVE/prod.db.gz" -a "$APP" </dev/null || true
[ -s "$STAGE/prod.db.gz" ] || { echo "download failed" >&2; exit 1; }

echo "==> Cleaning up remote"
remote "rm -f $REMOTE_GZ"

echo "==> Decompressing"
gunzip -f "$STAGE/prod.db.gz"

echo "==> Verifying"
CHECK=$(bun -e "const{Database}=require('bun:sqlite');const d=new Database(process.argv[1],{readonly:true});console.log(d.query('PRAGMA integrity_check').get().integrity_check)" "$STAGE_NATIVE/prod.db")
if [ "$CHECK" != "ok" ]; then
  echo "integrity_check failed: $CHECK" >&2
  exit 1
fi

if [ -f "$LOCAL_DB" ]; then
  BAK="$LOCAL_DB.bak.$(date +%Y%m%d_%H%M%S)"
  echo "==> Backing up existing $LOCAL_DB -> $BAK"
  mv "$LOCAL_DB" "$BAK"
fi
# Stale WAL/SHM from the old DB would corrupt the view of the new file.
rm -f "$LOCAL_DB-wal" "$LOCAL_DB-shm"
mv "$STAGE/prod.db" "$LOCAL_DB"

echo "==> Done: $LOCAL_DB"
bun -e "const{Database}=require('bun:sqlite');const d=new Database(process.argv[1],{readonly:true});for(const t of ['users','worlds','pieces','prompts'])try{console.log(' ',t,d.query('select count(*) c from '+t).get().c)}catch(e){}" "$LOCAL_DB"
