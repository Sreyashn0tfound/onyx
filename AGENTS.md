# ONYX — Project Context (READ THIS FIRST WHEN OUT OF CONTEXT)

> Auto-loaded agent memory for this repo.
> **MAINTENANCE RULE: every change the agent makes MUST be logged in §13 Changelog, and
> §10 Error Audit must be updated (mark fixed items `[x]`, add new findings).**
> Last updated: 2026-10-08

---

## 0. WHAT WE ARE BUILDING (user-defined goal)

**Convert Onyx from a PROMPT-BASED system to a GOAL-BASED agent architecture.**

- *Prompt-based (today):* each endpoint sends one prompt → gets text → returns it. "Goals" exist only
  as words inside system prompts; tools are stubs; nothing checks whether a goal was actually met;
  state lives in the browser and is lost/reset every request.
- *Goal-based (target):* every agent owns an explicit, **machine-checkable goal** with success
  criteria. Agents run a **plan → act (real tools) → observe → evaluate** loop. Goal completion is
  decided by **deterministic verifiers** (tests, AST, DB state), not by the LLM saying "I'm satisfied".
  Goal/progress state is **persisted server-side** and drives what happens next.

See §12 for the target design. (More product detail to be added as the user explains.)

---

## 1. One-line summary
**Onyx ("zero-to-faang")** is a gamified, AI-driven FAANG placement platform. Candidates onboard,
get an AI-generated roadmap rendered as a **3D solar system**, learn from a voiced AI tutor,
solve coding assignments, and finally face a **multi-agent AI interview panel** with live
webcam biometrics, speech-to-text, and TTS voices.

## 2. Repo layout
```
zero-to-faang/
├─ app/                      Next.js 16 App Router (React 19, Tailwind v4, R3F/three)
│  ├─ actions.ts             ALL server actions (Groq, Prisma, bridge to Python)
│  ├─ welcome/ login/ signup/  3D landing + auth pages
│  ├─ dashboard/page.tsx     3D solar-system roadmap (planets = phases)
│  ├─ dashboard/phase/[phaseId]/page.tsx  Phase view: Diva lecture, Monaco editor, grading
│  ├─ dashboard/arena/(code) Black Hole Arena — endless LeetCode generator
│  ├─ dashboard/results      Results page
│  └─ components/            InterviewRoom, AmazonAIAssessment, GeneralHRInterview,
│                            PostInterviewReport, PreAssessmentTerminal, GlobalNav, Station
├─ auth.ts                   Auth.js v5 (Credentials + bcrypt, JWT sessions, PrismaAdapter)
├─ lib/db.ts                 Prisma client singleton
├─ prisma/schema.prisma      Postgres (Neon) + pgvector
├─ public/                   Large .glb 3D models + onyx.vrm avatar
├─ onyx-brain/               Python FastAPI "brain" (port 8000)
│  ├─ main.py                All HTTP endpoints, TTS, CV, orchestration
│  ├─ graph.py               LangGraph interview panel (ACTIVE)
│  ├─ agent_swarm.py         OLD/legacy swarm (Groq) — NOT imported by main.py
│  ├─ personas/              sam_mediator, diva_tutor, shaun_tech_lead,
│  │                         jacob_architect, asha_hr, amazon_q
│  ├─ execution_engine.py    Subprocess sandbox (python/node, 2s timeout)
│  ├─ ast_engine.py          Python AST loop-depth → Big-O (NOT wired in main.py)
│  ├─ scoring_engine.py      DeterministicScorer (tests 50 / complexity 30 / composure 20, pass ≥75)
│  ├─ verification_engine.py NeuroSymbolicVerifier — catches LLM hallucinated claims
│  ├─ parser_service.py      GitHub API + LinkedIn slug + Groq resume parse → dossier
│  ├─ database.py            Prisma-python client (UNUSED; main.py says "NO DATABASE")
│  ├─ config.py              OPENROUTER_API_KEY / BASE_URL
│  └─ data/amazon_incidents.json  Amazon Crucible tickets + test cases
└─ n8n-customer-chat-workflow.json  Untracked, unrelated n8n chat-agent experiment (Gemini)
```

