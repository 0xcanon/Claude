# VPS Deployment Guide

## 1. VPS Requirements

### 1.1 Minimum Specifications

| Component | Minimum | Recommended |
|---|---|---|
| OS | Windows Server 2019 | Windows Server 2022 |
| CPU | 4 cores | 8 cores |
| RAM | 8 GB | 16 GB |
| Storage | 100 GB SSD | 250 GB NVMe SSD |
| Network | 100 Mbps | 1 Gbps |
| Uptime SLA | 99.9% | 99.95% |
| Location | Same country as broker server | Same datacenter as broker |

### 1.2 Recommended VPS Providers

| Provider | Specialty | Note |
|---|---|---|
| Beeks Financial Cloud | Trading-optimized | Ultra-low latency to brokers |
| Vultr/Hetzner + Windows | General purpose | Cost-effective |
| Amazon Lightsail | Cloud | Good for reliability |
| ForexVPS.net | Trading-specific | Pre-configured for MT5 |

### 1.3 Network Considerations

```
CRITICAL: VPS should be geographically close to your broker's server.

Most MT5 brokers have servers in:
  - London (LD4/LD5)
  - New York (NY4/NY5)
  - Tokyo
  - Amsterdam
  - Singapore

Check your broker's server location:
  MT5 → Help → About → Server
  Or: ping your broker's server address

Target: < 5ms latency to broker server
Acceptable: < 20ms
Poor: > 50ms (consider moving VPS)
```

---

## 2. Installation Steps

### Step 1: VPS Setup

```powershell
# 1. Connect via RDP to your VPS

# 2. Set timezone to UTC (critical for consistency)
Set-TimeZone -Name "UTC"

# 3. Disable Windows Update auto-restart (prevents mid-trade restarts)
# Group Policy → Computer Configuration → Administrative Templates →
# Windows Components → Windows Update → No auto-restart with logged on users

# 4. Set power plan to High Performance
powercfg /setactive 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c

# 5. Disable screen saver and sleep
powercfg /change standby-timeout-ac 0
powercfg /change monitor-timeout-ac 0

# 6. Install required software
# - MetaTrader 5 (from broker)
# - Python 3.11+ (from python.org)
# - PostgreSQL 15+ (from postgresql.org)
# - Redis for Windows (from https://github.com/microsoftarchive/redis)
# - Git (for code deployment)
# - NSSM (Non-Sucking Service Manager)
```

### Step 2: Directory Structure

```
C:\TradingSystem\
├── openclaw\                    # OpenClaw decision engine
│   ├── engine\                  # Core engine code
│   │   ├── __init__.py
│   │   ├── main.py             # Entry point
│   │   ├── config.py           # Configuration
│   │   ├── data_manager.py     # Market data
│   │   ├── indicators.py       # Technical indicators
│   │   ├── regime_detector.py  # Regime classification
│   │   ├── mtf_alignment.py    # Multi-TF analysis
│   │   ├── vol_detector.py     # Volatility expansion
│   │   ├── signal_generator.py # Signal generation
│   │   ├── risk_engine.py      # Risk management
│   │   ├── kill_switch.py      # Kill-switch controller
│   │   ├── publisher.py        # Signal publisher
│   │   ├── self_improvement.py # Adaptive module
│   │   ├── database.py         # Database interface
│   │   └── alerts.py           # Telegram/email alerts
│   ├── requirements.txt
│   ├── .env                     # Secrets (DB password, Telegram token)
│   └── logs\                    # Log files
│
├── mt5\                         # MT5 EA files
│   ├── Experts\
│   │   └── OpenClaw_EA.mq5
│   ├── Include\
│   │   └── OpenClaw_Utils.mqh
│   └── Scripts\
│       └── OpenClaw_Test.mq5
│
├── signals\                     # IPC directory
│   ├── openclaw_to_mt5.json
│   ├── mt5_to_openclaw.json
│   ├── heartbeat_oc.json
│   └── heartbeat_ea.json
│
├── watchdog\                    # Watchdog process
│   ├── watchdog.py
│   └── config.yaml
│
├── backtest\                    # Backtesting framework
│   ├── data\
│   ├── results\
│   └── scripts\
│
├── monitoring\                  # Grafana/Prometheus configs
│   ├── prometheus.yml
│   └── grafana\
│       └── dashboards\
│
└── logs\                        # System-wide logs
```

