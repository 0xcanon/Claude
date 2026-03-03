# VPS Deployment Guide

---

## 1. VPS Requirements

### 1.1 Hardware Specifications

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| CPU | 2 cores | 4 cores |
| RAM | 4 GB | 8 GB |
| Storage | 40 GB SSD | 100 GB NVMe SSD |
| Network | 100 Mbps | 1 Gbps, low-latency to broker |
| OS | Windows Server 2019 / Ubuntu 22.04 | Windows Server 2022 |

**Why Windows?** MetaTrader 5 runs natively on Windows. While Wine on Linux
is possible, it introduces instability for 24/7 operation. Use Windows
for the MT5 component and optionally run the Python brain on WSL2 or
a separate Linux container.

### 1.2 Recommended VPS Providers

Choose a provider with data centers near your broker's servers:

| Provider | Latency Focus | Notes |
|----------|---------------|-------|
| Contabo | EU/US | Cost-effective, good for start |
| Vultr | Global | Low latency, many locations |
| ForexVPS | Broker-adjacent | Purpose-built for trading |
| AWS Lightsail | Global | Reliable, more expensive |
| Beeks Financial | Finance-grade | Lowest latency, premium |

### 1.3 Network Considerations

- Ping to broker: Target < 10ms (same data center ideal)
- VPS to VPS: If brain and MT5 on separate hosts, < 5ms between them
- Redundancy: Consider dual VPS in different data centers for failover

---

## 2. Architecture Layout (Single VPS)

```
Windows Server 2022 VPS
│
├── MetaTrader 5 Terminal
│   ├── Expert Advisor (trading_system_ea.mq5)
│   └── Uses C:\shared\ for file communication
│
├── Python Environment (WSL2 or native)
│   ├── OpenClaw Brain (openclaw_brain.py)
│   ├── Python 3.11+
│   └── Reads/writes C:\shared\ (mounted in WSL as /mnt/c/shared/)
│
├── PostgreSQL 16
│   └── Database: trading
│
├── Redis 7
│   └── Real-time state cache
│
├── Prometheus + Grafana (optional but recommended)
│   └── Monitoring dashboards
│
└── Scheduled Tasks
    ├── Daily: Data backup, log rotation, report generation
    ├── Weekly: Self-improvement analysis
    └── Monthly: Data retention cleanup
```

---

## 3. Installation Steps

### 3.1 Base System Setup

```powershell
# 1. Update Windows
sconfig  # → Option 6 → Install updates

# 2. Set timezone to UTC (critical for timestamp consistency)
Set-TimeZone -Id "UTC"

# 3. Disable Windows auto-updates reboots (use manual schedule)
# Group Policy → Computer Config → Admin Templates → Windows Components
# → Windows Update → No auto-restart with logged-on users

# 4. Disable sleep/hibernate
powercfg -change -standby-timeout-ac 0
powercfg -change -hibernate-timeout-ac 0

# 5. Set high performance power plan
powercfg -setactive 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c

# 6. Create shared directory
New-Item -ItemType Directory -Path C:\shared\signals\pending
New-Item -ItemType Directory -Path C:\shared\signals\processed
New-Item -ItemType Directory -Path C:\shared\signals\filled
New-Item -ItemType Directory -Path C:\shared\signals\rejected
New-Item -ItemType Directory -Path C:\shared\signals\rejected_source
New-Item -ItemType Directory -Path C:\shared\positions
New-Item -ItemType Directory -Path C:\shared\heartbeat
New-Item -ItemType Directory -Path C:\shared\control
New-Item -ItemType Directory -Path C:\shared\logs\brain
New-Item -ItemType Directory -Path C:\shared\logs\ea
```

### 3.2 MetaTrader 5 Installation

```
1. Download MT5 from your broker's website
2. Install to C:\Program Files\MetaTrader 5\
3. Log in with your trading account credentials
4. Enable "Allow DLL imports" in Tools → Options → Expert Advisors
5. Enable "Allow Algo Trading"
6. Copy EA file to:
   C:\Users\<user>\AppData\Roaming\MetaQuotes\Terminal\<ID>\MQL5\Experts\
7. Copy JAson.mqh library to:
   C:\Users\<user>\AppData\Roaming\MetaQuotes\Terminal\<ID>\MQL5\Include\
8. Compile EA in MetaEditor
9. Attach EA to a chart (any chart — it manages all 3 assets)
10. Set SharedDir input parameter to "C:\\shared\\"
```

