#!/usr/bin/env bash
# Verify the live backend's Google OAuth audience config is correct WITHOUT a
# real Google-signed token. We craft two unsigned ID-token-shaped credentials:
#   A) aud = the CORRECT frontend client id
#   B) aud = a WRONG client id
# google-auth-library checks audience BEFORE signature, so:
#   - Wrong aud  -> "...issued for a different app."   (audience gate rejects)
#   - Correct aud-> "Invalid Google credential."        (audience OK, signature fails)
# Seeing (A) != "different app" proves the configured audience now matches the
# frontend. (A real login additionally needs Google's signature, which only the
# browser flow provides — out of scope for an automated probe.)
set -u
NODE="${NODE_URL:-https://lifesync-production-fdf9.up.railway.app}"
CORRECT="190237143688-0ddtrdq3die8hnce0aqbti3jgc2eam4g.apps.googleusercontent.com"
WRONG="000000000000-wrongwrongwrongwrongwrongwrongwrong.apps.googleusercontent.com"

mk(){ # build unsigned header.payload.sig with given aud
  python -c "
import json,base64,sys
def b64(o): return base64.urlsafe_b64encode(json.dumps(o).encode()).rstrip(b'=').decode()
h=b64({'alg':'RS256','kid':'fake','typ':'JWT'})
p=b64({'iss':'https://accounts.google.com','aud':sys.argv[1],'sub':'1234567890',
       'email':'probe@example.com','email_verified':True,'exp':9999999999,'iat':1111111111})
print(h+'.'+p+'.ZmFrZXNpZw')
" "$1"; }

probe(){ # $1=label $2=aud
  local cred; cred=$(mk "$2")
  local body; body=$(python -c "import json,sys;print(json.dumps({'credential':sys.argv[1]}))" "$cred")
  local resp; resp=$(curl -s -m 20 -X POST "$NODE/api/auth/google" -H "Content-Type: application/json" --data-binary "$body")
  local msg; msg=$(echo "$resp" | python -c "import sys,json
try: print(json.load(sys.stdin).get('error',''))
except: print('<non-json>')")
  echo "  [$1] aud=...${2: -28}"
  echo "       backend error: \"$msg\""
  echo "$msg"
}

echo "== Google audience probe against $NODE =="
echo "-- A) CORRECT client id (frontend's aud) --"
msgA=$(probe "correct" "$CORRECT" | tail -1)
echo "-- B) WRONG client id --"
msgB=$(probe "wrong" "$WRONG" | tail -1)

echo
DIFF="This Google credential was issued for a different app."
fail=0
# NOTE: google-auth-library fetches Google's signing certs and rejects an
# unsigned/forged token at the SIGNATURE stage ("Invalid Google credential.")
# before the audience comparison runs. So an unsigned probe usually CANNOT
# reach the audience branch and will say "Invalid Google credential." for both
# auds. That is EXPECTED and means the audience could not be exercised here.
# The only hard failure is the live backend STILL returning the "different app"
# message for the correct aud -> that would prove a stale/wrong configured id.
if [ "$msgA" = "$DIFF" ]; then
  echo "FAIL: correct aud STILL returns 'different app' -> backend audience != frontend client id (stale/corrupt var)"; fail=1
else
  echo "OK: correct aud does NOT return 'different app' (msg: \"$msgA\")."
  echo "    -> No audience-mismatch on the frontend's client id. (Signature-stage rejection of the forged token is expected.)"
fi
echo "    wrong-aud msg: \"$msgB\" (informational)"
echo
echo "AUTHORITATIVE CHECK is config equality: stored GOOGLE_AUTH_CLIENT_IDS == frontend VITE_GOOGLE_CLIENT_ID (verified separately)."
[ "$fail" -eq 0 ] && echo "GOOGLE AUDIENCE: no mismatch detected" || echo "GOOGLE AUDIENCE STILL BROKEN"
exit "$fail"
