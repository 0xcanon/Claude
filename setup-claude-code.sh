#!/bin/bash
set -e

echo "=== Claude Code VPS Setup ==="

# 1. Install Node.js (v20 LTS) if not present
if ! command -v node &> /dev/null; then
    echo "[1/3] Installing Node.js 20 LTS..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
else
    echo "[1/3] Node.js already installed: $(node --version)"
fi

# 2. Install Claude Code globally
echo "[2/3] Installing Claude Code..."
npm install -g @anthropic-ai/claude-code

# 3. Set up the Anthropic API key
echo "[3/3] Configuring API key..."
mkdir -p ~/.config/claude
if [ -z "$ANTHROPIC_API_KEY" ]; then
    read -rp "Enter your Anthropic API key: " ANTHROPIC_API_KEY
fi

# Persist the key in shell profile
if ! grep -q "ANTHROPIC_API_KEY" ~/.bashrc 2>/dev/null; then
    echo "export ANTHROPIC_API_KEY=\"${ANTHROPIC_API_KEY}\"" >> ~/.bashrc
    echo "API key added to ~/.bashrc"
fi

echo ""
echo "=== Setup Complete ==="
echo "Node.js version: $(node --version)"
echo "npm version:     $(npm --version)"
echo "Claude Code:     $(claude --version 2>/dev/null || echo 'installed')"
echo ""
echo "Run 'source ~/.bashrc' then 'claude' to start using Claude Code."
