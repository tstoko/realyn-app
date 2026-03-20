#!/bin/bash
# Firestore backup script - exports key collections to Cloud Storage

set -e

BUCKET="gs://realyn-app-backups"
DATE=$(date +%Y-%m-%d)

echo "Starting Firestore backup to ${BUCKET}/${DATE}..."

gcloud firestore export "${BUCKET}/${DATE}" \
  --collection-ids=organizations,disputes,users

echo "Backup completed successfully."