### 3.3 Python Environment

```powershell
# Option A: Native Windows Python
# Download Python 3.11+ from python.org
# Install with "Add to PATH" checked

# Option B: WSL2 (recommended for better Python ecosystem)
wsl --install -d Ubuntu-22.04

# Inside WSL2:
sudo apt update && sudo apt upgrade -y
sudo apt install python3.11 python3.11-venv python3-pip -y

# Create virtual environment
python3.11 -m venv /opt/openclaw/venv
source /opt/openclaw/venv/bin/activate

# Install dependencies
pip install --upgrade pip
pip install MetaTrader5    # Only works on Windows Python or Wine
pip install numpy pandas redis psycopg2-binary
pip install ta-lib          # Technical analysis library
pip install requests        # For Telegram alerts
pip install prometheus-client  # For metrics

# If using WSL2, you need MT5 Python bridge on Windows side
# The brain connects to MT5 via the Windows Python MT5 package
# Solution: Run the brain on native Windows Python, or use
# a TCP bridge from WSL to Windows MT5.
```

### 3.4 PostgreSQL Installation

```powershell
# Download PostgreSQL 16 from postgresql.org
# Install with default settings

# Create database and user
psql -U postgres
CREATE DATABASE trading;
CREATE USER trader WITH PASSWORD 'your_secure_password_here';
GRANT ALL PRIVILEGES ON DATABASE trading TO trader;
\q

# Run schema
psql -U trader -d trading -f schemas/database_schema.sql
```

### 3.5 Redis Installation

```powershell
# Windows: Use Memurai (Redis-compatible for Windows) or WSL2 Redis

# WSL2:
sudo apt install redis-server -y
sudo systemctl enable redis-server
sudo systemctl start redis-server

# Test
redis-cli ping  # Should return PONG
```

---

## 4. Process Management

### 4.1 Auto-Start on Boot

Create Windows scheduled tasks for all components:

```powershell
# MT5 auto-start
$action = New-ScheduledTaskAction -Execute "C:\Program Files\MetaTrader 5\terminal64.exe"
$trigger = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries -StartWhenAvailable
Register-ScheduledTask -TaskName "MT5_AutoStart" -Action $action `
    -Trigger $trigger -Settings $settings -RunLevel Highest

# Brain auto-start (create a .bat file)
# start_brain.bat:
# cd C:\openclaw
# python openclaw_brain.py >> C:\shared\logs\brain\stdout.log 2>&1
```

### 4.2 Process Monitoring (Watchdog)

Create a watchdog script that runs every 60 seconds:

```python
# watchdog.py — runs as scheduled task every 60 seconds
import subprocess
import datetime
import json
import requests
from pathlib import Path

SHARED_DIR = Path("C:/shared")
TELEGRAM_BOT_TOKEN = "your_bot_token"
TELEGRAM_CHAT_ID = "your_chat_id"

def check_brain():
    hb_file = SHARED_DIR / "heartbeat" / "brain.json"
    if not hb_file.exists():
        return False, "Brain heartbeat file missing"

    hb = json.loads(hb_file.read_text())
    ts = datetime.datetime.fromisoformat(hb["timestamp_utc"])
    age = (datetime.datetime.now(datetime.timezone.utc) - ts).total_seconds()

    if age > 120:
        return False, f"Brain heartbeat stale: {age:.0f}s"
    return True, "OK"

def check_ea():
    hb_file = SHARED_DIR / "heartbeat" / "ea.json"
    if not hb_file.exists():
        return False, "EA heartbeat file missing"

    hb = json.loads(hb_file.read_text())
    ts_str = hb.get("timestamp_utc", "")
    # Parse and check age (similar to brain)
    return True, "OK"

def check_mt5_process():
    result = subprocess.run(
        ["tasklist", "/FI", "IMAGENAME eq terminal64.exe"],
        capture_output=True, text=True
    )
    return "terminal64.exe" in result.stdout, result.stdout

