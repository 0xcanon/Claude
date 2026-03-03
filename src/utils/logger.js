/**
 * OpenClaw Bustabit Bot - Logger
 * Structured logging with file output and console formatting.
 */

const fs = require('fs');
const path = require('path');

const COLORS = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
  bold: '\x1b[1m',
};

class Logger {
  constructor(logDir = path.join(__dirname, '../../logs')) {
    this.logDir = logDir;
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    this.logFile = path.join(logDir, `session-${timestamp}.log`);
    this.stream = fs.createWriteStream(this.logFile, { flags: 'a' });
  }

  _ts() {
    return new Date().toISOString().substring(11, 23);
  }

  _write(level, msg, data) {
    const line = `[${this._ts()}] [${level}] ${msg}${data ? ' ' + JSON.stringify(data) : ''}`;
    this.stream.write(line + '\n');
  }

  info(msg, data) {
    console.log(`${COLORS.gray}[${this._ts()}]${COLORS.reset} ${msg}`);
    this._write('INFO', msg, data);
  }

  success(msg, data) {
    console.log(`${COLORS.green}[${this._ts()}] ${msg}${COLORS.reset}`);
    this._write('SUCCESS', msg, data);
  }

  warn(msg, data) {
    console.log(`${COLORS.yellow}[${this._ts()}] WARNING: ${msg}${COLORS.reset}`);
    this._write('WARN', msg, data);
  }

  error(msg, data) {
    console.log(`${COLORS.red}[${this._ts()}] ERROR: ${msg}${COLORS.reset}`);
    this._write('ERROR', msg, data);
  }

  profit(msg, data) {
    console.log(`${COLORS.bold}${COLORS.green}[${this._ts()}] $$$ ${msg}${COLORS.reset}`);
    this._write('PROFIT', msg, data);
  }

  loss(msg, data) {
    console.log(`${COLORS.bold}${COLORS.red}[${this._ts()}] --- ${msg}${COLORS.reset}`);
    this._write('LOSS', msg, data);
  }

  strategy(msg, data) {
    console.log(`${COLORS.cyan}[${this._ts()}] [STRATEGY] ${msg}${COLORS.reset}`);
    this._write('STRATEGY', msg, data);
  }

  ai(msg, data) {
    console.log(`${COLORS.magenta}[${this._ts()}] [AI] ${msg}${COLORS.reset}`);
    this._write('AI', msg, data);
  }

  banner(text) {
    const line = '═'.repeat(60);
    console.log(`\n${COLORS.bold}${COLORS.cyan}╔${line}╗`);
    console.log(`║${text.padStart(30 + text.length / 2).padEnd(60)}║`);
    console.log(`╚${line}╝${COLORS.reset}\n`);
  }

  table(headers, rows) {
    const widths = headers.map((h, i) =>
      Math.max(h.length, ...rows.map(r => String(r[i]).length))
    );
    const sep = widths.map(w => '─'.repeat(w + 2)).join('┼');
    const fmt = (row) => row.map((c, i) => ` ${String(c).padEnd(widths[i])} `).join('│');

    console.log(`${COLORS.gray}┌${sep.replace(/┼/g, '┬')}┐${COLORS.reset}`);
    console.log(`${COLORS.bold}│${fmt(headers)}│${COLORS.reset}`);
    console.log(`${COLORS.gray}├${sep}┤${COLORS.reset}`);
    rows.forEach(row => {
      console.log(`│${fmt(row)}│`);
    });
    console.log(`${COLORS.gray}└${sep.replace(/┼/g, '┴')}┘${COLORS.reset}`);
  }

  close() {
    this.stream.end();
  }
}

module.exports = Logger;
