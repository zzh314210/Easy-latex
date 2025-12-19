# Free LaTeX Online Compiler

Upload your LaTeX project as a `.zip` / `.rar` archive and get a compiled PDF (`main.pdf`) back — powered by a full TeX Live environment running in Docker.

This project bundles:

- **TeX Live** (via `texlive/texlive:latest` base image)
- **Backend**: FastAPI + Uvicorn
- **Frontend**: Next.js 16 (React) single-page UI
- **In-container Nginx**: routes `/texlive` (frontend) and `/texlive-api` (backend) and exposes a single port `9000`

You can run everything with a single `docker compose up` command.

---

## Features

- Upload `.zip` / `.rar` LaTeX projects
- Choose compile engine: **XeLaTeX** (default, good for CJK) or **pdfLaTeX**
- One-shot full-project compilation via `latexmk`
- Shows “compiling / queue / success / error” status
- Returns the compiled PDF for direct download
- Temporary build files are not persisted (no long-term storage of user data)
- Single Docker image, single exposed port

---

## Directory Structure

```text
.
├── backend/           # FastAPI server (main.py)
│   └── main.py
├── frontend/          # Next.js 16 app (app/page.tsx etc.)
│   ├── app/
│   └── next.config.ts
├── Dockerfile         # Build TeX Live + backend + frontend + nginx into one image
├── docker-compose.yml # Run the image, expose 9000
├── nginx.conf         # In-container nginx, routes /texlive & /texlive-api
├── entrypoint.sh      # Start backend + frontend + nginx in the container
├── .gitignore
├── .dockerignore
└── README.md
The host machine may also run an extra Nginx for HTTPS / domain routing (e.g. free-latex.nextaihub.online), but that is optional and not required for local use.

Prerequisites
Docker

Docker Compose v2+

On Linux:

bash
复制代码
docker --version
docker compose version
If both commands work, you are ready.

Quick Start (Local)
Clone the repository:

bash
复制代码
git clone https://github.com/<your-username>/<your-repo>.git
cd <your-repo>
Build and start the all-in-one container:

bash
复制代码
docker compose up -d --build
Open your browser:

Frontend: http://localhost:9000/texlive

API health check (optional): http://localhost:9000/texlive-api/health

Upload a .zip / .rar LaTeX project and click “开始编译”.

How It Works
The container starts:

FastAPI backend on 0.0.0.0:9999

Next.js frontend on 0.0.0.0:3001

Nginx inside the container on 0.0.0.0:9000

Nginx routes:

/texlive → frontend (Next.js)

/texlive-api → backend (FastAPI)

docker-compose.yml exposes 9000:9000 on the host.

If you only want to run locally, you only need to access http://localhost:9000/texlive.

Production Notes
For a real deployment (cloud VM):

Expose port 9000 or put a reverse proxy in front (recommended):

Nginx / Caddy on the host

Proxy https://your-domain → http://127.0.0.1:9000

Use Let's Encrypt / Certbot or your cloud provider to issue TLS certificates.

The jobs/ volume is used for temporary compilation output and can be mounted from the host if you want to inspect logs or artifacts.

Mirrors / Network Environment
The Dockerfile is optimized for users in mainland China:

APT sources are set to Aliyun mirrors

pip default index is set to Aliyun

npm registry is set to npmmirror.com

If you are outside mainland China and these mirrors are slow/unreliable, you can:

Switch mirrors.aliyun.com back to deb.debian.org / security.debian.org

Remove or comment out the pip3 config set ... and npm config set ... lines

The rest of the setup remains the same.

Privacy & Data
Uploaded projects are only used for compilation within the current request.

Intermediate files are not kept permanently.

The container cleans temporary directories after each compile.

(If you modify the backend to store logs or history, please update this section accordingly.)

