FROM node:22-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive \
    CHROME_PATH=/usr/bin/chromium \
    NODE_ENV=production

RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    ffmpeg \
    fonts-dejavu-core \
    fonts-liberation \
    python3 \
    python3-pip \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
COPY worker/package.json worker/package-lock.json ./worker/
RUN npm ci --omit=dev=false && npm --prefix worker ci --omit=dev=false

COPY . .
RUN npm --prefix worker run build \
    && pip3 install --no-cache-dir --break-system-packages -r worker/requirements.txt

CMD ["python3", "-u", "worker/handler.py"]
