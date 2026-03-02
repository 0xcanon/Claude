#!/bin/bash

# ============================================================
#  OpenClaw + Full Dev Environment Setup Script
#  Target: Ubuntu 22.04 LTS (fresh VPS)
#  Run as a non-root user with sudo privileges
#  Usage: bash setup-openclaw-vps.sh
# ============================================================

set -euo pipefail

# ─── Prevent sourcing ────────────────────────────────────────
(return 0 2>/dev/null) && { echo "Do not source this script — run it directly: bash $0" >&2; return 1; }

# ─── Colors (only when attached to a terminal) ──────────────
if [[ -t 1 ]] && [[ -t 2 ]]; then
  RED='\033[0;31m'
  GREEN='\033[0;32m'
  YELLOW='\033[1;33m'
  CYAN='\033[0;36m'
  BOLD='\033[1m'
  RESET='\033[0m'
else
  RED=''; GREEN=''; YELLOW=''; CYAN=''; BOLD=''; RESET=''
fi

# ─── Helpers ─────────────────────────────────────────────────
log()     { printf '%b  %s\n' "${CYAN}[INFO]${RESET}" "$*"; }
success() { printf '%b  %s\n' "${GREEN}[ OK ]${RESET}" "$*"; }
warn()    { printf '%b  %s\n' "${YELLOW}[WARN]${RESET}" "$*"; }
error()   { printf '%b  %s\n' "${RED}[ERROR]${RESET}" "$*" >&2; exit 1; }
section() { printf '\n%b  %s  %b\n\n' "${BOLD}${CYAN}━━━" "$*" "━━━${RESET}"; }

# ─── Cleanup trap ────────────────────────────────────────────
TEMPFILES=()
cleanup() {
  for f in "${TEMPFILES[@]}"; do
    rm -f "$f" 2>/dev/null || true
  done
  if [[ $? -ne 0 ]]; then
    warn "Script did not complete successfully."
    warn "The system may be in a partially configured state."
    warn "Review the output above and re-run the script to continue."
  fi
}
trap cleanup EXIT

# ─── Root check ──────────────────────────────────────────────
if [[ $EUID -eq 0 ]]; then
  error "Do NOT run this script as root. Create a regular user first and run with sudo access."
fi

# ─── Environment ─────────────────────────────────────────────
export DEBIAN_FRONTEND=noninteractive
CURRENT_USER="$(id -un)"

section "Starting OpenClaw + Dev Environment Setup"
log "Running as: ${CURRENT_USER}  |  Host: $(hostname)  |  Date: $(date)"

# ============================================================
# 1. SYSTEM UPDATE & ESSENTIAL PACKAGES
# ============================================================
section "1/10 — System Update & Core Packages"

sudo apt-get update -y
sudo apt-get upgrade -y -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold"

sudo apt-get install -y \
  curl wget git unzip zip \
  build-essential software-properties-common \
  ca-certificates gnupg lsb-release \
  htop tmux nano vim \
  net-tools dnsutils jq tree \
  ufw fail2ban \
  python3 python3-pip python3-venv \
  libssl-dev libffi-dev \
  apt-transport-https

success "Core packages installed."

# ============================================================
# 2. UFW FIREWALL
# ============================================================
section "2/10 — Configuring Firewall (UFW)"

sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow OpenSSH

# Verify SSH rule exists before enabling — prevents lockout
if ! sudo ufw status | grep -q "OpenSSH"; then
  error "Failed to add SSH rule to UFW — aborting to prevent VPS lockout."
fi

sudo ufw --force enable

success "Firewall enabled. SSH allowed. Port 18789 is localhost-only (use SSH tunnel)."

# ============================================================
# 3. FAIL2BAN — BRUTE FORCE PROTECTION
# ============================================================
section "3/10 — Fail2Ban (SSH Brute Force Protection)"

# Write config BEFORE starting the service so it never runs with defaults
sudo tee /etc/fail2ban/jail.local > /dev/null <<'EOF'
[DEFAULT]
bantime  = 3600
findtime = 600
maxretry = 5

[sshd]
enabled  = true
port     = ssh
logpath  = /var/log/auth.log
backend  = auto
EOF

sudo systemctl enable fail2ban
sudo systemctl restart fail2ban

success "Fail2Ban configured and running."

# ============================================================
# 4. NODE.JS 22 (required by OpenClaw)
# ============================================================
section "4/10 — Node.js 22 (LTS)"

