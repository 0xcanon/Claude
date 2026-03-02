#!/bin/bash
set -e

echo "=== Claude Code VPS Setup ==="

# 1. Install Node.js (v20 LTS) if not present
if ! command -v node &> /dev/null; then
    echo "[1/4] Installing Node.js 20 LTS..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
else
    echo "[1/4] Node.js already installed: $(node --version)"
fi

# 2. Install Claude Code globally
echo "[2/4] Installing Claude Code..."
npm install -g @anthropic-ai/claude-code

# 3. Set up the Anthropic API key
echo "[3/4] Configuring API key..."
mkdir -p ~/.config/claude
if [ -z "$ANTHROPIC_API_KEY" ]; then
    read -rp "Enter your Anthropic API key: " ANTHROPIC_API_KEY
fi

# Persist the key in shell profile
if ! grep -q "ANTHROPIC_API_KEY" ~/.bashrc 2>/dev/null; then
    echo "export ANTHROPIC_API_KEY=\"${ANTHROPIC_API_KEY}\"" >> ~/.bashrc
    echo "API key added to ~/.bashrc"
fi

# 4. Configure SSH for secure remote access
echo "[4/4] Configuring SSH..."

# Install OpenSSH server if not present
if ! command -v sshd &> /dev/null; then
    apt-get install -y openssh-server
fi

# Generate host keys if missing
if [ ! -f /etc/ssh/ssh_host_ed25519_key ]; then
    ssh-keygen -t ed25519 -f /etc/ssh/ssh_host_ed25519_key -N ""
fi

# Generate a user SSH key pair for key-based auth if one doesn't exist
if [ ! -f ~/.ssh/id_ed25519 ]; then
    mkdir -p ~/.ssh && chmod 700 ~/.ssh
    ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519 -N "" -C "claude-code-vps"
    echo "SSH key pair generated at ~/.ssh/id_ed25519"
fi

# Ensure authorized_keys exists with correct permissions
touch ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys

# Back up original sshd_config before modifying
if [ ! -f /etc/ssh/sshd_config.bak ]; then
    cp /etc/ssh/sshd_config /etc/ssh/sshd_config.bak
fi

# Apply SSH hardening settings
SSHD_CONFIG="/etc/ssh/sshd_config"

apply_sshd_setting() {
    local key="$1" value="$2"
    if grep -qE "^\s*#?\s*${key}\b" "$SSHD_CONFIG"; then
        sed -i "s/^\s*#\?\s*${key}\b.*/${key} ${value}/" "$SSHD_CONFIG"
    else
        echo "${key} ${value}" >> "$SSHD_CONFIG"
    fi
}

apply_sshd_setting "PermitRootLogin"            "prohibit-password"
apply_sshd_setting "PasswordAuthentication"      "no"
apply_sshd_setting "PubkeyAuthentication"        "yes"
apply_sshd_setting "ChallengeResponseAuthentication" "no"
apply_sshd_setting "X11Forwarding"               "no"
apply_sshd_setting "MaxAuthTries"                "3"
apply_sshd_setting "ClientAliveInterval"         "300"
apply_sshd_setting "ClientAliveCountMax"         "2"

# Validate config before restarting
if sshd -t 2>/dev/null; then
    systemctl restart sshd 2>/dev/null || service ssh restart 2>/dev/null || true
    echo "SSH hardened and restarted."
else
    echo "WARNING: sshd config validation failed — restoring backup."
    cp /etc/ssh/sshd_config.bak /etc/ssh/sshd_config
fi

echo ""
echo "=== Setup Complete ==="
echo "Node.js version: $(node --version)"
echo "npm version:     $(npm --version)"
echo "Claude Code:     $(claude --version 2>/dev/null || echo 'installed')"
echo ""
echo "--- SSH Info ---"
echo "Public key (add this to your local ~/.ssh/authorized_keys on THIS server to connect):"
echo "  $(cat ~/.ssh/id_ed25519.pub 2>/dev/null || echo 'No key generated')"
echo ""
echo "Connect from your local machine:  ssh $(whoami)@<your-vps-ip>"
echo "Password auth is DISABLED — add your local public key to ~/.ssh/authorized_keys on this server."
echo ""
echo "Run 'source ~/.bashrc' then 'claude' to start using Claude Code."
