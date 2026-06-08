# Quizzora

**Repository:** [https://github.com/VineelD/quizzora](https://github.com/VineelD/quizzora)

Open-source Australian curriculum ed-tech for secondary schools and families (Years 7–12, including VCE). Teachers generate curriculum-aligned quizzes and assign them to classes; students use an assignment-scoped Study Coach before graded work unlocks.

**Hosted service:** [quizzora.org](https://quizzora.org) — operated by Mr Vineel Davuluri (ABN 41 833 153 799).  
**License:** [AGPL-3.0](LICENSE) — see [docs/OPEN-SOURCE.md](docs/OPEN-SOURCE.md) for mission, self-host vs hosted, and what subscriptions fund.  
**Source:** [https://github.com/VineelD/quizzora](https://github.com/VineelD/quizzora)

## Mission

Put Australian secondary curriculum practice in reach of every school and family: transparent software, data hosted in Australia on the managed service, and the freedom to self-host from the same codebase.

Subscriptions on quizzora.org sustain hosting, OpenAI usage, and ongoing development — they do not restrict access to the source under AGPL.

## Contribute and sponsor

- Read [docs/OPEN-SOURCE.md](docs/OPEN-SOURCE.md) before deploying or modifying the code.
- **Self-host:** follow [Run locally](#run-locally) and [Windows one-machine setup](#windows-one-machine-setup); production ops: [docs/WINDOWS-AUTO-START.md](docs/WINDOWS-AUTO-START.md).
- **Hosted users:** a school or family plan on quizzora.org helps fund the shared platform; contact [support@quizzora.org](mailto:support@quizzora.org) for onboarding or demos.
- **Code contributions:** email patches or open issues and pull requests on GitHub.

---

## Technical overview

A Next.js teacher/student assessment portal for Australian secondary curriculum practice.

## Features

- Teacher and student login backed by SQLite.
- Separate usernames, password hashes, and user profile records.
- Educator console for creating and assigning quizzes to a class.
- Teacher tools for creating student accounts and profile notes.
- Student dashboard for answering assigned quizzes.
- Status and mark reports for teachers.
- Year 7–12 topic selection with multiple-choice, worded-problem, or mixed question styles.
- Generated question images for visual stimuli (diagrams, graphs, maps, tables) stored locally and rendered in the quiz UI.
- Server-side OpenAI generation using `OPENAI_API_KEY`; quiz creation fails when OpenAI is unavailable.
- Async AI quiz generation via a SQLite-backed job queue (no HTTP timeout during OpenAI calls).

## Account email and username policy

Each email and username may belong to at most one school account and at most one family account (not multiple schools or families). Password reset uses the portal you chose in the sign-in wizard (school educator vs family parent) when your email exists in both; a join code is only required when your email appears in more than one school or more than one family. Sign-in with a username that exists in multiple tenants requires a school or family code when passwords match more than one account.

## Run locally

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:3000`.

Seeded demo credentials support username or email login:

- Teacher: `teacher` / `Quizzora123!` (`Vineel Davuluri`)
- Student: `student` / `Quizzora123!`

## OpenAI configuration

Set the key on the server, not in browser code:

```bash
OPENAI_API_KEY=your_rotated_key
OPENAI_MODEL=gpt-4.1-mini
OPENAI_ENDPOINT=https://api.openai.com/v1/responses
OPENAI_IMAGE_RESPONSE_MODEL=gpt-4.1-mini
OPENAI_IMAGE_QUALITY=medium
OPENAI_IMAGE_SIZE=1024x1024
OPENAI_IMAGE_ENDPOINT=https://api.openai.com/v1/images/generations
OPENAI_IMAGE_MODEL=dall-e-3
AUTH_SECRET=replace-with-a-long-random-secret
AUTH_COOKIE_SECURE=false
```

If `OPENAI_API_KEY` is missing, over quota, or OpenAI returns invalid data, quiz creation fails with an error and no fallback quiz is assigned.

## Async quiz generation

AI quiz creation is queued so the browser and IIS proxy do not wait for OpenAI (30–120+ seconds).

1. `POST /api/teacher/quizzes` enqueues a job and returns `{ jobId, status: "queued" }` with HTTP **202**.
2. The UI polls `GET /api/teacher/quizzes/jobs/{jobId}` every ~2.5s for status updates.
3. A background worker (`lib/quiz-job-worker.js`) processes queued jobs one at a time.

The worker starts automatically with the Next.js server via `instrumentation.js`. On Windows IIS (single Node instance), no extra setup is required.

Optional controls:

```bash
QUIZ_JOB_WORKER_ENABLED=false   # disable in-process worker
QUIZ_JOB_POLL_MS=3000           # poll interval (ms)
```

If the in-process worker is disabled, run the standalone worker on a schedule:

```powershell
node C:\LittleCode\scripts\quiz-job-worker.mjs --once
```

Register that command in Task Scheduler every minute as a backup.

When a question includes a visual stimulus, quiz creation makes one OpenAI **Responses API** call that returns the quiz JSON and any diagram images together via the `image_generation` tool (see [OpenAI image generation guide](https://developers.openai.com/api/docs/guides/image-generation?api=responses)). The prompt requires diagram labels and dimensions to match the question text exactly. Bytes are stored in SQLite (`quiz_question_images`) and served from `/api/quiz-media/{id}`. Set `OPENAI_IMAGE_GENERATION=false` to disable image generation and use SVG placeholders instead.

Use `AUTH_COOKIE_SECURE=false` when testing over plain HTTP such as `http://external-ip:8080`; use `AUTH_COOKIE_SECURE=true` for HTTPS-only production behind Cloudflare.

## Database

The local SQLite database is created at `data/littlecode.sqlite` by default.

Override with:

```bash
SQLITE_DATABASE_PATH=/absolute/path/to/littlecode.sqlite
```

## IIS deployment shape

1. Run the Next.js app on Windows with `npm run build` and `npm start -- -p 3000`.
2. Configure IIS as a reverse proxy to `http://localhost:3000`.
3. Store `OPENAI_API_KEY`, `AUTH_SECRET`, and `SQLITE_DATABASE_PATH` as machine/user environment variables.
4. Point Cloudflare Tunnel at the IIS site, for example `http://localhost:8080`.

## Windows one-machine setup

Run PowerShell as Administrator from the repository folder:

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope Process
.\scripts\windows\setup-littlecode-iis.ps1 -AppPath "C:\LittleCode" -IisPort 8080 -OpenAIKey "your_rotated_key"
```

The script:

- Copies the app into `C:\LittleCode`.
- Installs dependencies with `npm ci`.
- Builds the Next.js app.
- Stores `OPENAI_API_KEY`, `AUTH_SECRET`, and `SQLITE_DATABASE_PATH` as machine environment variables.
- Creates a startup scheduled task named `LittleCode Next.js`. (Task name may still reference LittleCode.)
- Creates an IIS site named `LittleCode` on port `8080` that reverse proxies to `http://127.0.0.1:3000`. (Site name may still reference LittleCode.)

Before running the IIS part, install:

- IIS
- IIS URL Rewrite
- IIS Application Request Routing with proxy enabled
- Node.js LTS

After setup, point Cloudflare Tunnel to `http://localhost:8080`.

### Set missing environment variables (existing install)

Run PowerShell **as Administrator** from the project folder (or copy `scripts\windows\set-littlecode-env.ps1` to the server):

```powershell
Set-ExecutionPolicy -ExecutionPolicy Bypass -Scope Process
cd C:\LittleCode
.\scripts\windows\set-littlecode-env.ps1
```

This **does not change** `OPENAI_API_KEY` or `AUTH_SECRET` if they are already set. Use `-HttpsCookies` when the site is served over HTTPS (for example behind Cloudflare). Use `-Force` to refresh non-secret variables (models, image endpoints, paths). Use `-SetOpenAIKey` only when you intentionally want to replace the API key. Use `-DisableImageGeneration` to turn off diagram generation.

Restart the scheduled task after running:

```powershell
Stop-ScheduledTask -TaskName "LittleCode Next.js"
Start-ScheduledTask -TaskName "LittleCode Next.js"
```

Example Cloudflare Tunnel commands on Windows:

```powershell
cloudflared tunnel login
cloudflared tunnel create littlecode
cloudflared tunnel route dns littlecode littlecode.yourdomain.com
cloudflared tunnel run littlecode
```

Use `scripts\windows\cloudflared-littlecode.yml.template` if you prefer a config file based tunnel.

