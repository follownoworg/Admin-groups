import pino from 'pino';
import { LOG_LEVEL } from '../config/settings.js';

const logger = pino({
  level: LOG_LEVEL,
  transport: process.env.NODE_ENV !== 'production'
    ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:standard' } }
    : undefined
});

export default logger;
