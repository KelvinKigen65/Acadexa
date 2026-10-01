# Acadexa

Acadexa is a source-grounded academic knowledge assistant. Students organise their course material, ask questions, and receive answers that surface the exact supporting documents.

## Current milestone

This repository now contains an interactive front-end prototype in `frontend/`. It demonstrates the main study workflow:

- course and conversation navigation
- source-backed chat layout with citation inspection
- document upload handoff state
- responsive desktop and mobile interface
- explicit demo-response treatment until the Django course-answering backend is connected

The Django foundation in `backend/` now provides JWT auth, isolated courses, PDF ingestion, pgvector retrieval, LangGraph routing, persisted conversations, and citation metadata. The React screen remains deliberately local-data driven until an authenticated API client is connected.

## Run the interface

```bash
cd frontend
npm install
npm run dev
```

Then open the local URL printed by Vite (normally `http://localhost:5173`).

## Implementation boundary
## Use the OpenAI API

Ollama is not required. Copy the backend configuration template, add an OpenAI project API key, then start the stack with that file:

```bash
cp backend/.env.example backend/.env
# Edit backend/.env and set OPENAI_API_KEY=...
docker compose --env-file backend/.env up --build
```

The template enables OpenAI for both embeddings (`text-embedding-3-small`, shortened to this project's 384-dimensional pgvector column) and grounded answer generation (`gpt-4.1-mini`). The API key stays in `backend/.env`, which Git ignores. Existing documents that were indexed with the development-only `local_hash` provider must be uploaded again after the switch so they receive OpenAI embeddings.

You can override the model or endpoints with the `EMBEDDING_*` and `LLM_*` variables if needed, but the standard OpenAI setup only requires `OPENAI_API_KEY`.


The interface intentionally uses local presentation data. A production next step is to replace it with authenticated API calls for courses, uploads, and conversations; the conversation endpoint invokes Acadexa's internal RAG pipeline. Citations must continue to be generated from retrieved chunk metadata, never from model text alone.