# Download setup script to a temp file instead of piping to bash
NODESOURCE_SCRIPT="$(mktemp)"
TEMPFILES+=("$NODESOURCE_SCRIPT")
curl -fsSL https://deb.nodesource.com/setup_22.x -o "$NODESOURCE_SCRIPT"

if [[ ! -s "$NODESOURCE_SCRIPT" ]]; then
  error "NodeSource setup script download failed or is empty."
fi

sudo -E bash "$NODESOURCE_SCRIPT"
sudo apt-get install -y nodejs

NODE_VER=$(node --version)
NPM_VER=$(npm --version)
success "Node.js installed: ${NODE_VER}  |  npm: ${NPM_VER}"

# Configure global npm directory (no sudo needed for global installs)
mkdir -p "${HOME}/.npm-global"
npm config set prefix "${HOME}/.npm-global"

# Add npm global bin to PATH — write to .profile so both bash and zsh pick it up
for PROFILE_FILE in "${HOME}/.profile" "${HOME}/.bashrc"; do
  if [[ -f "$PROFILE_FILE" ]] && ! grep -qF '.npm-global' "$PROFILE_FILE"; then
    {
      echo ''
      echo '# npm global packages'
      echo 'export PATH="$HOME/.npm-global/bin:$PATH"'
    } >> "$PROFILE_FILE"
  fi
done

export PATH="${HOME}/.npm-global/bin:${PATH}"
success "npm global directory configured at ~/.npm-global"

# ============================================================
# 5. OPENCLAW INSTALLATION
# ============================================================
section "5/10 — Installing OpenClaw"

log "Installing OpenClaw globally via npm …"
npm install -g openclaw@latest

# Verify it actually installed — don't silently mask failure
if ! command -v openclaw &>/dev/null; then
  error "OpenClaw binary not found in PATH after install. Check npm global prefix."
fi

OC_VER=$(openclaw --version 2>/dev/null || echo "unknown")
success "OpenClaw installed: ${OC_VER}"
log "After this script finishes, run:  openclaw onboard"

# ============================================================
# 6. CLAWHUB (Skills Package Manager)
# ============================================================
section "6/10 — ClawHub (Skill Manager)"

npm install -g clawhub

if command -v clawhub &>/dev/null; then
  success "ClawHub installed. Use 'clawhub search <topic>' to find skills."
else
  warn "ClawHub binary not found in PATH — you may need to source your profile first."
fi

# ============================================================
# 7. DOCKER + DOCKER COMPOSE
# ============================================================
section "7/10 — Docker & Docker Compose"

# Add Docker's official GPG key (idempotent — uses tee instead of gpg --dearmor)
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  | sudo tee /etc/apt/keyrings/docker.asc > /dev/null
sudo chmod a+r /etc/apt/keyrings/docker.asc

# Add Docker repo (use lsb_release to avoid unbound variable risk)
UBUNTU_CODENAME="$(lsb_release -cs)"
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
  https://download.docker.com/linux/ubuntu ${UBUNTU_CODENAME} stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt-get update -y
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Add current user to docker group
sudo usermod -aG docker "${CURRENT_USER}"

sudo systemctl enable docker
sudo systemctl start docker

success "Docker installed. Log out and back in for docker group to take effect."

# ============================================================
# 8. GIT CONFIGURATION
# ============================================================
section "8/10 — Git Setup"

git config --global init.defaultBranch main
git config --global core.editor nano

if [[ -z "$(git config --global user.name 2>/dev/null || true)" ]]; then
  warn "Git user.name not set. Update it after setup:"
  warn "  git config --global user.name  'Your Name'"
  warn "  git config --global user.email 'you@example.com'"
else
  success "Git already configured for: $(git config --global user.name)"
fi

# ============================================================
# 9. OPENCLAW SECURITY CONFIGURATION
# ============================================================
section "9/10 — OpenClaw Security Configuration"

OPENCLAW_CONFIG_DIR="${HOME}/.openclaw"
mkdir -p "${OPENCLAW_CONFIG_DIR}"
OPENCLAW_CONFIG="${OPENCLAW_CONFIG_DIR}/openclaw.json"

if [[ -f "$OPENCLAW_CONFIG" ]]; then
  warn "openclaw.json already exists — skipping to avoid overwriting your config."
