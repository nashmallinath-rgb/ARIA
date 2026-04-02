import httpx
import os
import asyncio
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from dotenv import load_dotenv
import uvicorn

# Load local .env for development; Render will use Dashboard variables
load_dotenv()

app = FastAPI(title="ARIA v8 Gateway", version="1.0")

# ─────────────────────────────────────────────
# CORS — Essential for Frontend/Backend Sync
# ─────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Render uses a dynamic $PORT; fallback to 8000 for local dev
PORT = int(os.getenv("PORT", 8000))
WEARABLE_URL = os.getenv("WEARABLE_URL", "http://localhost:8000/wearable/current")

# API Keys from Render Environment Variables
XAI_API_KEY = os.getenv("XAI_API_KEY")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

# ─────────────────────────────────────────────
# IN-MEMORY STORE
# ─────────────────────────────────────────────
patient_store: dict = {}
history_store: dict = {}

# ─────────────────────────────────────────────
# MODELS
# ─────────────────────────────────────────────
class ManualLog(BaseModel):
    patient_id: str
    medication_taken: bool
    mood: int
    pain_level: int
    activity_done: Optional[str] = None
    symptoms: Optional[List[str]] = []

class ReportExtraction(BaseModel):
    patient_id: str
    report_type: str
    extracted_values: dict
    extracted_at: str

class AIQuery(BaseModel):
    prompt: str
    model_choice: str  # "grok" or "gemini"

# ─────────────────────────────────────────────
# AI BRAIN ENDPOINT (Grok & Gemini)
# ─────────────────────────────────────────────
@app.post("/aria/brain")
async def aria_brain(query: AIQuery):
    """Routes clinical queries to Grok or Gemini based on user choice."""
    if query.model_choice == "grok":
        if not XAI_API_KEY: raise HTTPException(status_code=500, detail="Grok API Key missing")
        # Logic for xAI / Grok API call goes here
        return {"model": "Grok", "response": "Clinical analysis pending xAI connection..."}
    
    elif query.model_choice == "gemini":
        if not GEMINI_API_KEY: raise HTTPException(status_code=500, detail="Gemini API Key missing")
        # Logic for Google Gemini API call goes here
        return {"model": "Gemini", "response": "Report synthesis pending Gemini connection..."}
    
    raise HTTPException(status_code=400, detail="Invalid model choice")

# ─────────────────────────────────────────────
# CORE API ROUTES
# ─────────────────────────────────────────────
@app.get("/health")
def health():
    return {"status": "ARIA v8 Gateway Online", "port": PORT}

@app.post("/log/manual")
def receive_manual_log(log: ManualLog):
    pid = log.patient_id
    if pid not in patient_store: patient_store[pid] = {"medications": {"adherence_streak": 0}}
    
    profile = patient_store[pid]
    profile.update({
        "medication_taken": log.medication_taken,
        "mood": log.mood,
        "pain_level": log.pain_level,
        "last_updated": datetime.now().isoformat()
    })
    return {"status": "Success", "patient_id": pid}

@app.get("/patient/{patient_id}/profile")
async def get_patient_profile(patient_id: str):
    # This would normally pull from your wearable_simulator.py logic
    profile = patient_store.get(patient_id, {"status": "No data yet"})
    return profile

# ─────────────────────────────────────────────
# SERVE REACT FRONTEND (Must be at the end)
# ─────────────────────────────────────────────

# Path to the build/dist folder
frontend_path = os.path.join(os.getcwd(), "frontend", "out")

if os.path.exists(frontend_path):
    app.mount("/", StaticFiles(directory=frontend_path, html=True), name="static")

    @app.get("/{catchall:path}")
    async def serve_react(catchall: str):
        return FileResponse(os.path.join(frontend_path, "index.html"))
else:
    @app.get("/")
    def fallback():
        return {"message": "Backend is live. Frontend 'dist' folder not found. Did you run 'npm run build'?"}

# ─────────────────────────────────────────────
# EXECUTION
# ─────────────────────────────────────────────
if __name__ == "__main__":
    uvicorn.run("gateway:app", host="0.0.0.0", port=PORT, reload=True)