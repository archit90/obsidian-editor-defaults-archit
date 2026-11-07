#!/bin/bash
CDP_PORT=9312 node ../../editor-outliner/e2e/cdp.mjs "(async()=>{ $1 })()" | sed 's/\\n/\n/g; s/\\"/"/g'
