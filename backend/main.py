import os
import uuid
import shutil
import subprocess
from pathlib import Path
import asyncio
from typing import Optional

from fastapi import FastAPI, UploadFile, File, HTTPException, BackgroundTasks, Form
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="TexLive Compile API")

# 前后端同域走 nginx，其实不用 CORS，但加上也无害
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def _ensure_jobs_root() -> Path:
    root = Path("/jobs")
    root.mkdir(parents=True, exist_ok=True)
    return root


def cleanup_temp_dir(path: Path):
    """
    后台清理任务：在文件响应结束后删除临时工作目录
    """
    if path.exists():
        try:
            shutil.rmtree(path, ignore_errors=True)
            print(f"[cleanup] Successfully cleaned up work directory: {path}")
        except Exception as e:
            print(f"[cleanup] Error during cleanup: {e}")


# =========================
# 简单的“并发计数器”（非严格队列）
# =========================
job_lock = asyncio.Lock()
current_jobs: int = 0


async def _inc_jobs() -> int:
    """增加当前运行中的任务数，并返回增加后的数值。"""
    global current_jobs
    async with job_lock:
        current_jobs += 1
        return current_jobs


async def _dec_jobs() -> None:
    """减少当前运行中的任务数。"""
    global current_jobs
    async with job_lock:
        current_jobs = max(0, current_jobs - 1)


@app.get("/queue")
async def queue_status():
    """
    返回当前正在执行的编译任务数量。
    注意：这是一个非常简单的统计，只做展示用。
    """
    return {"running_jobs": current_jobs}


@app.get("/health")
async def health():
    return "ok"