else
  # Write config with restrictive permissions (may later hold auth tokens)
  (
    umask 077
    cat > "$OPENCLAW_CONFIG" <<'EOF'
{
  "gateway": {
    "address": "127.0.0.1",
    "port": 18789,
    "auth": {
      "mode": "token"
    }
  },
  "agents": {
    "defaults": {
      "model": {
        "primary": "claude-sonnet-4-6"
      }
    }
  }
}
EOF
  )
  success "Secure openclaw.json written to ${OPENCLAW_CONFIG} (mode 600)"
  warn "  gateway.address = 127.0.0.1 (localhost only — never expose publicly)"
  warn "  auth.mode = token (token-protected access)"
fi

# ============================================================
# 10. USEFUL DEV TOOLS
# ============================================================
section "10/10 — Extra Dev Tools"

# Python tools (Ubuntu 22.04 ships pip 22 which doesn't need --break-system-packages)
pip3 install --upgrade pip 2>/dev/null || true

# GitHub CLI — use tee for key download with explicit permissions
curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
  | sudo tee /usr/share/keyrings/githubcli-archive-keyring.gpg > /dev/null
sudo chmod a+r /usr/share/keyrings/githubcli-archive-keyring.gpg

echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] \
  https://cli.github.com/packages stable main" \
  | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null

sudo apt-get update -y
sudo apt-get install -y gh

success "GitHub CLI (gh) installed — run 'gh auth login' to connect your account."

# ripgrep (fast code search)
sudo apt-get install -y ripgrep
success "ripgrep installed."

# ============================================================
# FINAL SUMMARY
# ============================================================
section "Setup Complete — What To Do Next"

printf '%b\n' "${BOLD}Installed:${RESET}"
printf '  %b %s\n' "${GREEN}*${RESET}" "Node.js     $(node --version)"
printf '  %b %s\n' "${GREEN}*${RESET}" "npm         $(npm --version)"
printf '  %b %s\n' "${GREEN}*${RESET}" "git         $(git --version | awk '{print $3}')"
printf '  %b %s\n' "${GREEN}*${RESET}" "docker      $(docker --version 2>/dev/null | awk '{print $3}' | tr -d ',')"
printf '  %b %s\n' "${GREEN}*${RESET}" "python3     $(python3 --version 2>/dev/null | awk '{print $2}')"
printf '  %b %s\n' "${GREEN}*${RESET}" "gh          $(gh --version 2>/dev/null | head -1 | awk '{print $3}')"
printf '  %b %s\n' "${GREEN}*${RESET}" "openclaw    ${OC_VER}"
printf '  %b %s\n' "${GREEN}*${RESET}" "clawhub     installed"
printf '  %b %s\n' "${GREEN}*${RESET}" "ufw         enabled"
printf '  %b %s\n' "${GREEN}*${RESET}" "fail2ban    running"

echo ""
printf '%b\n' "${BOLD}${YELLOW}NEXT STEPS:${RESET}"
echo ""
printf '  1. %b\n' "${CYAN}Source your shell:${RESET}"
echo "     source ~/.profile"
echo ""
printf '  2. %b\n' "${CYAN}Run OpenClaw onboarding:${RESET}"
echo "     openclaw onboard"
echo "     -> Choose: QuickStart"
echo "     -> Pick your AI provider (Anthropic/Claude recommended)"
echo "     -> Connect a chat channel (Telegram is easiest)"
echo "     -> Select 'Hatch in TUI' to start"
echo ""
printf '  3. %b\n' "${CYAN}Start OpenClaw gateway (after onboarding):${RESET}"
echo "     openclaw gateway start"
echo ""
printf '  4. %b\n' "${CYAN}Open the web dashboard via SSH tunnel on your LOCAL machine:${RESET}"
echo "     ssh -L 18789:127.0.0.1:18789 ${CURRENT_USER}@YOUR_VPS_IP"
echo "     Then open http://127.0.0.1:18789 in your browser"
echo ""
printf '  5. %b\n' "${CYAN}Connect GitHub (for coding workflows):${RESET}"
echo "     gh auth login"
echo ""
printf '  6. %b\n' "${CYAN}Install coding skills via ClawHub:${RESET}"
echo "     clawhub search coding"
echo "     clawhub search github"
echo ""
printf '  7. %b\n' "${CYAN}Log out and back in so Docker group permissions apply:${RESET}"
echo "     exit  (then reconnect via SSH)"
echo ""
printf '%b\n' "${RED}${BOLD}SECURITY REMINDERS:${RESET}"
echo "  * Never expose port 18789 to the public internet"
echo "  * Always use SSH tunnel to access the dashboard"
echo "  * Review any community skills before installing them"
echo "  * openclaw.json permissions are 600 (owner-only read/write)"
echo ""
success "You're ready. Run: source ~/.profile && openclaw onboard"
echo ""
