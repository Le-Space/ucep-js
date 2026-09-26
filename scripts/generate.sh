#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
# src/pb/messages.proto (a copy of ucep-spec's) → src/pb/messages.js:
# protons writes TypeScript, esbuild strips the types. Run after the spec's
# messages.proto changes: npm run generate
set -euo pipefail
cd "$(dirname "$0")/.."
npx protons src/pb/messages.proto
npx esbuild src/pb/messages.ts --format=esm --target=es2022 --outfile=src/pb/messages.js --log-level=warning
rm src/pb/messages.ts
echo "wrote src/pb/messages.js"