@app.post("/compile")
async def compile_latex(
    background_tasks: BackgroundTasks,
    engine: str = Form("xelatex"),
    file: UploadFile = File(...),
):
    """
    接收一个 .zip/.rar 压缩包并编译。
    - engine: 编译引擎，前端通过表单传入，例如 xelatex / pdflatex / lualatex
    - file:   压缩包文件
    使用 BackgroundTasks 确保 Response 发送完成后才删除文件。
    """

    # 记录当前任务进入时的并发数
    job_index = await _inc_jobs()
    print(f"[compile] New job joined. Running jobs = {job_index}, engine={engine}")

    # 允许的编译引擎
    allowed_engines = {"xelatex", "pdflatex", "lualatex"}
    engine = (engine or "xelatex").lower()
    if engine not in allowed_engines:
        # 不合法的引擎，直接回退到 xelatex
        print(f"[compile] Invalid engine '{engine}', fallback to 'xelatex'")
        engine = "xelatex"

    jobs_root = _ensure_jobs_root()
    job_id = str(uuid.uuid4())
    work_dir = jobs_root / job_id
    work_dir.mkdir(parents=True, exist_ok=True)

    upload_path = work_dir / (file.filename or "upload.bin")

    try:
        # ==============
        # 1. 参数检查
        # ==============
        if not file.filename:
            raise HTTPException(status_code=400, detail="文件名为空")

        filename_lower = file.filename.lower()
        if not (filename_lower.endswith(".zip") or filename_lower.endswith(".rar")):
            raise HTTPException(status_code=400, detail="仅支持 .zip / .rar 压缩包")

        # ==============
        # 2. 保存上传文件
        # ==============
        print(f"[compile] Saving upload to {upload_path}")
        with upload_path.open("wb") as f:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                f.write(chunk)

        # ==============
        # 3. 解压缩
        # ==============
        print(f"[compile] Extracting {upload_path}")
        if filename_lower.endswith(".zip"):
            import zipfile

            try:
                with zipfile.ZipFile(upload_path, "r") as zf:
                    zf.extractall(work_dir)
            except Exception as e:
                background_tasks.add_task(cleanup_temp_dir, work_dir)
                raise HTTPException(status_code=400, detail=f"解压 zip 失败：{e}")
        else:
            # .rar
            try:
                proc = subprocess.run(
                    ["unrar", "x", "-o+", str(upload_path), str(work_dir)],
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    text=True,
                )
                if proc.returncode != 0:
                    background_tasks.add_task(cleanup_temp_dir, work_dir)
                    raise HTTPException(
                        status_code=400,
                        detail=(
                            f"解压 rar 失败，unrar 返回码 {proc.returncode}："
                            f"\n{proc.stdout[-2000:]}"
                        ),
                    )
            except FileNotFoundError:
                background_tasks.add_task(cleanup_temp_dir, work_dir)
                raise HTTPException(status_code=500, detail="服务器缺少 unrar 命令。")

        # ==============
        # 4. 查找入口文件
        # ==============
        print(f"[compile] Looking for main.tex in {work_dir}")
        main_tex_path: Optional[Path] = None
        for root, dirs, files in os.walk(work_dir):
            if "main.tex" in files:
                main_tex_path = Path(root) / "main.tex"
                break

        if main_tex_path is None:
            tex_files = [p for p in work_dir.rglob("*.tex")]
            if len(tex_files) == 1:
                main_tex_path = tex_files[0]

        if main_tex_path is None:
            background_tasks.add_task(cleanup_temp_dir, work_dir)
            raise HTTPException(status_code=400, detail="未找到 main.tex 或唯一的 .tex 文件。")

        compile_dir = main_tex_path.parent
        tex_name = main_tex_path.name
        print(f"[compile] Using main tex: {tex_name} in {compile_dir}")

        # ==============
        # 5. 调用 latexmk 编译
        #    根据 engine 选择 -xelatex / -pdflatex / -lualatex
        #    并显式关闭 shell-escape
        # ==============
        engine_flag = f"-{engine}"
        cmd = [
            "latexmk",
            engine_flag,
            "-interaction=nonstopmode",
            "-halt-on-error",
            "-shell-escape=0",  # 显式禁用 shell-escape
            tex_name,
        ]
        print(f"[compile] Running command: {' '.join(cmd)}")

        proc = subprocess.run(
            cmd,
            cwd=str(compile_dir),
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
        )

        if proc.returncode != 0:
            log_tail = proc.stdout[-4000:] if proc.stdout else ""
            print(f"[compile] LaTeX compile failed, return code={proc.returncode}")
            print(f"[compile] Log tail:\n{log_tail}")
            background_tasks.add_task(cleanup_temp_dir, work_dir)
            raise HTTPException(
                status_code=500,
                detail=(
                    "LaTeX 编译失败，请检查编译引擎（如 xelatex / pdflatex）设置，"
                    "以及源文件在本地是否可以正确编译。\n"
                    f"（部分日志片段：\n{log_tail})"
                ),
            )

        # ==============
        # 6. 找到 PDF 并准备返回
        # ==============
        pdf_path = compile_dir / "main.pdf"
        if not pdf_path.exists():
            pdf_candidates = list(compile_dir.glob("*.pdf"))
            if not pdf_candidates:
                background_tasks.add_task(cleanup_temp_dir, work_dir)
                raise HTTPException(status_code=500, detail="编译完成但未找到 PDF。")
            pdf_path = pdf_candidates[0]

        print(f"[compile] Compile success, pdf = {pdf_path}")

        # 注册后台清理任务，在发送完成后执行
        background_tasks.add_task(cleanup_temp_dir, work_dir)

        return FileResponse(
            path=str(pdf_path),
            media_type="application/pdf",
            filename=pdf_path.name,
        )

    except HTTPException:
        raise
    except Exception as e:
        print(f"[compile] Internal server error: {e}")
        background_tasks.add_task(cleanup_temp_dir, work_dir)
        raise HTTPException(status_code=500, detail=f"服务器内部错误：{e}")
    finally:
        await _dec_jobs()
        print(f"[compile] Job finished. Running jobs = {current_jobs}")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=9999)
