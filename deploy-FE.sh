#!/bin/bash
# Builds and deploys the frontend to S3 + invalidates CloudFront.
#
# Usage:
#   ./deploy-FE.sh

set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
STACK="compliance-tracker-infra-prod"
REGION="ca-west-1"

echo "Getting infrastructure outputs ($STACK)..."

BUCKET=$(aws cloudformation describe-stacks \
  --stack-name "$STACK" --region $REGION \
  --query "Stacks[0].Outputs[?OutputKey=='FrontendBucketName'].OutputValue" \
  --output text)

DIST_ID=$(aws cloudformation describe-stacks \
  --stack-name "$STACK" --region $REGION \
  --query "Stacks[0].Outputs[?OutputKey=='FrontendDistributionId'].OutputValue" \
  --output text)

CF_URL=$(aws cloudformation describe-stacks \
  --stack-name "$STACK" --region $REGION \
  --query "Stacks[0].Outputs[?OutputKey=='FrontendUrl'].OutputValue" \
  --output text)

if [[ -z "$BUCKET" || "$BUCKET" == "None" ]]; then
  echo "Error: Could not find FrontendBucketName in stack $STACK"
  echo "Make sure the infrastructure is deployed first:"
  echo "  cd infrastructure && npx serverless deploy --stage prod"
  exit 1
fi

echo "  Bucket: $BUCKET"
echo "  Dist:   $DIST_ID"
echo "  URL:    $CF_URL"
echo ""

echo "Building frontend..."
cd "$ROOT/frontend" && npm run build
echo ""

echo "Syncing to S3..."
aws s3 sync "$ROOT/frontend/dist/" "s3://$BUCKET/" \
  --delete \
  --cache-control "public,max-age=31536000,immutable" \
  --exclude "index.html"

aws s3 cp "$ROOT/frontend/dist/index.html" "s3://$BUCKET/index.html" \
  --cache-control "no-cache,no-store,must-revalidate"

echo ""
echo "Invalidating CloudFront..."
aws cloudfront create-invalidation \
  --distribution-id "$DIST_ID" \
  --paths "/*" \
  --query "Invalidation.Id" \
  --output text

echo ""
echo "Deployed to $CF_URL"
