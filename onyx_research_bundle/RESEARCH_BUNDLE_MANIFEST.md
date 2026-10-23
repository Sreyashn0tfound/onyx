# ONYX Project — Research Validation Bundle

**Date of Compilation:** October 14, 2026  
**Repository:** `zero-to-faang`  
**Purpose:** Consolidated dataset for research validation, empirical experiments, and academic paper revision.

---

## 1. Directory Structure

```text
onyx_research_bundle/
├── 1_python_backend/
│   ├── main.py                     # FastAPI entrypoint, HTTP orchestration, TTS, CV, /api/swarm
│   ├── graph.py                    # LangGraph multi-agent interview panel & swarm router
│   ├── execution_engine.py         # Subprocess sandboxing for Python/Node code execution
│   ├── ast_engine.py               # Deterministic Python AST loop-depth & Big-O analyzer
│   ├── scoring_engine.py           # Deterministic multi-modal scoring engine (Tests, AST, Composure)
│   ├── verification_engine.py      # NeuroSymbolicVerifier (guards against agent hallucinations)
│   └── complexity.py               # Canonical Big-O algebra, ordering, and normalization engine
│
├── 2_frontend_and_integration/
│   ├── InterviewRoom.tsx           # Multi-agent 3D interview panel UI (app/components/InterviewRoom.tsx)
│   ├── actions.ts                  # Next.js Server Actions (app/actions.ts) for orchestration & DB
│   └── schema.prisma               # Prisma data schema (prisma/schema.prisma) with Neon Postgres
│
└── 3_tests_and_reproducibility/
    ├── requirements.txt            # Complete Python virtual environment dependencies (pip freeze)
    ├── package.json                # Next.js frontend package manifest and scripts
    ├── package-lock.json           # Exact Node dependency lockfile
    ├── amazon_incidents.json       # Real incident tickets & verification test cases
    └── test_cases_and_evaluations.json # Deterministic test runs with AST, verifier, and scoring logs
```

---

## 2. File Audit: Missing vs. Present

| Requested Item | Status | Notes |
| :--- | :--- | :--- |
| `onyx-brain/main.py` | **Present** | Bundled in `1_python_backend/main.py` |
| `onyx-brain/graph.py` | **Present** | Bundled in `1_python_backend/graph.py` |
| `onyx-brain/execution_engine.py` | **Present** | Bundled in `1_python_backend/execution_engine.py` |
| `onyx-brain/ast_engine.py` | **Present** | Bundled in `1_python_backend/ast_engine.py` |
| `onyx-brain/scoring_engine.py` | **Present** | Bundled in `1_python_backend/scoring_engine.py` |
| `onyx-brain/verification_engine.py` | **Present** | Bundled in `1_python_backend/verification_engine.py` |
| `InterviewRoom.tsx` | **Present** | Actual repo path: `app/components/InterviewRoom.tsx` |
| Orchestration Server Actions | **Present** | Actual repo path: `app/actions.ts` |
| `prisma/schema.prisma` | **Present** | Bundled in `2_frontend_and_integration/schema.prisma` |
| Prisma Migrations | **Missing** | No `prisma/migrations/` directory exists. Schema was deployed to Neon Postgres using `prisma db push`. |
| Automated Test Suite (`pytest`/`jest`) | **Missing** | No standalone unit tests (`test_*.py` / `*.test.ts`) exist. Testing is verified via local driver blocks and `test_cases_and_evaluations.json`. |
| `requirements.txt` | **Generated** | Dumped directly from active virtual environment (`onyx-brain/venv`) |
| Benchmark Scripts & Reports | **Missing** | Synthetic benchmarks were not checked into git. Live empirical runs are captured in `test_cases_and_evaluations.json`. |
| Sample Coding Questions & Cases | **Present** | Bundled in `amazon_incidents.json` and `test_cases_and_evaluations.json` |

---

## 3. How to Run and Reproduce

### Backend (Python FastAPI)
```bash
cd onyx-brain
# Activate virtual environment
.\venv\Scripts\activate       # Windows PowerShell
# source venv/bin/activate    # Linux / macOS

# Install dependencies if reconstructing
pip install -r ..\onyx_research_bundle\3_tests_and_reproducibility\requirements.txt

# Start backend
python main.py
# Server binds to: http://127.0.0.1:8000
```

### Frontend (Next.js 16)
```bash
# In the root repository directory
npm install
npm run dev
# Application available at: http://localhost:3000
```

### Verification & Engine Smoke Tests
```bash
cd onyx-brain
.\venv\Scripts\python ast_engine.py
.\venv\Scripts\python execution_engine.py
```
