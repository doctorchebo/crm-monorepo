/**
 * Logger Utility
 *
 * Provides consistent, colored logging with different log levels.
 * Supports structured output for progress tracking.
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

export class Logger {
  private level: LogLevel;

  constructor(level: LogLevel = LogLevel.INFO) {
    this.level = level;
  }

  private formatTimestamp(): string {
    return new Date().toISOString().replace('T', ' ').split('.')[0];
  }

  debug(message: string, data?: any) {
    if (this.level <= LogLevel.DEBUG) {
      console.log(`[${this.formatTimestamp()}] 🔍 DEBUG: ${message}`);
      if (data) console.log('   ', data);
    }
  }

  info(message: string, data?: any) {
    if (this.level <= LogLevel.INFO) {
      console.log(`[${this.formatTimestamp()}] ℹ️  INFO: ${message}`);
      if (data) console.log('   ', data);
    }
  }

  success(message: string, data?: any) {
    if (this.level <= LogLevel.INFO) {
      console.log(`[${this.formatTimestamp()}] ✅ SUCCESS: ${message}`);
      if (data) console.log('   ', data);
    }
  }

  warn(message: string, data?: any) {
    if (this.level <= LogLevel.WARN) {
      console.log(`[${this.formatTimestamp()}] ⚠️  WARN: ${message}`);
      if (data) console.log('   ', data);
    }
  }

  error(message: string, data?: any) {
    if (this.level <= LogLevel.ERROR) {
      console.error(`[${this.formatTimestamp()}] ❌ ERROR: ${message}`);
      if (data) console.error('   ', data);
    }
  }

  banner(title: string) {
    const line = '═'.repeat(70);
    console.log(`\n╔${line}╗`);
    console.log(`║ ${title.padEnd(68)} ║`);
    console.log(`╚${line}╝\n`);
  }

  section(title: string) {
    console.log(`\n${'─'.repeat(70)}`);
    console.log(`  ${title}`);
    console.log(`${'─'.repeat(70)}\n`);
  }

  table(data: Record<string, any>, title?: string) {
    if (title) {
      console.log(`\n${title}:`);
    }
    const maxKeyLen = Math.max(...Object.keys(data).map((k) => k.length));
    for (const [key, value] of Object.entries(data)) {
      console.log(`  ${key.padEnd(maxKeyLen)} : ${value}`);
    }
  }

  progress(current: number, total: number, prefix: string = '') {
    const percentage = total > 0 ? Math.round((current / total) * 100) : 0;
    const barWidth = 40;
    const filled = Math.round((percentage / 100) * barWidth);
    const empty = barWidth - filled;
    const bar = '█'.repeat(filled) + '░'.repeat(empty);

    process.stdout.write(
      `\r${prefix}[${bar}] ${percentage}% (${current}/${total})    `,
    );

    if (current === total) {
      console.log(); // New line when complete
    }
  }

  newLine() {
    console.log();
  }
}
