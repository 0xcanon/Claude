#!/bin/bash
###############################################################################
#  OpenClaw VPS Setup Script — Ubuntu 22.04 LTS
#  Sets up a fresh VPS for OpenClaw development from scratch.
#
#  Run as root (or with sudo):
#    chmod +x setup-openclaw-vps.sh && sudo ./setup-openclaw-vps.sh
###############################################################################
set -euo pipefail

# ─── Colours & helpers ───────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'
NC='\033[0m' # No Colour
info()  { echo -e "${CYAN}[INFO]${NC}  $*"; }
ok()    { echo -e "${GREEN}[ OK ]${NC}  $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
fail()  { echo -e "${RED}[FAIL]${NC}  $*"; exit 1; }

# ─── Pre-flight checks ──────────────────────────────────────────────────────
if [[ $EUID -ne 0 ]]; then
    fail "This script must be run as root.  Try: sudo $0"
fi

. /etc/os-release 2>/dev/null || true
if [[ "${VERSION_ID:-}" != "22.04" ]]; then
    warn "This script targets Ubuntu 22.04.  Detected: ${PRETTY_NAME:-unknown}."
    warn "Proceeding anyway — some steps may need adjustment."
fi

echo ""
echo "============================================================"
echo "   OpenClaw VPS Development Setup — Ubuntu 22.04"
echo "============================================================"
echo ""

###############################################################################
# 1. SYSTEM UPDATE & ESSENTIAL PACKAGES
###############################################################################
info "1/9  Updating system packages …"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get upgrade -y -qq
ok "System packages updated."

info "1/9  Installing essential packages …"
apt-get install -y -qq \
    build-essential \
    curl \
    wget \
    git \
    unzip \
    zip \
    jq \
    ca-certificates \
    gnupg \
    lsb-release \
    software-properties-common \
    apt-transport-https \
    tmux \
    htop \
    tree \
    vim \
    nano
ok "Essential packages installed."

###############################################################################
# 2. SWAP FILE (many VPS come with little RAM)
###############################################################################
info "2/9  Configuring swap …"
if swapon --show | grep -q '/swapfile'; then
    ok "Swap already active — skipping."
else
    TOTAL_RAM_KB=$(grep MemTotal /proc/meminfo | awk '{print $2}')
    if (( TOTAL_RAM_KB < 4000000 )); then
        SWAP_SIZE="2G"
    else
        SWAP_SIZE="1G"
    fi
    fallocate -l "$SWAP_SIZE" /swapfile
    chmod 600 /swapfile
    mkswap /swapfile >/dev/null
    swapon /swapfile
    if ! grep -q '/swapfile' /etc/fstab; then
        echo '/swapfile none swap sw 0 0' >> /etc/fstab
    fi
    ok "Swap created (${SWAP_SIZE})."
fi

###############################################################################
# 3. SECURITY HARDENING
###############################################################################
info "3/9  Hardening the server …"

# ── UFW firewall ──
apt-get install -y -qq ufw
ufw default deny incoming  >/dev/null 2>&1 || true
ufw default allow outgoing >/dev/null 2>&1 || true
ufw allow OpenSSH          >/dev/null 2>&1 || true
ufw allow 18789/tcp comment 'OpenClaw Gateway' >/dev/null 2>&1 || true
ufw allow 3000/tcp  comment 'OpenClaw Dashboard / Dev server' >/dev/null 2>&1 || true
ufw --force enable          >/dev/null 2>&1 || true
ok "UFW configured (SSH, 18789, 3000 open)."

# ── fail2ban ──
apt-get install -y -qq fail2ban
if [[ ! -f /etc/fail2ban/jail.local ]]; then
    cat > /etc/fail2ban/jail.local <<'JAIL'
[sshd]
enabled  = true
port     = ssh
filter   = sshd
logpath  = /var/log/auth.log
maxretry = 5
bantime  = 3600
JAIL
fi
systemctl enable fail2ban  >/dev/null 2>&1
systemctl restart fail2ban >/dev/null 2>&1
ok "fail2ban enabled."

# ── SSH hardening ──
SSHD_CONFIG="/etc/ssh/sshd_config"
if grep -q "^PermitRootLogin yes" "$SSHD_CONFIG" 2>/dev/null; then
    warn "Root login via SSH is enabled. Consider disabling it after creating a regular user."
    warn "  -> Set 'PermitRootLogin no' in $SSHD_CONFIG and restart sshd."
fi

###############################################################################
# 4. NODE.JS 22 (required by OpenClaw)
###############################################################################
info "4/9  Installing Node.js 22 …"
if command -v node &>/dev/null; then
    CURRENT_NODE=$(node --version | sed 's/v//' | cut -d. -f1)
    if (( CURRENT_NODE >= 22 )); then
        ok "Node.js $(node --version) already installed — meets requirement."
    else
        warn "Node.js $(node --version) is too old. Installing v22 …"
        apt-get remove -y nodejs npm 2>/dev/null || true
    fi
fi

if ! command -v node &>/dev/null || (( $(node --version | sed 's/v//' | cut -d. -f1) < 22 )); then
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null 2>&1
    apt-get install -y -qq nodejs
    ok "Node.js $(node --version) installed."
fi

###############################################################################
# 5. PNPM (OpenClaw's primary package manager for development)
###############################################################################
info "5/9  Installing pnpm …"
if command -v pnpm &>/dev/null; then
    ok "pnpm $(pnpm --version) already installed."
else
    npm install -g pnpm@latest >/dev/null 2>&1
    ok "pnpm $(pnpm --version) installed."
fi

###############################################################################
# 6. GO (for the OpenClaw Gateway component)
###############################################################################
info "6/9  Installing Go …"
GO_VERSION="1.23.6"
if command -v go &>/dev/null; then
    ok "Go $(go version | awk '{print $3}') already installed."
else
    GO_ARCH="amd64"
    if [[ "$(uname -m)" == "aarch64" ]]; then GO_ARCH="arm64"; fi
    GO_TAR="go${GO_VERSION}.linux-${GO_ARCH}.tar.gz"
    wget -q "https://go.dev/dl/${GO_TAR}" -O "/tmp/${GO_TAR}"
    rm -rf /usr/local/go
    tar -C /usr/local -xzf "/tmp/${GO_TAR}"
    rm "/tmp/${GO_TAR}"

    # Make Go available system-wide
    cat > /etc/profile.d/go.sh <<'GOENV'
export PATH=$PATH:/usr/local/go/bin
export GOPATH=$HOME/go
export PATH=$PATH:$GOPATH/bin
GOENV
    export PATH=$PATH:/usr/local/go/bin
    ok "Go $(/usr/local/go/bin/go version | awk '{print $3}') installed."
fi

###############################################################################
# 7. ADDITIONAL DEV TOOLS
###############################################################################
info "7/9  Installing additional development tools …"

# ── Docker ──
if command -v docker &>/dev/null; then
    ok "Docker already installed."
else
    info "  Installing Docker …"
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | \
        gpg --dearmor -o /etc/apt/keyrings/docker.gpg 2>/dev/null
    chmod a+r /etc/apt/keyrings/docker.gpg
    echo \
      "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
      https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | \
      tee /etc/apt/sources.list.d/docker.list >/dev/null
    apt-get update -qq
    apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin
    systemctl enable docker >/dev/null 2>&1
    ok "Docker installed."
fi

# ── Git (configure default branch) ──
git config --global init.defaultBranch main 2>/dev/null || true

ok "Dev tools ready."

###############################################################################
# 8. OPENCLAW — CLONE & BUILD FROM SOURCE
###############################################################################
info "8/9  Setting up OpenClaw for development …"

OPENCLAW_DIR="/opt/openclaw"
if [[ -d "$OPENCLAW_DIR/.git" ]]; then
    ok "OpenClaw repo already cloned at $OPENCLAW_DIR."
else
    git clone https://github.com/openclaw/openclaw.git "$OPENCLAW_DIR"
    ok "OpenClaw cloned to $OPENCLAW_DIR."
fi

cd "$OPENCLAW_DIR"

info "  Running pnpm install …"
pnpm install --frozen-lockfile 2>/dev/null || pnpm install

info "  Building UI …"
pnpm ui:build 2>/dev/null || warn "ui:build step skipped (may not exist in this version)."

info "  Building OpenClaw …"
pnpm build

ok "OpenClaw built from source."

# Also install globally for CLI access
info "  Installing openclaw CLI globally …"
npm install -g openclaw@latest 2>/dev/null || warn "Global npm install skipped — use local build instead."

###############################################################################
# 9. SYSTEMD SERVICE (optional — for running the gateway persistently)
###############################################################################
info "9/9  Creating systemd service for OpenClaw Gateway …"

SERVICE_FILE="/etc/systemd/system/openclaw-gateway.service"
if [[ ! -f "$SERVICE_FILE" ]]; then
    cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=OpenClaw Gateway
After=network.target

[Service]
Type=simple
WorkingDirectory=${OPENCLAW_DIR}
ExecStart=/usr/bin/env node dist/gateway.js --port 18789
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF
    systemctl daemon-reload
    ok "Systemd service created (openclaw-gateway)."
    info "  Start it with:  systemctl start openclaw-gateway"
    info "  Enable on boot: systemctl enable openclaw-gateway"
else
    ok "Systemd service already exists."
fi

###############################################################################
# SUMMARY
###############################################################################
echo ""
echo "============================================================"
echo "   Setup Complete!"
echo "============================================================"
echo ""
echo "  Installed:"
echo "    Node.js     : $(node --version)"
echo "    npm         : $(npm --version)"
echo "    pnpm        : $(pnpm --version 2>/dev/null || echo 'n/a')"
echo "    Go          : $(/usr/local/go/bin/go version 2>/dev/null | awk '{print $3}' || echo 'n/a')"
echo "    Docker      : $(docker --version 2>/dev/null | awk '{print $3}' | tr -d ',' || echo 'n/a')"
echo "    OpenClaw    : ${OPENCLAW_DIR}"
echo ""
echo "  Firewall (UFW):"
echo "    SSH (22)     — allowed"
echo "    18789        — OpenClaw Gateway"
echo "    3000         — Dev server / Dashboard"
echo ""
echo "  Next steps:"
echo "    1. Source the Go env:       source /etc/profile.d/go.sh"
echo "    2. Run onboarding:          cd ${OPENCLAW_DIR} && pnpm openclaw onboard --install-daemon"
echo "    3. Check health:            openclaw doctor"
echo "    4. Open dashboard:          openclaw dashboard"
echo "    5. Start dev loop:          cd ${OPENCLAW_DIR} && pnpm gateway:watch"
echo ""
echo "  Optional:"
echo "    - Build Go gateway:         cd ${OPENCLAW_DIR}/gateway && go build -o openclaw-gateway ."
echo "    - Create a non-root user:   adduser devuser && usermod -aG docker,sudo devuser"
echo "    - Disable root SSH login:   edit /etc/ssh/sshd_config -> PermitRootLogin no"
echo ""
echo "  Docs: https://docs.openclaw.ai"
echo "  Repo: https://github.com/openclaw/openclaw"
echo "============================================================"
