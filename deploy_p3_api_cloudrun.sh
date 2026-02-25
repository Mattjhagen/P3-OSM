#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="p3lending"
REGION="us-central1"
SERVICE="p3-api"
REPO="p3-containers"
IMAGE="p3-api"

# Set gcloud context
gcloud config set project "$PROJECT_ID" >/dev/null
gcloud config set run/region "$REGION" >/dev/null

echo "==> Enable required APIs"
gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  secretmanager.googleapis.com \
  --project "$PROJECT_ID"

echo "==> Ensure Artifact Registry repo exists: $REPO"
if ! gcloud artifacts repositories describe "$REPO" --location="$REGION" --project="$PROJECT_ID" >/dev/null 2>&1; then
  gcloud artifacts repositories create "$REPO" \
    --repository-format=docker \
    --location="$REGION" \
    --description="P3 container images" \
    --project "$PROJECT_ID"
fi

echo "==> Grant Cloud Run default runtime SA access to Secret Manager"
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
RUN_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${RUN_SA}" \
  --role="roles/secretmanager.secretAccessor" >/dev/null

echo "==> Build & push image (Cloud Build) from ./server"
IMAGE_URI="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/${IMAGE}:$(date +%Y%m%d-%H%M%S)"
gcloud builds submit ./server --tag "$IMAGE_URI" --project "$PROJECT_ID"

echo "==> Deploy to Cloud Run: $SERVICE"
# Adjust secrets list if you didn't create some of them
gcloud run deploy "$SERVICE" \
  --image "$IMAGE_URI" \
  --region "$REGION" \
  --allow-unauthenticated \
  --set-secrets \
SUPABASE_URL=SUPABASE_URL:latest,\
SUPABASE_ANON_KEY=SUPABASE_ANON_KEY:latest,\
SUPABASE_SERVICE_ROLE_KEY=SUPABASE_SERVICE_ROLE_KEY:latest,\
GEMINI_API_KEY=GEMINI_API_KEY:latest \
  --set-env-vars NODE_ENV=production

echo ""
echo "✅ Deployed."
gcloud run services describe "$SERVICE" --region "$REGION" --format="value(status.url)"
