# Windows auto-start and scheduled backups

Quizzora production (`quizzora.org`) and staging (`test.quizzora.org`) run as **long-lived Node processes** behind **IIS reverse proxy**. After a server reboot, Task Scheduler starts both apps; IIS (`W3SVC`) starts with Windows.

## Scheduled tasks

| Task name | Trigger | Runs as | Script | Backend port |
|-----------|---------|---------|--------|--------------|
| `LittleCode Next.js` | **At system startup** | `SYSTEM` (highest available) | `C:\LittleCode\start-littlecode.ps1` | `127.0.0.1:3000` |
| `LittleCode Test Next.js` | **At system startup** | `SYSTEM` | `C:\LittleCode-test\start-littlecode-test.ps1` | `127.0.0.1:3001` |
| `LittleCode Prod DB Backup` | **Daily 2:00 AM** (local) | `SYSTEM` | `C:\LittleCode\scripts\backup-prod-db.ps1` | N/A |
| `Quizzora Uptime Monitor` | **Every 5 minutes** | `SYSTEM` | `C:\LittleCode\scripts\run-uptime-check.ps1` | emails on `/api/health` failure |
| `Onyx Ensure Standard Edition` | **At system startup** (+60s delay) | `SYSTEM` | `C:\Onyx\scripts\ensure-standard-edition.ps1` | Onyx CE Standard on `127.0.0.1:3001` |

Node app tasks restart up to **3 times** at **1-minute** intervals if the start script exits unexpectedly. Logs: `C:\LittleCode\logs\next.log` and `C:\LittleCode-test\logs\next.log`.

**Staging database:** there is no scheduled test DB backup; staging data is disposable. Production backups only ï¿½ see [BACKUP.md](./BACKUP.md).

## IIS

| Site | Hostnames | App pool |
|------|-----------|----------|
| `LittleCode` | `quizzora.org` (and legacy bindings) | `LittleCode` |
| `LittleCode-Test` | `test.quizzora.org` | `DefaultAppPool` |

The ensure script sets app pool **startMode** to `AlwaysRunning` and confirms sites are started. The **World Wide Web Publishing Service** (`W3SVC`) should be **Automatic**.

## Register or repair after rebuild

Run **Administrator PowerShell**:

```powershell
powershell -ExecutionPolicy Bypass -File C:\LittleCode\scripts\ensure-windows-services.ps1
```

Optional: apply tasks and start Node immediately (without reboot):

```powershell
powershell -ExecutionPolicy Bypass -File C:\LittleCode\scripts\ensure-windows-services.ps1 -StartTasksNow
```

Skip IIS changes:

```powershell
powershell -ExecutionPolicy Bypass -File C:\LittleCode\scripts\ensure-windows-services.ps1 -SkipIis
```

## Verify (no reboot required)

1. **Tasks**

   ```powershell
   schtasks /Query /TN "LittleCode Next.js" /V /FO LIST
   schtasks /Query /TN "LittleCode Test Next.js" /V /FO LIST
   schtasks /Query /TN "LittleCode Prod DB Backup" /V /FO LIST
   schtasks /Query /TN "Quizzora Uptime Monitor" /V /FO LIST
   schtasks /Query /TN "Onyx Ensure Standard Edition" /V /FO LIST
   ```

   Expect **Schedule Type: At system start up** for the two Node tasks, **Daily** at **2:00 AM** for backup, and a **5-minute** repetition for the uptime monitor.

2. **Local health**

   ```powershell
   Invoke-WebRequest http://127.0.0.1:3000/api/health -UseBasicParsing
   Invoke-WebRequest http://127.0.0.1:3001/api/health -UseBasicParsing
   ```

3. **Public URLs**

   - `https://quizzora.org/api/health`
   - `https://test.quizzora.org/api/health`

4. **Manual start** (same as tasks run on boot):

   ```powershell
   Start-ScheduledTask -TaskName "LittleCode Next.js"
   Start-ScheduledTask -TaskName "LittleCode Test Next.js"
   ```


## Staging intentionally stopped

Staging can be taken offline without affecting production (LittleCode Next.js on port 3000, IIS site LittleCode).

**Stop staging (Node + no auto-start on boot):**

`powershell
schtasks /End /TN "LittleCode Test Next.js"
schtasks /Change /TN "LittleCode Test Next.js" /DISABLE
Stop-Website -Name "LittleCode-Test"
`

**Start staging again:**

`powershell
schtasks /Change /TN "LittleCode Test Next.js" /ENABLE
Start-ScheduledTask -TaskName "LittleCode Test Next.js"
Start-Website -Name "LittleCode-Test"
`

