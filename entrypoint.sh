#!/bin/bash
set -e

echo "[entrypoint] start backend (FastAPI) on 0.0.0.0:9999 ..."
cd /app/backend
# 假定 backend/main.py 里定义了 app = FastAPI(...)
uvicorn main:app --host 0.0.0.0 --port 9999 &

echo "[entrypoint] start frontend (Next.js) on 0.0.0.0:3001 ..."
cd /app/frontend
npm run start -- -p 3001 &

echo "[entrypoint] start nginx on :9000 ..."
nginx -g "daemon off;"
