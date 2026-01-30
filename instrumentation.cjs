// This file must be loaded before any other imports using NODE_OPTIONS=--require
// It sets up OpenTelemetry instrumentation for Signoz
require('source-map-support').install();

// Load environment variables first
require('dotenv').config()

const { NodeSDK } = require('@opentelemetry/sdk-node')
const { diag, DiagConsoleLogger, DiagLogLevel } = require('@opentelemetry/api')
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http')
const { OTLPMetricExporter } = require('@opentelemetry/exporter-metrics-otlp-http')
const { OTLPLogExporter } = require('@opentelemetry/exporter-logs-otlp-http')
const { PeriodicExportingMetricReader } = require('@opentelemetry/sdk-metrics')
const { BatchLogRecordProcessor } = require('@opentelemetry/sdk-logs')
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node')
const { WinstonInstrumentation } = require('@opentelemetry/instrumentation-winston')
const { resourceFromAttributes } = require('@opentelemetry/resources')
const { ATTR_SERVICE_NAME } = require('@opentelemetry/semantic-conventions')

// Suppress noisy OpenTelemetry diagnostic logs - only show errors
diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.ERROR)

console.log('[OTEL] Initializing OpenTelemetry instrumentation...')

try {
  const baseUrl = process.env.OTEL_EXPORTER_OTLP_ENDPOINT
  const serviceName = process.env.OTEL_SERVICE_NAME || 'sywl'

  // Configure trace exporter
  const traceExporter = new OTLPTraceExporter({
    url: baseUrl + '/v1/traces',
  })

  // Configure metrics exporter
  const metricExporter = new OTLPMetricExporter({
    url: baseUrl + '/v1/metrics',
  })

  // Configure metrics reader with periodic export (default: 60s)
  const metricReader = new PeriodicExportingMetricReader({
    exporter: metricExporter,
    exportIntervalMillis: 60000, // Export every 60 seconds
  })

  // Configure logs exporter
  const logExporter = new OTLPLogExporter({
    url: baseUrl + '/v1/logs',
  })

  // Create log processor
  const logProcessor = new BatchLogRecordProcessor(logExporter)

  // Create NodeSDK with resource configuration matching Signoz docs
  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: serviceName,
    }),
    traceExporter,
    metricReaders: [metricReader],
    logRecordProcessor: logProcessor,
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': {
          enabled: false // Disable filesystem instrumentation to reduce noise
        }
      }),
      // WinstonInstrumentation automatically captures Winston logs
      new WinstonInstrumentation({})
    ]
  })

  sdk.start()
  console.log('[OTEL] OpenTelemetry SDK started successfully')
  console.log('[OTEL] Service:', serviceName)
  console.log('[OTEL] Endpoint:', baseUrl)
  console.log('[OTEL] Instrumentation active - traces, metrics, and logs will be exported to Signoz')

  // Handle graceful shutdown
  process.on('SIGTERM', async () => {
    try {
      await sdk.shutdown()
      console.log('[OTEL] OpenTelemetry terminated')
    } catch (error) {
      console.error('[OTEL] Error terminating OpenTelemetry', error)
    } finally {
      process.exit(0)
    }
  })
} catch (error) {
  console.error('[OTEL] Failed to initialize OpenTelemetry SDK:', error)
  console.error('[OTEL] Stack:', error.stack)
}

// Set up global logger
const winston = require('winston')

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
  ),
  defaultMeta: {
    service: process.env.OTEL_SERVICE_NAME || 'sywl'
  },
  transports: [
    new winston.transports.Console({
      level: 'warn', // Only show warnings and errors in console, suppresses verbose OTLP export logs
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
          return `${timestamp} [${level}]: ${message}${metaStr}`;
        })
      )
    })
  ]
})

// Make logger globally available
global.logger = logger
console.log('[OTEL] Global logger initialized')
