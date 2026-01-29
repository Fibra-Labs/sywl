// Re-export the global logger created in instrumentation.cjs
// The logger is initialized early in instrumentation.cjs and assigned to global.logger
// All code should access logger via the global or this re-export
import {AsyncLocalStorage} from 'node:async_hooks';
import {context, trace} from '@opentelemetry/api';

// Get the base logger from instrumentation.cjs
const baseLogger = global.logger;

// AsyncLocalStorage for request-scoped user context
const userContextStorage = new AsyncLocalStorage<{ userId: string; }>();

// Get current user context from AsyncLocalStorage
function getUserContext(): { user_id: string; } {
    const ctx = userContextStorage.getStore();
    return {
        user_id: ctx?.userId || 'guest'
    };
}

// Get current trace context for correlation
function getTraceContext(): Record<string, string> {
    const span = trace.getSpan(context.active());
    if (!span) {
        return {};
    }
    const spanContext = span.spanContext();
    return {
        trace_id: spanContext.traceId,
        span_id: spanContext.spanId,
        trace_flags: spanContext.traceFlags.toString()
    };
}

// Create enhanced logger that automatically adds user and trace context
const logger = {
    /**
     * Run a function with user context automatically added to all log calls
     * Use this in hooks.server.ts to wrap request handling
     */
    withUserContext<T>(userId: string, fn: () => T): T {
        return userContextStorage.run({userId}, fn);
    },

    /**
     * Create a child logger with additional metadata
     */
    child(meta: Record<string, unknown> = {}) {
        const userCtx = getUserContext();
        const traceCtx = getTraceContext();
        return baseLogger.child({...userCtx, ...traceCtx, ...meta});
    },

    error(message: string, meta?: Record<string, unknown>) {
        const userCtx = getUserContext();
        const traceCtx = getTraceContext();
        return baseLogger.error(message, {...userCtx, ...traceCtx, ...meta});
    },

    warn(message: string, meta?: Record<string, unknown>) {
        const userCtx = getUserContext();
        const traceCtx = getTraceContext();
        return baseLogger.warn(message, {...userCtx, ...traceCtx, ...meta});
    },

    info(message: string, meta?: Record<string, unknown>) {
        const userCtx = getUserContext();
        const traceCtx = getTraceContext();
        return baseLogger.info(message, {...userCtx, ...traceCtx, ...meta});
    },

    debug(message: string, meta?: Record<string, unknown>) {
        const userCtx = getUserContext();
        const traceCtx = getTraceContext();
        return baseLogger.debug(message, {...userCtx, ...traceCtx, ...meta});
    }
};

export default logger;
