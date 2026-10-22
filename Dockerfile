# Builds the frontend, then serves it together with the FastAPI
# backend from a single process - see backend/app/main.py's
# "Serve the built frontend" section, which already does exactly this
# whenever frontend/dist exists. One container, one port: the same
# shape the project's own Cloudflare Tunnel instructions already rely
# on, just running on a real host instead of a laptop.

FROM node:20-slim AS frontend-build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim
WORKDIR /app/backend
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ ./
COPY --from=frontend-build /app/frontend/dist /app/frontend/dist

# Baked in at image-build time, not container-start time: the dataset
# is small, and this means every deploy (a git push -> a fresh image)
# rebuilds the database from whatever's currently committed in
# data/raw/Mayes_Bowling_Batting.xlsx, with no extra startup delay.
RUN python -m app.ingestion.load_spreadsheet

# READ_ONLY is intentionally NOT set here - it defaults to off (full
# read/write), matching local `docker run` usage. Set READ_ONLY=true
# as an environment variable on the hosting platform instead (see
# render.yaml) so a public deployment is locked down without the
# image itself being read-only for everyone who runs it.
EXPOSE 8000
CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