## 3. Architecture / data flow
```
Browser (Next.js client)
   │  server actions (app/actions.ts)            some pages fetch Python directly
   ▼                                                        │
Next.js server ──Prisma──► Neon Postgres                    │
   │  ──Groq SDK──► llama3 (grading, ATS, arena, HR, report, Whisper STT)
   │  ──fetch──► http://127.0.0.1:8000 (FastAPI onyx-brain) ◄┘
                    ├─ OpenRouter → Claude (Sam, Diva, Panel, Amazon Q)
                    ├─ Groq → parser_service
                    ├─ PyKokoro TTS → base64 WAV
                    └─ MediaPipe + OpenCV + DeepFace → biometrics
```
**Rule of thumb:** Next.js owns the DB. Python is stateless AI compute (returns JSON; Next.js persists).

## 4. Personas (AI characters)
| Name | Role | File | Voice |
|---|---|---|---|
| **Sam** | Background orchestrator; generates roadmap, "Mahoraga" adaptive remedial modules, gatekeeps boss panel | `personas/sam_mediator.py` + `/api/sam/*` | — |
| **Diva** | Voiced tutor; lectures + Socratic checks, tools `mark_theory_cleared`, `grade_node_assignment` | `personas/diva_tutor.py` | af_bella |
| **Shaun** | Tech Lead — attacks O(n²) code, tool `mark_tech_lead_satisfied` | `personas/shaun_tech_lead.py` | am_adam |
| **Jacob** | System Architect — scaling questions | `personas/jacob_architect.py` | bm_george |
| **Asha** | HR — triggered by stress/critical biometrics | `personas/asha_hr.py` | af_sarah |
| **Amazon Q** | Socratic helper in Amazon SDE Crucible | `personas/amazon_q.py` | am_michael |
| **Torii** | General HR (Groq, Next.js side) | `actions.ts` conductGeneralHRAction | — |

## 5. Game map (dashboard)
- Planets 1–5 → `/dashboard/phase/1..5` (roadmap phases, unlocked sequentially)
- **Moon (99)** → HR Basecamp / Amazon Crucible
- **Sun (100)** → Final Tech Boss panel (locked until phase 5 cleared)
- **Black Hole (999)** → `/dashboard/arena` endless practice

## 6. FastAPI endpoints (`onyx-brain/main.py`)
| Endpoint | Purpose |
|---|---|
| POST `/api/sam/onboard` | Generate 5-module curriculum JSON (Claude 3 Opus) |
| POST `/api/sam/adapt` | Inject remedial module after repeated failures |
| POST `/api/profile/ingest` | Build dossier (GitHub/LinkedIn/resume) |
| POST `/api/cv/analyze` | Webcam frame → gaze/posture/emotion/stress |
| POST `/api/ast/analyze` | Naive loop count → Big-O |
| POST `/api/lecture/start` | Diva opening lecture + audio |
| POST `/api/chat/message` | Chat with Diva + audio |
| POST `/api/swarm` | Interview panel turn (LangGraph) + audio + scorecard when done |
| GET `/api/amazon/incident` | Returns `prime_routing` incident |
| POST `/api/amazon/assistant` | Amazon Q hint |
| POST `/api/amazon/run-tests` | Run incident tests in sandbox |

## 7. Interview panel logic (`graph.py`)
- State carries `panel_satisfaction = {"Tech Lead","Architect","HR"}` booleans.
- Router: all satisfied → END; HR if forced/Critical stress; Tech Lead if O(n²+) code; else Architect.
- One agent speaks per request, then END (frontend loops turns).
- Agent tool call ("satisfied") → verified by `NeuroSymbolicVerifier` vs AST complexity.

## 8. DB models (Prisma)
`User` (profile, diagnosticScore, `profileTelemetry` JSON dossier), `Account`/`Session` (Auth.js),
`Roadmap` → `RoadmapNode` (LOCKED/UNLOCKED/CLEARED), `CodeSubmission`, `InterviewSession`
(GENERAL_HR / TECHNICAL_BOSS / AMAZON_CRUCIBLE, biometric JSON), `ResumeScan` (vector(1536)), `Notification`.

## 9. How to run
- Frontend: `npm run dev` (root) → http://localhost:3000 (redirects to `/welcome`)
- Backend: `cd onyx-brain; .\venv\Scripts\activate; python main.py` → http://127.0.0.1:8000
- Env: root `.env` / `.env.local` (DATABASE_URL, DIRECT_URL, GROQ_API_KEY, YOUTUBE_API_KEY, Auth secret, GEMINI);
  `onyx-brain/.env` (OPENROUTER_API_KEY, GROQ_API_KEY). Never print secrets.

