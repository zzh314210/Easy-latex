# ========= 统一使用你已经验证成功的 texlive 镜像 =========
FROM texlive/texlive:latest

# ============================
# 1. 只用阿里云的 Debian 源（完全照你原来的）
# ============================
RUN set -eux; \
    # 干掉可能自带的其他源配置（包含 deb.debian.org 那些）
    rm -f /etc/apt/sources.list.d/* || true; \
    mkdir -p /etc/apt; \
    # 写入阿里云源
    printf '%s\n' \
      'deb http://mirrors.aliyun.com/debian testing main contrib non-free non-free-firmware' \
      'deb http://mirrors.aliyun.com/debian-security testing-security main contrib non-free non-free-firmware' \
      'deb http://mirrors.aliyun.com/debian testing-updates main contrib non-free non-free-firmware' \
      > /etc/apt/sources.list; \
    apt-get clean; \
    apt-get update; \
    # 在你原来基础上，只是多装了 nodejs/npm/nginx/curl
    apt-get install -y --no-install-recommends \
        python3 \
        python3-pip \
        unzip \
        p7zip-full \
        unrar \
        nodejs \
        npm \
        nginx \
        curl; \
    rm -rf /var/lib/apt/lists/*

# ============================
# 2. pip 换阿里云源（原样保留）
# ============================
RUN pip3 config set global.index-url https://mirrors.aliyun.com/pypi/simple/

# ============================
# 3. 安装 FastAPI / Uvicorn 等依赖（原样保留）
# ============================
RUN pip3 install --break-system-packages --no-cache-dir fastapi uvicorn[standard] python-multipart

# ============================
# 4. Node 换淘宝镜像（加速 npm）
# ============================
RUN npm config set registry https://registry.npmmirror.com

# ============================
# 5. 拷贝代码
#    假定目录结构：
#    .
#      backend/   # 有 main.py
#      frontend/  # Next.js 项目
#      Dockerfile
#      nginx.conf
#      entrypoint.sh
# ============================
WORKDIR /app

COPY backend /app/backend
COPY frontend /app/frontend

# ============================
# 6. 构建前端（Next.js）
# ============================
WORKDIR /app/frontend
RUN npm install && npm run build

# ============================
# 7. 创建编译工作目录
# ============================
WORKDIR /app
RUN mkdir -p /jobs
VOLUME ["/jobs"]

ENV PYTHONUNBUFFERED=1

# ============================
# 8. 拷贝 nginx 配置 + 启动脚本
# ============================
COPY nginx.conf /etc/nginx/conf.d/texlive.conf
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# 对外只暴露一个端口：9000
EXPOSE 9000

CMD ["/entrypoint.sh"]
