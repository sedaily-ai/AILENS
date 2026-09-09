#!/bin/bash
set -euo pipefail

echo "=== 1. packages ==="
dnf install -y python3.11 python3.11-pip nginx >/dev/null
# Node.js 20 (for PM2) via NodeSource-equivalent dnf module on AL2023
dnf install -y nodejs npm >/dev/null 2>&1 || true
node -v || (curl -fsSL https://rpm.nodesource.com/setup_20.x | bash - >/dev/null && dnf install -y nodejs >/dev/null)
npm install -g pm2 >/dev/null

echo "=== 2. app dir + venv ==="
mkdir -p /opt/lens-cms-api
cd /opt/lens-cms-api
python3.11 -m venv venv
./venv/bin/pip install --quiet --upgrade pip
./venv/bin/pip install --quiet -r requirements.txt

echo "=== 3. nginx reverse proxy (80 -> 8000) ==="
cat > /etc/nginx/conf.d/lens-cms-api.conf <<'EOF'
server {
    listen 80 default_server;
    location /health {
        proxy_pass http://127.0.0.1:8000/health;
    }
    location /api/v2/posts {
        proxy_pass http://127.0.0.1:8000/api/v2/posts;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
EOF
systemctl enable nginx
systemctl restart nginx

echo "=== 4. pm2 start ==="
cd /opt/lens-cms-api
pm2 start ecosystem.config.js
pm2 save
pm2 startup systemd -u root --hp /root | tail -1 | bash || true

echo "=== done ==="
pm2 list
curl -s -o /dev/null -w "local health: %{http_code}\n" http://127.0.0.1:8000/health
