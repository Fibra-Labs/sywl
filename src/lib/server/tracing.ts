import {type AttributeValue, type Span, SpanStatusCode, type Tracer} from '@opentelemetry/api';

/**
 * Type for span attributes - mapping of attribute names to values
 */
export type SpanAttributes = Record<string, AttributeValue | undefined | null>;

/**
 * Helper to set multiple attributes on a span at once, filtering out undefined and null values.
 * This ensures only meaningful attributes are recorded on the span.
 *
 * @param span - The OpenTelemetry span to set attributes on
 * @param attributes - Object containing attribute key-value pairs
 *
 * @example
 * ```ts
 * setSpanAttributes(span, {
 *   'user.id': userId,
 *   'search.query': query,
 *   'search.results_count': results.length
 * });
 * ```
 */
export function setSpanAttributes(span: Span, attributes: SpanAttributes): void {
    for (const [key, value] of Object.entries(attributes)) {
        if (value !== undefined && value !== null) {
            span.setAttribute(key, value);
        }
    }
}

/**
 * Helper to properly record errors on spans with comprehensive error information.
 * This standardizes error handling across the application by:
 * - Setting span status to ERROR
 * - Recording the exception with stack trace
 * - Adding error.type attribute for categorization
 * - Adding error.code if present
 * - Supporting additional custom attributes
 *
 * @param span - The OpenTelemetry span to record the error on
 * @param error - The error object or string to record
 * @param additionalAttributes - Optional additional attributes to add to the span
 *
 * @example
 * ```ts
 * try {
 *   await riskyOperation();
 * } catch (error) {
 *   setSpanError(span, error, { 'operation.id': operationId });
 *   throw error;
 * }
 * ```
 */
export function setSpanError(
    span: Span,
    error: unknown,
    additionalAttributes?: SpanAttributes
): void {
    // Determine error type for categorization
    let errorType = 'UnknownError';
    let errorMessage = String(error);
    let errorCode: string | number | undefined;

    if (error instanceof Error) {
        errorType = error.name || error.constructor?.name || errorType;
        errorMessage = error.message;

        // Record the exception with stack trace
        span.recordException(error);

        // Check for error code property (common in API errors)
        if ('code' in error && error.code) {
            errorCode = error.code as string | number;
        }
    } else if (typeof error === 'string') {
        errorMessage = error;
        // For string errors, record as a basic exception
        span.recordException(new Error(error));
    } else {
        // For other types, try to extract useful info
        span.recordException(new Error(errorMessage));
    }

    // Set span status to ERROR
    span.setStatus({
        code: SpanStatusCode.ERROR,
        message: errorMessage
    });

    // Add error type attribute
    span.setAttribute('error.type', errorType);

    // Add error code if present
    if (errorCode !== undefined) {
        span.setAttribute('error.code', errorCode);
    }

    // Add any additional custom attributes
    if (additionalAttributes) {
        setSpanAttributes(span, additionalAttributes);
    }
}

/**
 * Helper to create a span, execute a function, and properly handle success/errors.
 * This wrapper provides consistent span lifecycle management:
 * - Creates a new active span with the provided name
 * - Sets initial attributes if provided
 * - Executes the provided function (supports both sync and async)
 * - On success: ends the span normally
 * - On error: records the error using setSpanError, ends the span, and re-throws
 *
 * @param tracer - The OpenTelemetry tracer to create the span with
 * @param name - The name for the span
 * @param fn - The function to execute within the span context (can be sync or async)
 * @param attributes - Optional initial attributes to set on the span
 * @returns The result of the function execution
 *
 * @example
 * ```ts
 * const tracer = trace.getTracer('my-service');
 *
 * const result = await withSpan(
 *   tracer,
 *   'operation.name',
 *   async (span) => {
 *     span.setAttribute('operation.step', 'started');
 *     const result = await performOperation();
 *     span.setAttribute('operation.result_count', result.length);
 *     return result;
 *   },
 *   { 'user.id': userId }
 * );
 * ```
 */
export async function withSpan<T>(
    tracer: Tracer,
    name: string,
    fn: (span: Span) => T | Promise<T>,
    attributes?: SpanAttributes
): Promise<T> {
    return tracer.startActiveSpan(name, async (span) => {
        try {
            // Set initial attributes if provided
            if (attributes) {
                setSpanAttributes(span, attributes);
            }

            // Execute the function
            const result = await fn(span);

            // Set status to OK on success
            span.setStatus({code: SpanStatusCode.OK});

            return result;
        } catch (error) {
            // Record error on span
            setSpanError(span, error);
            throw error;
        } finally {
            // Always end the span
            span.end();
        }
    });
}

/**
 * Extract user context attributes from SvelteKit locals.
 * This provides consistent user identification across all traces:
 * - user.id: The user's unique identifier
 * - user.email: User's email address (if available)
 * - user.has_access_token: Boolean indicating if user has a valid access token
 * - user.token_expires_at: Unix timestamp when the token expires (if available)
 *
 * @param locals - SvelteKit locals object containing user information
 * @returns Object with user-related span attributes, or empty object if no user
 *
 * @example
 * ```ts
 * export async function load({ locals }) {
 *   const span = tracer.startSpan('load.data');
 *   const userContext = getUserContext(locals);
 *   setSpanAttributes(span, userContext);
 *   // ... rest of load function
 * }
 * ```
 */
export function getUserContext(locals: App.Locals): SpanAttributes {
    const {user} = locals;

    if (!user) {
        return {};
    }

    return {
        'user.id': user.id,
        'user.email': user.email || undefined,
        'user.has_access_token': !!user.accessToken,
        'user.token_expires_at': user.expiresAt || undefined
    };
}
