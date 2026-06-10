#!/usr/bin/env bash
set -euo pipefail

echo "==> Creating R2 bucket (skip if exists)"
npx wrangler r2 bucket create floorplan 2>/dev/null || echo "R2 bucket may already exist"

echo "==> Creating D1 database (skip if exists)"
npx wrangler d1 create floorplan-db 2>/dev/null || echo "D1 database may already exist"

echo ""
echo "Copy the database_id from above into wrangler.jsonc under d1_databases[0].database_id"
echo "Then run:"
echo "  npx wrangler secret put GEMINI_API_KEY"
echo "  npm run deploy"
