type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const currentLevel: LogLevel =
  (process.env.NODE_ENV === 'production' ? 'info' : 'debug') as LogLevel;

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[currentLevel];
}

function formatTimestamp(): string {
  return new Date().toISOString();
}

function formatMessage(level: LogLevel, message: string, meta?: unknown): string {
  const timestamp = formatTimestamp();
  const upperLevel = level.toUpperCase().padEnd(5);
  let output = `[${timestamp}] ${upperLevel} ${message}`;

  if (meta !== undefined) {
    if (meta instanceof Error) {
      output += `\n  Error: ${meta.message}`;
      if (meta.stack) {
        output += `\n  Stack: ${meta.stack}`;
      }
    } else if (typeof meta === 'object') {
      try {
        output += ` ${JSON.stringify(meta)}`;
      } catch {
        output += ` [Unserializable object]`;
      }
    } else {
      output += ` ${String(meta)}`;
    }
  }

  return output;
}

export const logger = {
  debug(message: string, meta?: unknown): void {
    if (shouldLog('debug')) {
      console.debug(formatMessage('debug', message, meta));
    }
  },

  info(message: string, meta?: unknown): void {
    if (shouldLog('info')) {
      console.info(formatMessage('info', message, meta));
    }
  },

  warn(message: string, meta?: unknown): void {
    if (shouldLog('warn')) {
      console.warn(formatMessage('warn', message, meta));
    }
  },

  error(message: string, meta?: unknown): void {
    if (shouldLog('error')) {
      console.error(formatMessage('error', message, meta));
    }
  },
};
