# CivicMind

CivicMind is a civic complaint intelligence app for Mumbai. A citizen submits a description and an optional photo. The API checks that both describe a real civic issue, extracts structured features, stores an embedding in PostgreSQL, and decides whether the report belongs to an existing incident or a new one.

## How a complaint is handled

1. The phone collects latitude and longitude with the browser Geolocation API. The model is never asked for coordinates.
2. The server stamps the complaint with the current UTC time. The model is never asked for a timestamp.
3. Groq's multimodal model reads the text and optional image in JSON mode. Pydantic checks the result. Random, abusive, or non-civic text is rejected. If a photo is attached, it must show a real civic issue that matches the text.
4. Accepted complaints get three representations:
   - structured issue features
   - latitude, longitude, and the server timestamp
   - a semantic embedding from a configurable hosted embeddings API
5. pgvector finds semantically similar complaints. PostGIS measures distance. The time gap is calculated from stored timestamps.
6. The report joins an existing incident only when all three pass: semantic similarity, geographic radius, and time window. Otherwise a new incident is created.

The result card shows the decision, the three measurements, and a short explanation of which rules passed or failed.

## Stack

- Next.js frontend, responsive, deployable to Vercel
- FastAPI backend, also deployable to Vercel
- Groq (`qwen/qwen3.6-27b`) for multimodal understanding and JSON output
- OpenAI-compatible embeddings API (OpenAI, Jina, or another host)
- Supabase PostgreSQL with `vector` and `postgis`

Groq does not currently serve `/v1/embeddings`. Chat and vision stay on Groq. Embeddings use a separate OpenAI-compatible endpoint so the vector dimension can be measured and stored in pgvector. The API records that dimension and refuses to mix models later.

## 1. Prepare Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Open **Database → Extensions** and enable **vector** and **postgis**.
3. Or run `backend/sql/enable_extensions.sql` in the SQL editor.
4. Open **Project Settings → Database → Connection string** and copy the **session pooler** URI (port 5432). Do not use the transaction pooler on port 6543.
5. URL-encode any special characters in the database password.

The API creates the tables and indexes on startup.

## 2. Configure the API

```powershell
cd backend
copy .env.example .env
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

Edit `backend/.env`:

- `DATABASE_URL` — Supabase session URI. `postgresql://` is rewritten to `postgresql+psycopg://`.
- `GROQ_API_KEY` — from [console.groq.com](https://console.groq.com).
- `EMBEDDING_BASE_URL`, `EMBEDDING_API_KEY`, `EMBEDDING_MODEL` — an embeddings host. OpenAI `text-embedding-3-small` is the example in `.env.example`. For Jina, set `EMBEDDING_TASK=text-matching`.
- Leave `EMBEDDING_DIMENSIONS` empty. The first successful call measures the real vector length.

Match rule defaults, all required:

- semantic similarity `0.80`
- geographic radius `500` meters
- time window `72` hours

## 3. Run it locally

Terminal 1:

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
uvicorn app.main:app --reload --port 8000
```

Terminal 2:

```powershell
cd frontend
copy .env.example .env.local
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). API docs are at [http://localhost:8000/docs](http://localhost:8000/docs).

Check `http://localhost:8000/api/health`. `embedding_verified` should be true and `embedding_dimensions` should be the measured length, not a hardcoded guess.

## 4. Deploy to Vercel

Create two projects from this repository.

**API**

- Root directory: `backend`
- Framework: FastAPI (detected from `pyproject.toml`)
- Environment variables: everything in `backend/.env`
- The included `vercel.json` allows the function to run for 60 seconds so a photo assessment can finish.

**Web**

- Root directory: `frontend`
- Framework: Next.js
- `NEXT_PUBLIC_API_URL` = the API URL, with no trailing slash, for example `https://civicmind-api.vercel.app`
- On the API project, set `CORS_ORIGINS` to the web URL, for example `https://civicmind.vercel.app`

Redeploy the web project after setting `NEXT_PUBLIC_API_URL`, because Next.js reads that variable at build time.

Open the web URL on a phone. Location works only on HTTPS, which Vercel provides. Allow location when the page asks.

## What to try

1. Allow location, describe a pothole, and attach a photo of damaged road. The result should be a new incident.
2. Submit a very similar report again from the same place. It should join the existing incident when similarity, distance, and time all pass.
3. Submit "hello buy followers now" with no real civic problem. It should be rejected and not stored.
4. Submit a civic sentence with an unrelated photo, such as food or a selfie. It should be rejected because the image is not a civic issue.
5. Use **Near my location**, category, severity, issue type, and dates to filter recent complaints and incidents.

## Layout

```
backend/app/main.py                 FastAPI app
backend/app/models.py               Complaint, Incident, embedding signature
backend/app/schemas.py              Pydantic models and the civic-issue policy
backend/app/services/groq_vision.py Multimodal JSON assessment
backend/app/services/embeddings.py  Hosted embeddings and dimension check
backend/app/services/matching.py    Similarity + distance + time rule
backend/app/services/pipeline.py    Store, search, attach or create an incident
frontend/                           Next.js interface
```

## Tests

From `backend`, with the virtualenv active:

```powershell
python -m unittest tests.test_matching tests.test_policy
```

These cover the match rule and the validation policy. They do not call Groq or Supabase.