Verify: http://127.0.0.1:3001/api/health should return 200; https://test.quizzora.org/api/health when IIS is started.

## Ollama (Study Coach local LLM)

Study Coach uses Ollama on this host (`llama3.2:3b-gpu` chat with 4K context, `nomic-embed-text` embed). Ollama runs from the **user Startup folder** (tray app), not Task Scheduler.

### Ollama Cloud (optional)

For larger or tool-capable cloud models (e.g. web search via Ollamaâ€™s `web_search` / `web_fetch` tools), add to **`.env.local` only**:

| Variable | Example | Effect |
|----------|---------|--------|
| `OLLAMA_API_KEY` | *(from ollama.com/settings/keys)* | Bearer auth for `https://ollama.com` |
| `STUDY_COACH_USE_OLLAMA_CLOUD` | `true` | Study Coach chat tries cloud first |
| `OLLAMA_CLOUD_BASE_URL` | `https://ollama.com` | Cloud API host (default) |
| `STUDY_COACH_OLLAMA_CLOUD_MODEL` | `qwen3-next:80b` | Cloud chat model (tool-capable) |

Embeddings stay **local** (`OLLAMA_EMBED_BASE_URL` or `127.0.0.1:11434`). If cloud chat fails, Study Coach falls back to `STUDY_COACH_OLLAMA_MODEL` on the local GPU.

Verify cloud + local:

```powershell
.\scripts\check-ollama.ps1
```

**Local-only:** omit `STUDY_COACH_USE_OLLAMA_CLOUD` or set it `false`.  
**Cloud-first:** set `STUDY_COACH_USE_OLLAMA_CLOUD=true` and keep local Ollama running for RAG embeddings and fallback chat.

**Avoid cold model loads (~87s):** set a user environment variable before starting Ollama:

| Variable | Value | Effect |
|----------|-------|--------|
| `OLLAMA_KEEP_ALIVE` | `30m` | Keep models in memory 30 minutes after last use (Ollama default is `5m`) |

1. Quit Ollama from the system tray.
2. Settings â†’ search **environment variables** â†’ **Edit environment variables for your account** â†’ New â†’ `OLLAMA_KEEP_ALIVE` = `30m` â†’ OK.
3. Start Ollama from the Start menu (or reboot; Startup shortcut relaunches it).

Use `-1` instead of `30m` to keep models loaded indefinitely (uses more RAM/VRAM).

**Pre-warm after boot** (loads chat + embed models before first student request):

```powershell
powershell -ExecutionPolicy Bypass -File C:\LittleCode\scripts\check-ollama.ps1 -PreWarm
```

Production startup (`start-littlecode.ps1`) runs this in the background when the `LittleCode Next.js` task starts.

**Verify loaded models:**

```powershell
Invoke-RestMethod http://127.0.0.1:11434/api/ps
ollama ps   # PROCESSOR column should show 100% GPU, not 100% CPU
```

**GPU acceleration (NVIDIA):** Ollama 0.30.8+ requires driver **570+** for CUDA on Pascal GPUs (GTX 1050 Ti, etc.). If `ollama ps` shows `100% CPU` and `/api/ps` has `size_vram: 0`, either update the NVIDIA driver and reboot, or set these **user** environment variables and restart Ollama from the tray:

| Variable | Value | Effect |
|----------|-------|--------|
| `OLLAMA_LLM_LIBRARY` | `vulkan` | Use Vulkan backend on GTX 1050 Ti when CUDA driver is too old |
| `OLLAMA_VULKAN` | `1` | Keep Vulkan enabled (default in 0.30.x) |

Check GPU with `nvidia-smi` and run `.\scripts\check-ollama.ps1 -PreWarm` to confirm `100% GPU` and non-zero `size_vram`.

**If `nvidia-smi` fails** after staging driver 591, reboot to activate the new driver. Until then Ollama stays on CPU even with `OLLAMA_VULKAN=1`.

**Restart Ollama after setting GPU env:**

```powershell
.\scripts\check-ollama.ps1 -Restart -PreWarm
```

**Onyx Study Coach latency:** when a subtopic is scoped, set `STUDY_COACH_ONYX_SKIP_SEARCH=auto` (default) in `.env.local` so LittleCode injects the local curriculum doc and skips Onyx `internal_search` (saves OpenSearch + embed + tool round-trip). See `.env.example`.