### Step 3: Python Environment Setup

```powershell
# Create virtual environment
cd C:\TradingSystem\openclaw
python -m venv venv
.\venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

**requirements.txt:**
```
MetaTrader5>=5.0.45
numpy>=1.24.0
pandas>=2.0.0
psycopg2-binary>=2.9.0
redis>=5.0.0
python-telegram-bot>=20.0
APScheduler>=3.10.0
prometheus-client>=0.17.0
pydantic>=2.0.0
python-dotenv>=1.0.0
loguru>=0.7.0
```

### Step 4: Database Setup

```powershell
# Initialize PostgreSQL
# Create database and user
psql -U postgres
```

```sql
CREATE DATABASE openclaw_trading;
CREATE USER openclaw WITH PASSWORD 'your_secure_password_here';
GRANT ALL PRIVILEGES ON DATABASE openclaw_trading TO openclaw;
\c openclaw_trading
-- Run the schema file
\i C:/TradingSystem/openclaw/schemas/database_schema.sql
```

### Step 5: MetaTrader 5 Setup

```
1. Install MT5 from your broker
2. Log in to your trading account
3. Enable AutoTrading (green button in toolbar)
4. Tools → Options → Expert Advisors:
   □ Allow automated trading
   □ Allow DLL imports
   □ Allow WebRequest for: your API URLs

5. Copy EA file:
   C:\TradingSystem\mt5\Experts\OpenClaw_EA.mq5
   → MT5 Data Folder\MQL5\Experts\OpenClaw_EA.mq5

6. Compile EA in MetaEditor

7. Attach EA to chart:
   - Open any chart (e.g., BTCUSD M1)
   - Drag OpenClaw_EA onto the chart
   - Configure input parameters
   - Check "Allow live trading"
   - Click OK

8. Verify EA is running (smiley face icon on chart)
```

### Step 6: Configure Environment Variables

**.env file (C:\TradingSystem\openclaw\.env):**
```
# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=openclaw_trading
DB_USER=openclaw
DB_PASSWORD=your_secure_password_here

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# Telegram Bot
TELEGRAM_BOT_TOKEN=your_bot_token_here
TELEGRAM_CHAT_ID=your_chat_id_here

# MT5
MT5_LOGIN=your_mt5_account_number
MT5_PASSWORD=your_mt5_password
MT5_SERVER=YourBroker-Live

# Signal Directory
SIGNAL_DIR=C:\TradingSystem\signals

# Logging
LOG_LEVEL=INFO
LOG_DIR=C:\TradingSystem\logs
```

### Step 7: Service Installation (NSSM)

```powershell
# Install OpenClaw as a Windows Service using NSSM
nssm install OpenClawEngine "C:\TradingSystem\openclaw\venv\Scripts\python.exe"
nssm set OpenClawEngine AppParameters "C:\TradingSystem\openclaw\engine\main.py"
nssm set OpenClawEngine AppDirectory "C:\TradingSystem\openclaw"
nssm set OpenClawEngine AppStdout "C:\TradingSystem\logs\openclaw_stdout.log"
nssm set OpenClawEngine AppStderr "C:\TradingSystem\logs\openclaw_stderr.log"
nssm set OpenClawEngine AppRotateFiles 1
nssm set OpenClawEngine AppRotateBytes 10485760  # 10MB rotation
nssm set OpenClawEngine AppRestartDelay 5000  # 5s restart delay on crash

# Install Watchdog as a Windows Service
nssm install OpenClawWatchdog "C:\TradingSystem\openclaw\venv\Scripts\python.exe"
nssm set OpenClawWatchdog AppParameters "C:\TradingSystem\watchdog\watchdog.py"
nssm set OpenClawWatchdog AppDirectory "C:\TradingSystem\watchdog"
nssm set OpenClawWatchdog AppStdout "C:\TradingSystem\logs\watchdog_stdout.log"
nssm set OpenClawWatchdog AppStderr "C:\TradingSystem\logs\watchdog_stderr.log"