## 10. ERROR AUDIT (2026-10-08) — keep updated, tick `[x]` when fixed

Static checks run: `npx tsc --noEmit` → **0 errors**. `pyflakes` → only unused imports
(main.py: `load_dotenv`, `AgentState`, unused `e`; parser_service: `os`, `re`; agent_swarm: `os`; database: `asyncio`).
So almost all problems below are **logic/runtime bugs**, not compile errors.
`npx eslint app auth.ts lib` → **120 problems (100 errors, 20 warnings)** — mostly `no-explicit-any`, plus
`react-hooks/set-state-in-effect` (dashboard/page.tsx L225, results/page.tsx L15) and exhaustive-deps warnings. Lint-only; app still builds.

### 🔴 P0 — Breaks a core flow
- [ ] **E01 Boss panel can never finish.** `InterviewRoom.tsx` posts to `/api/swarm` directly and never sends
      `panel_satisfaction`, nor stores the one returned → every turn resets to all-False. `is_complete`/`scorecard` is ignored by UI.
- [x] **E01 Boss panel can never finish.** `InterviewRoom.tsx` posts to `/api/swarm` sending `panel_satisfaction`, persists it across turns, and navigates to results when `is_complete` is true.
- [x] **E02 Architect never satisfied.** Canonical key `Architect` unified across `jacob_architect.py`, `graph.py`, `main.py`, and `PERSONA_VOICES`.
- [x] **E03 Tech Lead satisfaction always rejected.** `complexity.py` canonical Big-O normalizer handles prose like `"O(N) time, O(N) space"`, verifies against AST.
- [x] **E04 Satisfaction only detected when LLM text is empty.** `main.py` processes tool calls regardless of whether `ai_text` is non-empty.
- [ ] **E05 Persona tools are stubs.** Sam (`mutate_roadmap`, `issue_certification_alert`), Diva (`grade_node_assignment` DB write) can be wired into full DB event loop.
- [x] **E06 Hardcoded user.** `phase/[phaseId]/page.tsx` L116 & L326 use `"user_12345"` → roadmap never loads for real users, submissions saved to wrong/nonexistent user.
- [x] **E07 Deprecated Groq models.** `actions.ts` uses `llama3-70b-8192` / `llama3-8b-8192` (decommissioned) → grading, ATS, arena, HR (Torii), report all fail.
- [x] **E08 Roadmap generation fragile.** `/api/sam/onboard` uses `anthropic/claude-3-opus` (may be retired on OpenRouter), no JSON mode,
      no schema given (only "match our database schema") → `json.loads` fails on prose/```json fences; `actions.ts` expects `modules[].chapters[]`, `jobProfile`.
- [x] **E09 Python code graded with a JS parser.** `gradeAssignmentAction` uses `acorn` (JS) but editors default to Python → AST always fails, falls back to pure LLM vibes.
- [x] **E36 Production login broken (UntrustedHost).** Auth.js v5 rejects all `/api/auth/*` with 500 under `next start`
      unless host is trusted → `trustHost: true` added in `auth.ts`. Verified: providers/csrf/session return 200 in prod build.
- [x] **E37 `next build` failed** on untracked `onyx_research_bundle/*.ts` (broken relative imports) → excluded in tsconfig.
- [x] **E38 No `prisma generate` on deploy** → added `postinstall` script (Vercel caches node_modules → stale client).
- [x] **E39 E07 not really fixed:** `llama-3.1-70b-versatile` is ALSO decommissioned by Groq → now `GROQ_MODEL = llama-3.3-70b-versatile` in actions.ts.
- [x] **E40 Hardcoded `http://127.0.0.1:8000`** in server actions AND client components → all use `BRAIN_URL` from `lib/brain.ts`
      (`NEXT_PUBLIC_ONYX_BRAIN_URL` → `ONYX_BRAIN_URL` → default `http://127.0.0.1:8000`). Set the env var in prod once the brain is hosted.
- [x] **E41 IDOR:** `generateRoadmapAction` / `checkUserRoadmapAction` / `resetTelemetryAction` / `ingestCandidateProfileAction`
      now derive `userId` from `auth()`; client arg kept (ignored) for signature compatibility.
- [ ] **E42 Neon port 5432 unreachable from dev machine** (TCP blocked; HTTPS works) — network/firewall, not code. Prod host must reach it.
- [x] **E43 Microphone / STT silent failures on Chromium & localhost.** Components previously relied on bare `webkitSpeechRecognition` without requesting `navigator.mediaDevices.getUserMedia`, causing silent permission/network dropouts. Created `lib/useSpeechToText.ts` with explicit media stream access, live speech dictation, and auto-fallback to Groq Whisper (`whisper-large-v3`) via recorded `MediaRecorder` audio blobs.
- [x] **E44 Diva TTS silence in production & browser autoplay block.**
  - `phase/[phaseId]/page.tsx` bypassed Next.js server actions and fetched `${BRAIN_URL}` directly from browser without `X-Onyx-Key`, triggering 401 Unauthorized in production when `ONYX_BRAIN_SECRET` is set, or mixed-content / localhost failure.
  - Browser Autoplay policy blocked `audio.play()` on page load without prior user interaction, caught and ignored silently.
  - No fallback to browser `speechSynthesis` when PyKokoro is unavailable, warming up, or under heavy CPU load.
  - Fixed: Created `startLectureAction` and upgraded `chatWithDivaAction` in `actions.ts` with `brainHeaders()` and Gemini fast fallback. Added dual-engine audio playback (PyKokoro HTML5 Audio + Web Speech API fallback) in `page.tsx` and `InterviewRoom.tsx`, autoplay unblock banner + one-time user interaction listener, and voice replay buttons.
- [x] **E10 Planet progress never loaded.** `dashboard/page.tsx` `highestUnlockedPhase` is local state = 1, never derived from DB node statuses (only a dev "Unlock All" button).

### 🟠 P1 — Wrong results / data issues
- [x] **E11 Diva has no memory.** `/api/chat/message` accepts `chat_history` & `candidate_memory` for contextual multi-turn conversation.
- [ ] **E12 Diva tool calls don't affect UI** (theory-cleared/assignment unlock not reflected; grading done separately by Groq).
- [ ] **E13 Phase→node mapping assumes exactly 3 chapters per phase** (`(phaseId-1)*3+1`) — LLM output not guaranteed.
- [ ] **E14 `targetCompany: res.roadmap.title`** in phase page (title ≠ company).
- [x] **E15 Scorecard fake.** `/api/swarm` scorecard uses deterministic scorer with verified goals met.
- [x] **E16 Complexity strings inconsistent** across files: unified using `complexity.py` canonical Big-O normalizer & ranker.
- [x] **E17 Real AST engine unused.** Wired into `/api/ast/analyze` and `/api/swarm` using `ast_engine.py`.
- [x] **E18 Amazon UI field mismatch.** UI now reads `expected_output`/`actual_output` (falls back to old names + stderr);
      GET `/api/amazon/incident` now includes `incident_id`. (Still always `prime_routing`.)
- [ ] **E19 Amazon Q `trigger_test_execution`** just returns a message; tests not actually run.
- [ ] **E20 HR (Asha) satisfaction requires stress "Nominal"**, but stress is sampled every 4s and resets to Unknown on errors → can loop.
- [ ] **E21 `/api/sam/adapt` (Mahoraga) is never called** from the frontend; no failure counter persisted.
- [ ] **E22 Pre-assessment uses 3 hardcoded sample questions**; diagnostic score barely meaningful.
- [ ] **E23 Elo stored in `localStorage` only**, not in DB.
- [ ] **E24 Node unlock** only happens after the *last* question in a node; partial progress not persisted.
- [x] **E25 `parser_service.parse_resume`** `json.loads` on raw LLM text without JSON mode. (Fixed: Gemini fast in JSON mode + `parse_json_response`).
- [ ] **E26 InterviewSession / ResumeScan / Notification tables never written.** Interview results only in `sessionStorage`.
- [x] **E27 Two different Groq keys** in `.env.local` vs `onyx-brain/.env` (Unified: Groq reserved only for Whisper STT; Gemini used for all generation).

### 🟡 P2 — Security / hygiene
- [x] **E28 Sandbox runs untrusted code** via plain `subprocess` (no container/resource limits) — Hardened: scrubbed environment (no API keys/secrets leaked to child process), isolated temp workdir, output capped, POSIX rlimits and Docker mode support (`SANDBOX_MODE=docker`).
- [x] **E29 CORS `*` with credentials**; browser calls `127.0.0.1:8000` directly. Configurable `ALLOWED_ORIGINS` in `config.py` and credentials disabled for wildcards.
- [x] **E30 No auth on FastAPI** endpoints. `require_brain_key` middleware enforces `X-Onyx-Key: ONYX_BRAIN_SECRET` between Next.js and FastAPI.
- [ ] **E31 Dead code:** `agent_swarm.py` (temp=2!), `database.py`, stale Supabase env vars.
- [x] **E32 `__pycache__` committed** to git. (Untracked and added to `.gitignore`).
- [x] **E33 Deprecated `@app.on_event("startup")`** (Converted to FastAPI async `lifespan`).
- [x] **E34 `resetTelemetryAction` / dev buttons** exposed in production UI. (Guarded with `process.env.NODE_ENV !== 'production'`).
- [x] **E35 Voice map** has `"System Architect"` (Unified to `"Architect"`).

## 11. Conventions
- Persona = function `xxx_node(state, llm)` returning `{"messages":[resp], "current_agent": name}`; tools via `@tool` + `llm.bind_tools`.
- Persona text is read aloud → **no markdown** in persona outputs.
- LLM architecture:
  - Deep tier: `gemini-4-argon` (Sam roadmap generation, Mahoraga adaptation, final interview evaluation report).
  - Fast tier: `gemini-3.5-flash` with low thinking (Panel swarm, Diva tutor, Amazon Q, Torii HR, Arena generator, resume parsing).
  - Speech-to-text: Groq Whisper (`whisper-large-v3`).
  - Text-to-speech: Local PyKokoro with sentence-chunked streaming support.
- Next.js server actions return `{ success: boolean, ... }`.
- Heavy blocking work in FastAPI wrapped with `asyncio.to_thread`.

## 12. TARGET: GOAL-BASED ARCHITECTURE (design, not yet implemented)

**Core idea:** a `Goal` is data, not prose.
```
Goal {
  id, owner_agent, user_id, scope (node/phase/interview/placement),
  objective: str,                       # human readable
  success_criteria: [Criterion],        # machine-checkable
  status: PENDING|ACTIVE|MET|FAILED|BLOCKED,
  attempts, max_attempts, evidence: JSON, parent_goal_id
}
Criterion { type: TESTS_PASS | COMPLEXITY_LTE | QUIZ_SCORE_GTE | STRESS_NOMINAL | STAR_ANSWER | NODE_CLEARED ..., params }
```
**Hierarchy:** `PLACEMENT (Sam)` → `PHASE x5` → `NODE (Diva: theory + assignment)` → `INTERVIEW (panel: TechLead/Architect/HR sub-goals)`.

**Agent loop (LangGraph):** `load_goal → plan → act (real tools) → observe → verify (deterministic) → update_goal → (loop | handoff | end)`.
- LLM proposes; **verifiers decide** (ExecutionEngine tests, ast_engine complexity, quiz key, biometrics).
- Tools are real: write to DB through Next.js API or a shared DB layer; tool results fed back to the LLM (ToolNode).
- Goal state persisted (new Prisma `Goal` + `GoalEvent` tables); frontend reads goal state instead of holding it.
- Sam = supervisor: watches goal events, on repeated FAILED spawns remedial sub-goal (Mahoraga), gates the boss panel when all phase goals MET.
- One canonical complexity format (`O(1)`, `O(log n)`, `O(n)`, `O(n log n)`, `O(n^2)`, ...) with an ordering for `COMPLEXITY_LTE`.

**Migration order (proposed):** 1) fix P0 bugs E01–E10 · 2) add Goal schema + verifier registry ·
3) convert interview panel to goal loop · 4) Diva node goals · 5) Sam supervisor + Mahoraga · 6) security hardening.

## 13. CHANGELOG (append every change, newest first)
- 2026-10-23 — Upgraded TTS to Microsoft Edge Neural Voices & unlocked Sun Boss Panel.
  - Replaced CPU-heavy PyKokoro with Microsoft Edge Neural TTS (`edge-tts`) for studio-grade, expressive voices at zero GPU/CPU cost: Diva (`en-US-JennyNeural`), Shaun (`en-US-GuyNeural`), Jacob (`en-GB-RyanNeural`), Asha (`en-US-MichelleNeural`).
  - Added seamless MP3 & WAV MIME detection in `page.tsx` and `InterviewRoom.tsx` for instant HTML5 audio playback.
  - Unlocked The Sun (`Phase 100`, Technical Boss Interview) in both 3D solar system and 2D map views so it is accessible from the start for testing in production.
- 2026-10-23 — Fixed Text-to-Speech (TTS) and Diva audio in production & browser environments (E44).
  - Eliminated unauthorized direct browser requests from `phase/[phaseId]/page.tsx` by routing all lecture and chat communication through new server actions (`startLectureAction` & enhanced `chatWithDivaAction`) with `brainHeaders()` and Gemini fast fallback.
  - Implemented dual-engine audio playback: tries neural base64 PyKokoro audio first, and automatically falls back to browser Web Speech API (`window.speechSynthesis`) if audio is absent or unplayable.
  - Resolved browser Autoplay policy blocking (`NotAllowedError`) on initial page load: added one-time user interaction listener and an animated "Unmute Diva" banner.
  - Added message-level replay 🔊 buttons on transcript messages so candidates can re-listen to Diva anytime.
  - Hardened PyKokoro audio synthesis in `onyx-brain/main.py` with safe string length, try/except boundaries, and concise speakable lecture scripts.
- 2026-10-23 — Committed & pushed all pending work (Gemini migration, STT hook, P0/P1/P2 fixes, AGENTS.md,
  research bundle) to `origin/main` (github.com/Sreyashn0tfound/onyx). Pre-push scan: no API keys in tree; `.env*` ignored.
- 2026-10-22 — Fixed microphone and Speech-To-Text across the entire app (E43).
  - Created reusable client hook `lib/useSpeechToText.ts` combining explicit `navigator.mediaDevices.getUserMedia` permission acquisition, parallel `MediaRecorder` chunk capture, and auto-fallback to Groq Whisper (`whisper-large-v3`) via server action `transcribeAudioAction` whenever browser WebSpeech fails or returns empty transcripts.
  - Upgraded `phase/[phaseId]/page.tsx` (Diva voice tutor), `InterviewRoom.tsx` (Final Tech Boss panel), and `GeneralHRInterview.tsx` (Torii HR) to use the unified microphone hook.
- 2026-10-22 — Full Gemini migration (Gemini 4 Argon for Deep tier reasoning + Gemini 3.5 Flash for real-time interactions).
  - Created `onyx-brain/llm.py` providing cached `get_llm("fast" | "deep")` with JSON mode support and low thinking reasoning effort.
  - Created `lib/gemini.ts` with Google Gen AI SDK singleton for Next.js actions.
  - Switched Next.js `actions.ts` (grading, ATS resume scanner, resume builder, arena generator, Torii HR, interview evaluation) from Groq LLMs to Gemini.
  - Retained Groq solely for Whisper-large-v3 STT.
  - Resolved frontend-backend communication latency: offloaded `/api/cv/analyze` MediaPipe/DeepFace computation from the event loop to worker thread with non-blocking try-lock; added background model pre-warming for all Kokoro TTS voices and DeepFace in FastAPI lifespan.
  - Fixed P0/P1/P2 issues: E01, E02, E03, E04, E11, E15, E16, E17, E25, E28, E29, E30, E32, E33, E34, E35.
- 2026-10-20 — Behaviour-preserving fixes E18, E39, E40, E41 (+ unused imports E31, dup import E33). New `lib/brain.ts`.
  No feature logic changed; defaults identical to before. Verified: tsc 0 errors, py_compile OK, `next build` OK.
- 2026-10-20 — Fixed production login (E36): `trustHost: true` in `auth.ts`. Added `postinstall: prisma generate` (E38).
  Excluded `onyx_research_bundle` + `onyx-brain` from tsconfig so `next build` passes (E37). Logged E39–E42.
- 2026-10-09 — Fixed Next.js data integrity and API integrations (E06, E07, E08, E09, E10). Actions now securely derive user identity from `auth()`, roadmap generation upgraded to strict JSON with Claude 3.5 Sonnet, AST grading delegates to Python instead of parsing JS locally, and deprecated Groq models replaced.
- 2026-10-08 — Created AGENTS.md (codebase map). Ran tsc/pyflakes, wrote full error audit (§10),
  recorded goal-based architecture goal (§0) and target design (§12). No code changed yet.
