#!/bin/bash
# A1: stop sandbox 2, drift app.json / core-plugins.json / hotkeys.json on disk, start, check.
cd "$(dirname "$0")"
H=../../../.sandbox
V=$H/sb2/vault/.obsidian
../../../tools/obs-sandbox.sh stop 2
python3 - "$V" <<'PY'
import json,sys
V=sys.argv[1]
a=json.load(open(V+'/app.json')); a.update(newLinkFormat='shortest',trashOption='system',attachmentFolderPath='./'); json.dump(a,open(V+'/app.json','w'),indent=2)
c=json.load(open(V+'/core-plugins.json')); c.update(backlink=True,bases=False); json.dump(c,open(V+'/core-plugins.json','w'),indent=2)
h=json.load(open(V+'/hotkeys.json')); h.pop('app:go-back',None); h.pop('templater-obsidian:insert-templater',None); json.dump(h,open(V+'/hotkeys.json','w'),indent=2)
PY
../../../tools/obs-sandbox.sh start 2 | tail -1
sleep 3
python3 - "$V" <<'PY'
import json,sys
V=sys.argv[1]
a=json.load(open(V+'/app.json')); c=json.load(open(V+'/core-plugins.json')); h=json.load(open(V+'/hotkeys.json'))
r=dict(link=a['newLinkFormat'],trash=a['trashOption'],att=a['attachmentFolderPath'],backlink=c['backlink'],bases=c['bases'],goback=h.get('app:go-back'),ins=h.get('templater-obsidian:insert-templater'))
ok=r['link']=='absolute' and r['trash']=='local' and r['att']=='u' and not r['backlink'] and r['bases'] and r['goback'] and len(r['goback'])==2 and r['ins']==[]
print(('PASS' if ok else 'FAIL'),'A1 disk after restart',r)
PY
cd $H/ed && ./q.sh 'return JSON.stringify({notices:[...document.querySelectorAll(".notice")].map(n=>n.textContent), errs: (window.__ed?.errs||[]).length})'