def send_telegram(message):
    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
    requests.post(url, json={"chat_id": TELEGRAM_CHAT_ID, "text": message})

def main():
    issues = []

    brain_ok, brain_msg = check_brain()
    if not brain_ok:
        issues.append(f"Brain: {brain_msg}")

    ea_ok, ea_msg = check_ea()
    if not ea_ok:
        issues.append(f"EA: {ea_msg}")

    mt5_ok, mt5_msg = check_mt5_process()
    if not mt5_ok:
        issues.append("MT5 terminal process not running")

    if issues:
        alert = "WATCHDOG ALERT:\n" + "\n".join(issues)
        send_telegram(alert)
        print(alert)

if __name__ == "__main__":
    main()
```

---

## 5. Security Hardening

```
1. Firewall: Block all incoming ports except RDP (3389) and monitoring (3000)
2. RDP: Use non-default port, enable NLA, strong password
3. Broker credentials: Store in environment variables, not in code
4. Database password: Use PostgreSQL password file (.pgpass)
5. Telegram bot token: Store in environment variable
6. File permissions: Restrict C:\shared\ to the trading user only
7. Windows Defender: Enable, exclude MT5 data directory for performance
8. Disable unnecessary Windows services
9. Enable Windows audit logging for file access to C:\shared\
10. Set up automated Windows updates on a manual-restart schedule
    (update on weekends when markets are closed for XAU)
```

---

## 6. Backup Strategy

```powershell
# Daily backup script (run at 00:30 UTC)

# 1. PostgreSQL dump
$date = Get-Date -Format "yyyyMMdd"
pg_dump -U trader trading > "C:\backups\db\trading_$date.sql"

# 2. Configuration files
Copy-Item -Recurse "C:\openclaw\config" "C:\backups\config\$date\"

# 3. Logs (last 7 days)
# Compressed and archived

# 4. Remote backup (weekly)
# Use rclone or similar to sync to cloud storage (S3, GCS, etc.)
# rclone sync C:\backups\ remote:trading-backups\

# 5. Retention
# Keep daily backups for 30 days
# Keep weekly backups for 6 months
# Keep monthly backups forever
```

---

## 7. Go-Live Checklist

```
Pre-Launch (Paper Trading):
□ System running on demo account for minimum 2 weeks
□ All components start automatically on VPS boot
□ Watchdog alerts tested (manually kill brain, verify alert)
□ Kill-switch tested (trigger daily DD on demo)
□ Heartbeat loss tested (stop brain, verify EA safe mode)
□ Signal generation, execution, and confirmation pipeline verified
□ Database logging verified (all tables populated correctly)
□ Daily/monthly reports generating correctly
□ Telegram alerts working
□ Backtest results align with paper trading results (±30%)

Go-Live:
□ Switch from demo to live account in MT5
□ Update brain config with live account details
□ Start with 25% of intended capital (prove on live before scaling)
□ Set conservative risk (1% per trade) for first 2 weeks
□ Monitor manually for first 48 hours
□ After 2 weeks of stable live performance:
    □ Increase to 50% capital, 1.5% risk
□ After 4 weeks stable:
    □ Full capital, full 2% risk
□ Document any discrepancies between backtest and live
```

---

## 8. Monitoring Dashboard (Grafana)

Key panels to configure:

```
Row 1: Account Overview
    - Current equity (gauge)
    - Daily P&L (number + sparkline)
    - Monthly P&L (number + sparkline)
    - Daily drawdown % (gauge with thresholds)

Row 2: Position Status
    - Open positions table (asset, direction, P&L, RR)
    - Total portfolio risk % (gauge)
    - Risk state indicator

Row 3: System Health
    - Brain heartbeat age (seconds)
    - EA heartbeat age (seconds)
    - Signal processing latency
    - CPU/Memory usage

Row 4: Trading Activity
    - Signals generated today
    - Fills/rejections today
    - Win rate (7-day rolling)
    - Equity curve (line chart)

Row 5: Per-Asset Performance
    - BTC P&L (30-day)
    - ETH P&L (30-day)
    - XAU P&L (30-day)
    - Allocation weights (pie chart)

Row 6: Regime Status
    - Current regime per asset per timeframe (table)
    - Regime timeline (heatmap)
```
