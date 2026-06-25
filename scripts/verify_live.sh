#!/usr/bin/env bash
# Live end-to-end verification of the deployed LifeSync AI stack.
# Proves, against PRODUCTION (no secrets printed):
#   1. BERT classifier service is reachable + ready
#   2. Node backend's own resolved view: chat=bert_local ready, OpenRouter configured
#   3. OpenRouter generative model actually responds (backend call shape)
set -u
NODE="https://lifesync-production-fdf9.up.railway.app"
BERT="https://bert-production-a417.up.railway.app"
KEY="${OPENROUTER_API_KEY:-}"
pass=0; fail=0
ok(){ echo "  PASS: $1"; pass=$((pass+1)); }
no(){ echo "  FAIL: $1"; fail=$((fail+1)); }

echo "== 1. BERT service /v1/status =="
b=$(curl -s -m 15 "$BERT/v1/status")
echo "$b" | grep -q '"status": *"ready"' && ok "bert ready ($(echo "$b" | python -c "import sys,json;print(json.load(sys.stdin).get('architecture'))" 2>/dev/null))" || no "bert not ready: $(echo "$b" | head -c 120)"

echo "== 2. Node /api/ai/health (backend resolved view) =="
h=$(curl -s -m 15 "$NODE/api/ai/health")
echo "$h" | python -c "import sys,json
d=json.load(sys.stdin).get('data',{})
print('   bert_ready =',d.get('bert_ready'),'| openrouter_ready =',d.get('openrouter_ready'))
print('   chat =',d.get('chat'))
print('   openrouter =',d.get('openrouter'))
import sys as s
s.exit(0 if (d.get('bert_ready') and d.get('openrouter_ready')) else 1)" \
  && ok "backend reports bert_ready && openrouter_ready" \
  || no "backend health not fully green (endpoint may be pre-deploy): $(echo "$h" | head -c 160)"

echo "== 3. OpenRouter generative reply (backend call shape) =="
if [ -n "$KEY" ]; then
  r=$(curl -s -m 40 https://openrouter.ai/api/v1/chat/completions \
    -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
    -H "HTTP-Referer: https://lifesync.app" -H "X-Title: LifeSync" \
    -d '{"model":"meta-llama/llama-3.3-70b-instruct","messages":[{"role":"user","content":"Reply with exactly: LIFESYNC_OPENROUTER_OK"}],"max_tokens":20,"temperature":0}')
  echo "$r" | grep -q "LIFESYNC_OPENROUTER_OK" && ok "OpenRouter model responded" || no "OpenRouter call failed: $(echo "$r" | head -c 160)"
else
  echo "  (skipped: OPENROUTER_API_KEY not in env)"
fi

echo "== RESULT: $pass passed, $fail failed =="
[ "$fail" -eq 0 ] && echo "ALL LIVE CHECKS GREEN" || echo "NOT ALL GREEN"
exit "$fail"
