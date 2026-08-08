/** Published JSON Schema Draft 2020-12 documents for ScenarioDefinitionV2 and results@2. */

export const SCENARIO_DEFINITION_V2_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://media-test.invalid/schemas/scenario-definition-v2.schema.json',
  title: 'Media Test ScenarioDefinitionV2',
  type: 'object',
  additionalProperties: false,
  required: [
    'schemaVersion', 'id', 'revision', 'family', 'order', 'op', 'inputs', 'options', 'requires',
    'oracles', 'metrics', 'tolerances', 'timeoutMs', 'notes', 'inputVariantIds', 'renditionIds',
  ],
  properties: {
    schemaVersion: { const: 2 },
    id: { type: 'string', pattern: '^[a-z0-9][a-z0-9-]*/[A-Za-z0-9][A-Za-z0-9._/-]*$' },
    revision: { type: 'integer', minimum: 1 },
    family: { $ref: '#/$defs/family' },
    order: { type: 'integer', minimum: 0 },
    op: { $ref: '#/$defs/operation' },
    inputs: {
      type: 'array', minItems: 1,
      items: {
        type: 'object', additionalProperties: false, required: ['assetId', 'variantId'],
        properties: {
          assetId: { type: 'string', minLength: 1 },
          variantId: { type: 'string', pattern: '^[A-Za-z0-9][A-Za-z0-9._:/+-]*$' },
          role: { type: 'string', minLength: 1 },
        },
      },
    },
    options: { type: 'object' },
    requires: { $ref: '#/$defs/requires' },
    oracles: { type: 'array', minItems: 1, uniqueItems: true, items: { $ref: '#/$defs/oracle' } },
    metrics: { type: 'array', uniqueItems: true, items: { $ref: '#/$defs/metric' } },
    primaryMetric: { $ref: '#/$defs/metric' },
    tolerances: {
      type: 'object', additionalProperties: false,
      properties: {
        ssimMin: { type: 'number', minimum: 0, maximum: 1 },
        psnrMinDb: { type: 'number', minimum: 0 },
        durationToleranceSec: { type: 'number', minimum: 0 },
        fpsTolerance: { type: 'number', minimum: 0 },
        seekToleranceUs: { type: 'number', minimum: 0 },
      },
    },
    timeoutMs: { type: 'number', exclusiveMinimum: 0 },
    notes: { type: 'string' },
    mutation: {
      type: 'object', additionalProperties: false, required: ['mutationId', 'parameters'],
      properties: {
        mutationId: { type: 'string', pattern: '^[A-Za-z0-9][A-Za-z0-9._:/-]*$' },
        parameters: { type: 'object' },
      },
    },
    inputVariantIds: { type: 'array', minItems: 1, uniqueItems: true, items: { type: 'string', minLength: 1 } },
    renditionIds: { type: 'array', uniqueItems: true, items: { type: 'string', minLength: 1 } },
  },
  $defs: {
    family: { enum: ['probe', 'demux', 'remux', 'transcode', 'decode-seek', 'trim', 'mux', 'encryption', 'metadata', 'streaming-output', 'audio-dsp', 'robustness', 'performance'] },
    operation: { enum: ['probe', 'demux', 'remux', 'transcode', 'decodeFrames', 'seek', 'trim', 'mux', 'decrypt'] },
    oracle: { enum: ['golden-metadata', 'golden-packets', 'decoded-frames-bitexact', 'decoded-audio-pcm', 'reference-reimport', 'playback-smoke', 'ssim-psnr', 'mp4-box-layout', 'webm-live-layout', 'fanout-renditions', 'alpha-plane', 'seek-accuracy', 'trim-boundaries', 'decrypt-bitexact', 'graceful-failure', 'property-invariant'] },
    metric: { enum: ['wall', 'throughputRealtime', 'peakMemory', 'sourceReads', 'targetWrites', 'bytesOut', 'longtasks', 'decodeFps', 'encodeFps', 'opsPerSec', 'packetsPerSec', 'framesPerSec', 'sampleFramesPerSec', 'seekMs', 'timeToFirstByte', 'timeToFirstFrame', 'loadInit', 'bundleSize'] },
    stringTokens: { type: 'array', uniqueItems: true, items: { type: 'string', minLength: 1 } },
    tokens: {
      type: 'object', additionalProperties: false, required: ['operations'],
      properties: {
        operations: { type: 'array', minItems: 1, uniqueItems: true, items: { $ref: '#/$defs/operation' } },
        containersIn: { $ref: '#/$defs/stringTokens' }, containersOut: { $ref: '#/$defs/stringTokens' },
        videoCodecs: { $ref: '#/$defs/stringTokens' }, audioCodecs: { $ref: '#/$defs/stringTokens' },
        videoCodecsIn: { $ref: '#/$defs/stringTokens' }, audioCodecsIn: { $ref: '#/$defs/stringTokens' },
        videoCodecsOut: { $ref: '#/$defs/stringTokens' }, audioCodecsOut: { $ref: '#/$defs/stringTokens' },
        encryption: { $ref: '#/$defs/stringTokens' }, features: { $ref: '#/$defs/stringTokens' },
      },
    },
    combination: {
      type: 'object', additionalProperties: false, required: ['operation'],
      properties: {
        operation: { $ref: '#/$defs/operation' }, containersIn: { $ref: '#/$defs/stringTokens' },
        containersOut: { $ref: '#/$defs/stringTokens' }, videoCodecsIn: { $ref: '#/$defs/stringTokens' },
        audioCodecsIn: { $ref: '#/$defs/stringTokens' }, videoCodecsOut: { $ref: '#/$defs/stringTokens' },
        audioCodecsOut: { $ref: '#/$defs/stringTokens' }, encryption: { $ref: '#/$defs/stringTokens' },
        features: { $ref: '#/$defs/stringTokens' }, optionConstraints: { type: 'object' },
        browserRoles: { type: 'array', uniqueItems: true, items: { enum: ['video-decoder', 'video-encoder', 'audio-decoder', 'audio-encoder'] } },
        browserConfigRecipes: {
          type: 'array', items: {
            type: 'object', additionalProperties: false, required: ['role', 'source'],
            properties: {
              role: { enum: ['video-decoder', 'video-encoder', 'audio-decoder', 'audio-encoder'] },
              source: { enum: ['selected-input-video', 'selected-input-audio', 'output-video', 'output-audio'] },
              trackIndex: { type: 'integer', minimum: 0 },
            },
          },
        },
      },
    },
    requires: {
      type: 'object', additionalProperties: false,
      required: ['operations', 'allOfTokens', 'anyOfCombinations'],
      properties: {
        operations: { type: 'array', minItems: 1, uniqueItems: true, items: { $ref: '#/$defs/operation' } },
        containersIn: { $ref: '#/$defs/stringTokens' }, containersOut: { $ref: '#/$defs/stringTokens' },
        videoCodecs: { $ref: '#/$defs/stringTokens' }, audioCodecs: { $ref: '#/$defs/stringTokens' },
        videoCodecsIn: { $ref: '#/$defs/stringTokens' }, audioCodecsIn: { $ref: '#/$defs/stringTokens' },
        videoCodecsOut: { $ref: '#/$defs/stringTokens' }, audioCodecsOut: { $ref: '#/$defs/stringTokens' },
        encryption: { $ref: '#/$defs/stringTokens' }, features: { $ref: '#/$defs/stringTokens' },
        allOfTokens: { $ref: '#/$defs/tokens' },
        anyOfCombinations: { type: 'array', minItems: 1, items: { $ref: '#/$defs/combination' } },
      },
    },
  },
} as const;