On **4 GB VRAM**, use `llama3.2:3b-gpu` (same weights, `num_ctx 4096`) instead of stock `llama3.2:3b` (131K context spills to CPU). Create once: `ollama create llama3.2:3b-gpu -f Modelfile` with `FROM llama3.2:3b` and `PARAMETER num_ctx 4096`. Set `STUDY_COACH_OLLAMA_MODEL=llama3.2:3b-gpu` in `.env.local`.


## Dual NVIDIA GPUs (GTX 1050 Ti + RTX 2060)

This host can run **GTX 1050 Ti** (display, 4 GB) and a physical **RTX 2060** (6 GB, Turing) together. They are **not** the phantom RTX 5060 Ti (`DEV_2D04`); the 2060 is `DEV_1E89` (often `SUBSYS_134D10DE`).

| Check | Command |
|-------|---------|
| Both in driver | `nvidia-smi -L` (expect two lines) |
| PnP health | `Get-PnpDevice -Class Display` (both NVIDIA, Status OK) |
| Phantom only | `.\scripts\remove-phantom-5060.ps1` (5060 only; never removes 2060) |

**Driver:** Use one **591.86+** WHQL package for **both** cards. A partial install (591 user-mode on the 2060 while the kernel still runs 560.x) shows Problem code **31** on the 2060 and only one GPU in `nvidia-smi`. Stage with `stage-nvidia-591.ps1`, then **reboot** to activate. After reboot:

```powershell
powershell -ExecutionPolicy Bypass -File C:\LittleCode\scripts\post-reboot-recover.ps1
```

**Ollama on the 2060:** After both GPUs appear in `nvidia-smi`:

```powershell
powershell -ExecutionPolicy Bypass -File C:\LittleCode\scripts\configure-dual-gpu-ollama.ps1
powershell -ExecutionPolicy Bypass -File C:\LittleCode\scripts\configure-dual-gpu-ollama.ps1 -ApplyModelfile
.\scripts\check-ollama.ps1 -Restart -PreWarm
```

This sets User `CUDA_VISIBLE_DEVICES` to the 2060 index, clears `OLLAMA_LLM_LIBRARY=vulkan` when driver ≥ 570, and optionally creates `llama3.2:3b-gpu-6g` with `num_ctx 8192`. Point `.env.local` at `STUDY_COACH_OLLAMA_MODEL=llama3.2:3b-gpu-6g` and `STUDY_COACH_OLLAMA_NUM_CTX=8192` for local fallback (Onyx Docker still uses the same Ollama HTTP endpoint).

Verify:

```powershell
nvidia-smi -L
ollama ps
Invoke-RestMethod http://127.0.0.1:11434/api/ps   # size_vram > 0, PROCESSOR shows GPU
```
## Post-reboot recovery (NVIDIA driver upgrade)

After a planned reboot (e.g. NVIDIA 591.86 clean install), run once or rely on the startup task:

```powershell
powershell -ExecutionPolicy Bypass -File C:\LittleCode\scripts\post-reboot-recover.ps1
```

This verifies `nvidia-smi` (591+), pre-warms Ollama, ensures `LittleCode Next.js` is running, resumes curriculum generate/embed if incomplete, and runs `embed-question-bank.mjs` for pending items.

**Register startup task** (Administrator):

```powershell
powershell -ExecutionPolicy Bypass -File C:\LittleCode\scripts\register-post-reboot-recover.ps1
```

**Pre-reboot snapshot** (non-disruptive):

```powershell
powershell -ExecutionPolicy Bypass -File C:\LittleCode\scripts\_maintenance-snapshot.ps1
```

Writes `scripts/_maintenance-state.json` (PIDs, ports, curriculum/QB counts, GPU state).

**NVIDIA 591.86 passive staging** (no reboot until you choose):

```powershell
powershell -ExecutionPolicy Bypass -File C:\LittleCode\scripts\stage-nvidia-591.ps1
```

**Remove phantom RTX 5060 Ti** (keeps GTX 1050 Ti; Administrator):

```powershell
powershell -ExecutionPolicy Bypass -File C:\LittleCode\scripts\remove-phantom-5060.ps1
```

## Related docs

- [BACKUP.md](./BACKUP.md) ï¿½ backup script, retention, restore notes
- [TEST-ENVIRONMENT.md](./TEST-ENVIRONMENT.md) ï¿½ staging layout and one-time setup
- [UPTIME-MONITORING.md](./UPTIME-MONITORING.md) ï¿½ email alerts when the site is down
- [MONITORING.md](./MONITORING.md) ï¿½ health checks and incident response
