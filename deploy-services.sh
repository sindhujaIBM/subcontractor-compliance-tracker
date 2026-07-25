#!/bin/bash
# Deploys the compliance API service.
#
# Usage:
#   ./deploy-services.sh

set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "Deploying compliance-tracker-api..."
cd "$ROOT/services/compliance" && npx serverless deploy --stage prod