export const RESULTS_V2_JSON_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://media-test.invalid/schemas/results-v2.schema.json',
  title: 'Media Browser Test results@2',
  type: 'object', additionalProperties: false,
  required: ['schema', 'generatedAtIso', 'results'],
  properties: {
    schema: { const: 'media-browser-test/results@2' },
    generatedAtIso: { type: 'string', format: 'date-time' },
    env: {}, support: {},
    migration: {
      type: 'object', additionalProperties: false, required: ['from', 'missingInputDigests'],
      properties: {
        from: { const: 'media-browser-test/results@1' },
        missingInputDigests: { type: 'integer', minimum: 0 },
      },
    },
    results: { type: 'array', items: { $ref: '#/$defs/result' } },
  },
  $defs: {
    sha256: { type: 'string', pattern: '^[a-f0-9]{64}$' },
    status: { enum: ['PASS', 'FAIL', 'NA_ENGINE', 'NA_BROWSER', 'NA_ASSET', 'ERROR', 'SKIPPED'] },
    oracleId: { $ref: 'scenario-definition-v2.schema.json#/$defs/oracle' },
    verdictOutcome: {
      type: 'object', additionalProperties: false,
      required: ['state', 'oracle', 'verdict', 'reasonCode'],
      properties: {
        state: { const: 'VERDICT' }, oracle: { $ref: '#/$defs/oracleId' },
        verdict: { enum: ['PASS', 'FAIL'] }, reasonCode: { type: 'string', minLength: 1 },
        detail: { type: 'string' }, measurements: { $ref: '#/$defs/measurements' },
        evidence: { type: 'object' },
      },
    },
    unavailableOutcome: {
      type: 'object', additionalProperties: false,
      required: ['state', 'oracle', 'status', 'reasonCode', 'detail'],
      properties: {
        state: { const: 'UNAVAILABLE' }, oracle: { $ref: '#/$defs/oracleId' },
        status: { enum: ['NA_BROWSER', 'NA_ASSET'] }, reasonCode: { type: 'string', minLength: 1 },
        detail: { type: 'string' }, measurements: { $ref: '#/$defs/measurements' },
        evidence: { type: 'object' },
      },
    },
    errorOutcome: {
      type: 'object', additionalProperties: false,
      required: ['state', 'oracle', 'reasonCode', 'detail'],
      properties: {
        state: { const: 'ERROR' }, oracle: { $ref: '#/$defs/oracleId' },
        reasonCode: { type: 'string', minLength: 1 }, detail: { type: 'string' },
        measurements: { $ref: '#/$defs/measurements' }, evidence: { type: 'object' },
      },
    },
    outcome: { oneOf: [{ $ref: '#/$defs/verdictOutcome' }, { $ref: '#/$defs/unavailableOutcome' }, { $ref: '#/$defs/errorOutcome' }] },
    measurements: { type: 'object', additionalProperties: { type: 'number' } },
    instance: {
      type: 'object', additionalProperties: false,
      required: ['scenarioId', 'scenarioRevision', 'definitionHash', 'inputVariantId', 'inputSha256'],
      properties: {
        scenarioId: { type: 'string', minLength: 1 }, scenarioRevision: { type: 'integer', minimum: 1 },
        definitionHash: { type: 'string', pattern: '^(?:[a-f0-9]{64}|legacy/[a-f0-9]{64})$' },
        inputVariantId: { type: 'string', minLength: 1 }, inputSha256: { oneOf: [{ $ref: '#/$defs/sha256' }, { type: 'null' }] },
      },
    },
    operationEvidence: {
      type: 'object', additionalProperties: false, required: ['schema', 'disposition', 'stage'],
      properties: {
        schema: { const: 'media-test/robustness-operation@1' },
        disposition: { enum: ['returned-validatable-output', 'clean-reject', 'not-applicable', 'browser-unavailable', 'timeout', 'worker-crash', 'resource-limit', 'harness-error'] },
        stage: { enum: ['preflight', 'operation', 'survivor-oracle', 'cleanup'] },
        nativeError: {
          type: 'object', additionalProperties: false, required: ['name'],
          properties: { name: { type: 'string', minLength: 1 }, code: { type: 'string' } },
        },
        resource: {
          type: 'object', additionalProperties: false, required: ['kind'],
          properties: {
            kind: { enum: ['wall-time', 'memory', 'worker-stall'] }, observed: { type: 'number', minimum: 0 },
            limit: { type: 'number', minimum: 0 }, unit: { enum: ['ms', 'bytes'] },
          },
        },
      },
    },
    candidateEvidence: {
      type: 'object', additionalProperties: false,
      required: ['schema', 'contractDigest', 'status', 'reasonCode', 'required', 'applied', 'unavailable', 'sufficientSurvivorOracles', 'sufficient'],
      properties: {
        schema: { const: 'media-test/candidate-evidence-result@1' },
        contractDigest: { $ref: '#/$defs/sha256' },
        status: { enum: ['PASS', 'FAIL', 'NA_ASSET', 'NA_BROWSER', 'ERROR'] },
        reasonCode: { type: 'string', minLength: 1 },
        required: { type: 'array', uniqueItems: true, items: { $ref: '#/$defs/oracleId' } },
        applied: { type: 'array', uniqueItems: true, items: { $ref: '#/$defs/oracleId' } },
        unavailable: {
          type: 'array',
          items: {
            type: 'object', additionalProperties: false, required: ['oracle', 'status', 'reasonCode'],
            properties: {
              oracle: { $ref: '#/$defs/oracleId' },
              status: { enum: ['NA_ASSET', 'NA_BROWSER'] },
              reasonCode: { type: 'string', minLength: 1 },
            },
          },
        },
        sufficientSurvivorOracles: { type: 'array', uniqueItems: true, items: { $ref: '#/$defs/oracleId' } },
        sufficient: { type: 'boolean' },
      },
    },
    cacheReuse: {
      type: 'object', additionalProperties: false,
      required: ['schema', 'sourceKey', 'sourceObservationHash', 'createdAtIso', 'originalOrigin', 'validationEpoch', 'validBecause'],
      properties: {
        schema: { const: 'media-test/cache-reuse@1' }, sourceKey: { type: 'string', minLength: 1 },
        sourceObservationHash: { $ref: '#/$defs/sha256' }, sourceRunId: { type: 'string', minLength: 1 },
        createdAtIso: { type: 'string', format: 'date-time' }, originalOrigin: { type: 'string', minLength: 1 },
        validationEpoch: { type: 'string', minLength: 1 }, validBecause: { type: 'string', minLength: 1 },
        importedFrom: { type: 'string', minLength: 1 }, sourceEnvironment: { $ref: '#/$defs/runEnv' },
        selectionEnvelope: { $ref: '#/$defs/selection' },
      },
    },
    fingerprint: {
      type: 'object', additionalProperties: false, required: ['schema', 'hash'],
      properties: { schema: { const: 'media-test/scenario-result@3' }, hash: { $ref: '#/$defs/sha256' } },
    },
    benchSummary: {
      type: 'object', additionalProperties: false,
      required: ['n', 'warmup', 'metric', 'median', 'p95', 'mad', 'unit', 'samples'],
      properties: {
        n: { type: 'number', minimum: 0 }, warmup: { type: 'number', minimum: 0 },
        metric: { $ref: 'scenario-definition-v2.schema.json#/$defs/metric' },
        median: { type: 'number', minimum: 0 }, p95: { type: 'number', minimum: 0 },
        mad: { type: 'number', minimum: 0 }, unit: { type: 'string', minLength: 1 },
        samples: { type: 'array', items: { type: 'number' } }, aggregate: { type: 'number' },
      },
    },
    bench: {
      type: 'object',
      propertyNames: { $ref: 'scenario-definition-v2.schema.json#/$defs/metric' },
      additionalProperties: { $ref: '#/$defs/benchSummary' },
    },
    measurement: {
      oneOf: [
        { type: 'object', additionalProperties: false, required: ['state'], properties: { state: { const: 'NOT_REQUESTED' } } },
        {
          type: 'object', additionalProperties: false, required: ['state', 'metrics'],
          properties: {
            state: { const: 'AVAILABLE' },
            metrics: { type: 'array', uniqueItems: true, items: { $ref: 'scenario-definition-v2.schema.json#/$defs/metric' } },
          },
        },
        {
          type: 'object', additionalProperties: false, required: ['state', 'reasonCode', 'detail'],
          properties: {
            state: { const: 'UNAVAILABLE' }, reasonCode: { type: 'string', minLength: 1 },
            detail: { type: 'string', minLength: 1 },
          },
        },
      ],
    },
    selection: {
      type: 'object', additionalProperties: false, required: ['file', 'isBaked'],
      properties: {
        file: { type: 'string', minLength: 1 }, sha256: { $ref: '#/$defs/sha256' },
        isBaked: { type: 'boolean' },
        candidateCount: { type: 'integer', minimum: 0 },
        eligiblePoolDigest: { $ref: '#/$defs/sha256' },
        executedInputDigest: { $ref: '#/$defs/sha256' },
        candidateIdentity: { $ref: '#/$defs/sha256' },
        selectionPolicyVersion: { type: 'string', minLength: 1 },
        selectionAlgorithmId: { type: 'string', minLength: 1 },
        evidenceContractDigest: { $ref: '#/$defs/sha256' },
        catalogState: { enum: ['ready', 'fallback'] },
        catalogReason: {
          type: 'object', additionalProperties: false, required: ['reasonCode', 'detail'],
          properties: {
            reasonCode: { type: 'string', minLength: 1 }, detail: { type: 'string', minLength: 1 },
          },
        },
      },
    },
    pixelBehavior: {
      type: 'object', additionalProperties: false, required: ['state', 'reasonCode', 'detail'],
      properties: {
        state: { enum: ['SUPPORTED', 'UNSUPPORTED'] }, reasonCode: { type: 'string', minLength: 1 },
        detail: { type: 'string', minLength: 1 },
      },
    },
    runEnv: {
      type: 'object', additionalProperties: false, required: ['suiteVersion', 'engineId', 'browser'],
      properties: {
        suiteVersion: { type: 'string', minLength: 1 }, engineId: { type: 'string', minLength: 1 },
        browser: { enum: ['brave', 'chromium', 'webkit', 'firefox'] },
        browserVersion: { type: 'string' }, userAgent: { type: 'string' }, gpu: { type: 'string' },
        corpusChecksum: { type: 'string' }, acPower: { type: 'boolean' }, configUsed: {},
        pixelBehavior: { $ref: '#/$defs/pixelBehavior' },
      },
    },
    exhaustive: {
      type: 'object', additionalProperties: false,
      required: ['file', 'isBaked', 'status', 'oracleOutcomes', 'executed'],
      properties: {
        file: { type: 'string', minLength: 1 }, sha256: { $ref: '#/$defs/sha256' }, isBaked: { type: 'boolean' },
        status: { $ref: '#/$defs/status' }, oracleOutcomes: { type: 'array', items: { $ref: '#/$defs/outcome' } },
        reason: { type: 'string' }, bench: { $ref: '#/$defs/bench' },
        measurement: { $ref: '#/$defs/measurement' }, support: {},
        selection: { $ref: '#/$defs/selection' }, operationEvidence: { $ref: '#/$defs/operationEvidence' },
        candidateEvidence: { $ref: '#/$defs/candidateEvidence' },
        cacheReuse: { $ref: '#/$defs/cacheReuse' },
        executionFingerprint: { $ref: '#/$defs/fingerprint' },
        executed: { type: 'boolean' },
      },
    },
    coverage: {
      type: 'object', additionalProperties: false,
      required: ['passed', 'admissible', 'total', 'valid', 'grade', 'counts'],
      properties: {
        passed: { type: 'integer', minimum: 0 }, admissible: { type: 'integer', minimum: 0 },
        total: { type: 'integer', minimum: 0 }, valid: { type: 'integer', minimum: 0 },
        grade: { enum: ['full', 'partial', 'none'] },
        counts: {
          type: 'object', additionalProperties: false,
          required: ['pass', 'fail', 'error', 'naEngine', 'naBrowser', 'naAsset', 'skipped', 'total'],
          properties: Object.fromEntries(['pass', 'fail', 'error', 'naEngine', 'naBrowser', 'naAsset', 'skipped', 'total'].map((key) => [key, { type: 'integer', minimum: 0 }])),
        },
      },
    },
    result: {
      type: 'object', additionalProperties: false,
      dependentRequired: { exhaustive: ['coverage'], coverage: ['exhaustive'] },
      required: ['schemaVersion', 'engineId', 'browser', 'scenarioId', 'scenarioRevision', 'definitionHash', 'instance', 'family', 'status', 'oracleOutcomes'],
      properties: {
        schemaVersion: { const: 2 }, engineId: { type: 'string', minLength: 1 }, engineVersion: { type: 'string' },
        browser: { enum: ['brave', 'chromium', 'webkit', 'firefox'] }, scenarioId: { type: 'string', minLength: 1 },
        scenarioRevision: { type: 'integer', minimum: 1 }, definitionHash: { type: 'string', pattern: '^(?:[a-f0-9]{64}|legacy/[a-f0-9]{64})$' },
        instance: { $ref: '#/$defs/instance' }, family: { $ref: 'scenario-definition-v2.schema.json#/$defs/family' },
        status: { $ref: '#/$defs/status' }, oracleOutcomes: { type: 'array', items: { $ref: '#/$defs/outcome' } },
        inputVariantId: { type: 'string', minLength: 1 }, inputSha256: { $ref: '#/$defs/sha256' },
        reason: { type: 'string' }, bench: { $ref: '#/$defs/bench' },
        measurement: { $ref: '#/$defs/measurement' }, support: {},
        operationEvidence: { $ref: '#/$defs/operationEvidence' }, candidateEvidence: { $ref: '#/$defs/candidateEvidence' },
        cacheReuse: { $ref: '#/$defs/cacheReuse' },
        executionFingerprint: { $ref: '#/$defs/fingerprint' },
        bundleMeasurement: {},
        primaryMetric: { $ref: 'scenario-definition-v2.schema.json#/$defs/metric' },
        selection: { $ref: '#/$defs/selection' },
        exhaustive: { type: 'array', minItems: 1, items: { $ref: '#/$defs/exhaustive' } },
        coverage: { $ref: '#/$defs/coverage' },
        env: { $ref: '#/$defs/runEnv' }, startedAtIso: { type: 'string', format: 'date-time' },
        durationMs: { type: 'number', minimum: 0 },
      },
    },
  },
} as const;
