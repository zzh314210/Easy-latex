"use client";

import React, { useState, useRef } from "react";

// =====================================
// 关键逻辑：直接使用根路径代理
// =====================================
const BACKEND_BASE = "/texlive-api";

function classNames(...classes: (string | boolean | undefined | null)[]) {
  return classes.filter(Boolean).join(" ");
}

const Icons = {
  Upload: () => (
    <svg className="w-10 h-10 text-cyan-300" viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path
        d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12 3v13m0-13 4 4m-4-4-4 4"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  Dot: () => (
    <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 mr-2 shadow-[0_0_12px_rgba(16,185,129,0.8)]" />
  ),
  SuccessCheck: () => (
    <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center border border-emerald-500/50 mb-4 shadow-[0_0_20px_rgba(16,185,129,0.4)]">
      <svg className="w-8 h-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
      </svg>
    </div>
  ),
};

type CompileStatus = "idle" | "running" | "error";

export default function TexlivePage() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [compileStatus, setCompileStatus] = useState<CompileStatus>("idle");
  const [statusText, setStatusText] = useState<string>("待编译");
  const [errorText, setErrorText] = useState<string>("");
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  // 编译引擎：xelatex / pdflatex
  const [engine, setEngine] = useState<"xelatex" | "pdflatex">("xelatex");

  // 队列信息：当前服务器上已有多少任务在跑
  const [queueMessage, setQueueMessage] = useState<string>("");

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    setCompileStatus("idle");
    setStatusText("待编译");
    setErrorText("");
    setQueueMessage("");
    setShowSuccessModal(false);
  };

  const triggerSelectFile = () => {
    if (compileStatus === "running") {
      // 编译中禁止更换文件
      return;
    }
    fileInputRef.current?.click();
  };

  const handleCompile = async () => {
    if (!selectedFile) {
      setCompileStatus("error");
      setStatusText("编译失败");
      setErrorText("请先选择一个 .zip / .rar 压缩包。");
      return;
    }

    setCompileStatus("running");
    setStatusText("编译中… 这可能需要 1-2 分钟，请耐心等待。");
    setErrorText("");
    setQueueMessage("");
    setShowSuccessModal(false);

    // 在真正发起编译前，先看一下当前服务器上有多少任务在跑
    try {
      const queueRes = await fetch(`${BACKEND_BASE}/queue`);
      if (queueRes.ok) {
        const data = (await queueRes.json()) as { running_jobs?: number };
        const running = typeof data.running_jobs === "number" ? data.running_jobs : 0;
        if (running > 0) {
          setQueueMessage(
            `当前服务器上已有 ${running} 个编译任务在运行，你的任务将自动排队并依次执行。`
          );
        } else {
          setQueueMessage("");
        }
      }
    } catch (e) {
      console.warn("fetch queue info failed:", e);
    }

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      // 传给后端的 engine，保持与后端 Form 字段一致
      formData.append("engine", engine);

      const res = await fetch(`${BACKEND_BASE}/compile`, {
        method: "POST",
        body: formData,
      });

      const contentType = res.headers.get("content-type") || "";

      if (!res.ok) {
        // 后端报错时，我们只给用户展示一条友好的提示，
        // 具体的报错信息在控制台里看。
        let backendDetail = "";
        try {
          if (contentType.includes("application/json")) {
            const data = await res.json();
            backendDetail =
              typeof data === "string" ? data : data.detail || JSON.stringify(data);
          } else {
            backendDetail = await res.text();
          }
        } catch {
          // ignore
        }
        console.error("compile failed:", res.status, backendDetail);

        throw new Error(
          "编译失败，请检查：\n1）编译方式（如 XeLaTeX / pdfLaTeX）是否适合你的模板；\n2）源文件在本地是否可以正常完整编译。"
        );
      }

      if (contentType.includes("application/pdf")) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;

        const baseName = selectedFile.name.replace(/\.(zip|rar)$/i, "") || "main";
        a.download = `${baseName}.pdf`;

        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);

        setCompileStatus("idle");
        setStatusText("编译成功！");
        setQueueMessage("");
        setShowSuccessModal(true);
        return;
      } else {
        const text = await res.text();
        throw new Error(`返回内容类型异常（${contentType}），内容：${text.slice(0, 500)}`);
      }
    } catch (err: any) {
      console.error("compile error:", err);
      setCompileStatus("error");
      setStatusText("编译失败");
      setQueueMessage("");
      setErrorText(
        err?.message
          ? String(err.message)
          : "编译请求失败，请稍后重试，或联系管理员检查后端服务。"
      );
    }
  };

  const isRunning = compileStatus === "running";

  // 顶部右上角的小状态文字
  const headerStatusLabel =
    compileStatus === "error"
      ? "出错了"
      : isRunning
      ? "正在编译"
      : statusText === "编译成功！"
      ? "已完成"
      : "待编译";

  return (
    <div className="relative min-h-screen w-full bg-gradient-to-br from-[#050816] via-[#020617] to-[#020617] text-slate-100 flex items-center justify-center overflow-hidden">
      {/* 编译成功弹窗 (Modal) */}
      {showSuccessModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center px-4 bg-black/60 backdrop-blur-sm transition-all">
          <div className="w-full max-w-sm bg-slate-900 border border-emerald-500/30 rounded-3xl p-8 shadow-[0_20px_50px_rgba(0,0,0,0.5)] flex flex-col items-center text-center animate-in fade-in zoom-in duration-300">
            <Icons.SuccessCheck />
            <h3 className="text-xl font-bold text-white mb-2">编译成功</h3>
            <p className="text-slate-300 text-sm mb-6 leading-relaxed">
              您的 PDF 文档已生成并开始下载。
              <br />
              如果浏览器拦截下载，请在右上角允许本站下载文件。
            </p>
            <button
              onClick={() => setShowSuccessModal(false)}
              className="w-full py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-bold rounded-xl transition-colors shadow-lg shadow-emerald-500/20"
            >
              我知道了
            </button>
          </div>
        </div>
      )}

      <div className="max-w-7xl w-full px-10 py-12 flex flex-col lg:flex-row items-start justify-between gap-12 relative z-10">
        {/* 左侧文案区 */}
        <div className="flex-1 min-w-0">
          <div className="mb-10 block">
            <div className="text-5xl md:text-6xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-white via-slate-100 to-slate-400 italic uppercase leading-tight break-words">
              FUDAN ICS GROUP
            </div>
          </div>

          <div className="inline-flex items-center px-4 py-1 rounded-full bg-sky-500/10 border border-sky-500/40 text-xs tracking-wide text-sky-200 mb-6">
            <span className="w-2 h-2 rounded-full bg-sky-400 mr-2 shadow-[0_0_10px_rgba(56,189,248,0.9)]" />
            一键 LaTeX 全文编译 · 学术写作加速器
          </div>

          <h1 className="text-4xl font-semibold tracking-tight mb-4">LaTeX 免费在线编译</h1>

          <p className="text-lg text-slate-200 mb-5 leading-relaxed">
            <span className="text-cyan-300 font-semibold mx-1">无编译时长限制</span>，上传 LaTeX 源文件压缩包，获取编译结果。
          </p>

          <p className="text-base text-slate-300 leading-relaxed mb-2">
            提供 <span className="font-semibold text-sky-200 mx-1">一次性全文编译</span>，不支持在线修改。
            <span className="font-semibold text-sky-200 mx-1">建议在 Overleaf 中逐章调试</span>，确保每章都可以独立编译通过后，
            下载完整项目源文件（RAR/ZIP）并在此进行一键全文编译。
          </p>

          <p className="text-sm text-slate-400 mt-6 leading-relaxed max-w-lg">
            隐私声明：编译完成后，
            <span className="font-semibold text-slate-100 mx-1">
              不会在服务器上保留任何源文件或生成的中间文件，你的元数据不会被存储，编译完成后立刻清空，
            </span>
            仅在本次请求中向你返回 main.pdf。
          </p>
        </div>

        {/* 右侧上传卡片 */}
        <div className="w-full lg:w-[420px] shrink-0">
          <div className="rounded-3xl bg-slate-900/70 border border-cyan-500/20 shadow-[0_18px_45px_rgba(15,23,42,0.85)] overflow-hidden backdrop-blur-xl">
            <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
              <div>
                <div className="text-xs tracking-[0.22em] text-slate-400 mb-1">LATEX PROJECT</div>
                <div className="text-sm text-slate-200">上传压缩包并编译</div>
              </div>
              <div className="flex items-center text-xs text-emerald-300">
                <Icons.Dot />
                {headerStatusLabel}
              </div>
            </div>

            <div className="px-6 pt-6 pb-2">
              <div
                className={classNames(
                  "border border-cyan-500/30 bg-slate-900/70 rounded-2xl px-6 py-6 text-center mb-4 transition-colors group",
                  isRunning
                    ? "cursor-not-allowed opacity-70"
                    : "cursor-pointer hover:bg-slate-800/50"
                )}
                onClick={triggerSelectFile}
              >
                <div className="mb-3 flex justify-center transition-transform group-hover:scale-110">
                  <div className="w-16 h-16 rounded-full bg-cyan-500/10 flex items-center justify-center border border-cyan-400/40 shadow-[0_0_25px_rgba(34,211,238,0.6)]">
                    <Icons.Upload />
                  </div>
                </div>
                <button
                  type="button"
                  className="text-base font-medium text-sky-100 group-hover:text-sky-300"
                  disabled={isRunning}
                >
                  点击上传 LaTeX 源文件压缩包
                </button>
                <p className="mt-2 text-xs text-slate-400">
                  支持 <span className="font-mono text-slate-200">.rar</span> /{" "}
                  <span className="font-mono text-slate-200">.zip</span>
                </p>

                <div className="mt-4 inline-flex items-center px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-400/50 text-[11px] text-emerald-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-2 shadow-[0_0_10px_rgba(16,185,129,0.9)]" />
                  源文件不被存储
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".zip,.rar"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </div>

              <div className="mt-4 text-xs text-slate-300 space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-400">当前选择：</span>
                  <span className="max-w-[240px] truncate text-slate-100 text-right">
                    {selectedFile ? selectedFile.name : "尚未选择文件"}
                  </span>
                </div>

                {/* 编译方式选择 */}
                <div className="flex justify-between items-center gap-4">
                  <span className="text-slate-400 whitespace-nowrap">编译方式：</span>
                  <select
                    value={engine}
                    onChange={(e) =>
                      setEngine(e.target.value === "pdflatex" ? "pdflatex" : "xelatex")
                    }
                    disabled={isRunning}
                    className="ml-auto text-right text-slate-100 bg-slate-800/80 border border-slate-600/70 rounded-md px-2 py-1 text-[11px] focus:outline-none focus:ring-1 focus:ring-cyan-400"
                  >
                    <option value="xelatex">XeLaTeX（默认，适合中文）</option>
                    <option value="pdflatex">pdfLaTeX</option>
                  </select>
                </div>

                <div className="flex justify-between gap-4">
                  <span className="text-slate-400 whitespace-nowrap">编译状态：</span>
                  <span
                    className={classNames(
                      "text-right font-medium text-wrap",
                      statusText === "编译成功！" && "text-emerald-400",
                      isRunning && "text-sky-300",
                      compileStatus === "error" && "text-rose-400"
                    )}
                  >
                    {statusText}
                  </span>
                </div>

                {queueMessage && (
                  <div className="mt-1 text-[11px] text-slate-400 text-right">{queueMessage}</div>
                )}
              </div>

              {errorText && (
                <div className="mt-3 text-[11px] text-rose-400 bg-rose-500/10 border border-rose-400/40 rounded-xl px-3 py-2 max-h-32 overflow-y-auto whitespace-pre-wrap text-left">
                  {errorText}
                </div>
              )}
            </div>

            <div className="px-6 pb-5 pt-2">
              <button
                type="button"
                onClick={handleCompile}
                disabled={isRunning}
                className={classNames(
                  "w-full h-11 rounded-full text-sm font-medium tracking-wide shadow-[0_10px_30px_rgba(6,182,212,0.35)] transition disabled:opacity-60 disabled:cursor-not-allowed",
                  "bg-gradient-to-r from-cyan-500 to-sky-500 hover:from-cyan-400 hover:to-sky-400"
                )}
              >
                {isRunning ? "正在编译…" : "开始编译"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 左下角版权声明 */}
      <div className="absolute left-6 bottom-4 text-[11px] leading-snug text-slate-500 space-y-0.5">
        <p>© 2025 ZZH · School of Future Information, Fudan University</p>
        <p>Powered by the open-source TeX Live distribution.</p>
      </div>
    </div>
  );
}