# Start services
nssm start OpenClawEngine
nssm start OpenClawWatchdog
```

---

## 3. Pre-Launch Checklist

```
□ VPS SETUP
  □ Windows Server configured with UTC timezone
  □ Auto-updates disabled / scheduled for weekends only
  □ Power plan set to High Performance
  □ RDP access configured and tested
  □ Firewall configured (only needed ports open)
  □ Antivirus exception for TradingSystem directory

□ MT5
  □ Logged in to correct account (LIVE, not DEMO)
  □ AutoTrading enabled
  □ EA compiled without errors
  □ EA attached to chart and showing smiley face
  □ EA heartbeat file being written every 1s
  □ Manual test trade placed and closed successfully
  □ Spread on all 3 assets within expected range
  □ All 3 symbols available and trading enabled

□ OPENCLAW ENGINE
  □ Python venv activated and all packages installed
  □ .env file configured with correct credentials
  □ MT5 Python connection tested (mt5.initialize() succeeds)
  □ Database connection tested
  □ Redis connection tested (if using)
  □ Telegram bot sending test messages
  □ Historical data loaded for all assets/timeframes
  □ Regime classification running for all 3 assets
  □ Signal generation tested on historical data
  □ IPC channel working (signal written and read by EA)

□ SAFETY SYSTEMS
  □ Kill-switch tested: forced daily DD > 7% → system halts
  □ Kill-switch tested: removed heartbeat → EA closes all
  □ Kill-switch tested: emergency_halt.flag → EA closes all
  □ Watchdog running and sending alerts
  □ Telegram /halt command tested and working
  □ All positions verified to have SL (no SL = close)
  □ Max position limit tested and enforced
  □ Max lot size limit tested and enforced

□ MONITORING
  □ Prometheus scraping metrics
  □ Grafana dashboard configured
  □ Alert rules configured (email + Telegram)
  □ Log rotation configured
  □ Disk space monitoring active

□ BACKUP & RECOVERY
  □ Database backup scheduled (daily)
  □ Configuration files backed up
  □ Recovery procedure documented and tested
  □ VPS snapshot taken before go-live
```

---

## 4. Go-Live Protocol

```
PHASE 1: PAPER TRADING (2-4 weeks)
  - Run full system on demo account
  - Verify all components working correctly
  - Compare paper results to backtest expectations
  - Fix any issues discovered

PHASE 2: MICRO-LIVE (2-4 weeks)
  - Switch to live account with MINIMUM lot sizes (0.01)
  - Verify real execution matches paper trading
  - Check actual slippage, spread, commission
  - Run all safety systems in production

PHASE 3: SCALED-UP (gradual)
  - Increase to 25% of target position size for 2 weeks
  - Then 50% for 2 weeks
  - Then 75% for 2 weeks
  - Then full size

PHASE 4: FULL PRODUCTION
  - Full position sizing active
  - All monitoring and alerts active
  - Daily review for first month
  - Weekly review thereafter
  - Monthly comprehensive review
```

---

## 5. Maintenance Procedures

### 5.1 Daily Checks (5 minutes)

```
1. Check Telegram for any alerts overnight
2. Verify system is in NORMAL mode
3. Check daily P&L on dashboard
4. Verify all positions have SL
5. Check system health metrics (CPU, memory, latency)
```

### 5.2 Weekly Maintenance (30 minutes)

```
1. Review weekly performance report
2. Check self-improvement log for parameter changes
3. Review regime classification accuracy
4. Check database size and cleanup if needed
5. Verify backup integrity
6. Update Windows (if critical security patches)
7. Restart services if memory usage trending up
```

### 5.3 Monthly Review (2 hours)

```
1. Full performance report analysis
2. Compare live performance to backtest expectations
3. Review all kill-switch activations
4. Review asset allocation changes
5. Check correlation dynamics
6. Review execution quality (slippage, spread trends)
7. Plan any strategy adjustments (manual, not automatic)
8. Database maintenance (vacuum, reindex)
9. Update system snapshot/backup
10. Document any issues and resolutions
```
