(function (factory) {
	typeof define === 'function' && define.amd ? define(factory) :
	factory();
}((function () { 'use strict';

	var commonjsGlobal = typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : typeof self !== 'undefined' ? self : {};

	function createCommonjsModule(fn, basedir, module) {
		return module = {
			path: basedir,
			exports: {},
			require: function (path, base) {
				return commonjsRequire(path, (base === undefined || base === null) ? module.path : base);
			}
		}, fn(module, module.exports), module.exports;
	}

	function commonjsRequire () {
		throw new Error('Dynamic requires are not currently supported by @rollup/plugin-commonjs');
	}

	var loglevel = createCommonjsModule(function (module) {
	/*
	* loglevel - https://github.com/pimterry/loglevel
	*
	* Copyright (c) 2013 Tim Perry
	* Licensed under the MIT license.
	*/
	(function (root, definition) {
	    if ( module.exports) {
	        module.exports = definition();
	    } else {
	        root.log = definition();
	    }
	}(commonjsGlobal, function () {

	    // Slightly dubious tricks to cut down minimized file size
	    var noop = function() {};
	    var undefinedType = "undefined";
	    var isIE = (typeof window !== undefinedType) && (typeof window.navigator !== undefinedType) && (
	        /Trident\/|MSIE /.test(window.navigator.userAgent)
	    );

	    var logMethods = [
	        "trace",
	        "debug",
	        "info",
	        "warn",
	        "error"
	    ];

	    // Cross-browser bind equivalent that works at least back to IE6
	    function bindMethod(obj, methodName) {
	        var method = obj[methodName];
	        if (typeof method.bind === 'function') {
	            return method.bind(obj);
	        } else {
	            try {
	                return Function.prototype.bind.call(method, obj);
	            } catch (e) {
	                // Missing bind shim or IE8 + Modernizr, fallback to wrapping
	                return function() {
	                    return Function.prototype.apply.apply(method, [obj, arguments]);
	                };
	            }
	        }
	    }

	    // Trace() doesn't print the message in IE, so for that case we need to wrap it
	    function traceForIE() {
	        if (console.log) {
	            if (console.log.apply) {
	                console.log.apply(console, arguments);
	            } else {
	                // In old IE, native console methods themselves don't have apply().
	                Function.prototype.apply.apply(console.log, [console, arguments]);
	            }
	        }
	        if (console.trace) console.trace();
	    }

	    // Build the best logging method possible for this env
	    // Wherever possible we want to bind, not wrap, to preserve stack traces
	    function realMethod(methodName) {
	        if (methodName === 'debug') {
	            methodName = 'log';
	        }

	        if (typeof console === undefinedType) {
	            return false; // No method possible, for now - fixed later by enableLoggingWhenConsoleArrives
	        } else if (methodName === 'trace' && isIE) {
	            return traceForIE;
	        } else if (console[methodName] !== undefined) {
	            return bindMethod(console, methodName);
	        } else if (console.log !== undefined) {
	            return bindMethod(console, 'log');
	        } else {
	            return noop;
	        }
	    }

	    // These private functions always need `this` to be set properly

	    function replaceLoggingMethods(level, loggerName) {
	        /*jshint validthis:true */
	        for (var i = 0; i < logMethods.length; i++) {
	            var methodName = logMethods[i];
	            this[methodName] = (i < level) ?
	                noop :
	                this.methodFactory(methodName, level, loggerName);
	        }

	        // Define log.log as an alias for log.debug
	        this.log = this.debug;
	    }

	    // In old IE versions, the console isn't present until you first open it.
	    // We build realMethod() replacements here that regenerate logging methods
	    function enableLoggingWhenConsoleArrives(methodName, level, loggerName) {
	        return function () {
	            if (typeof console !== undefinedType) {
	                replaceLoggingMethods.call(this, level, loggerName);
	                this[methodName].apply(this, arguments);
	            }
	        };
	    }

	    // By default, we use closely bound real methods wherever possible, and
	    // otherwise we wait for a console to appear, and then try again.
	    function defaultMethodFactory(methodName, level, loggerName) {
	        /*jshint validthis:true */
	        return realMethod(methodName) ||
	               enableLoggingWhenConsoleArrives.apply(this, arguments);
	    }

	    function Logger(name, defaultLevel, factory) {
	      var self = this;
	      var currentLevel;
	      var storageKey = "loglevel";
	      if (name) {
	        storageKey += ":" + name;
	      }

	      function persistLevelIfPossible(levelNum) {
	          var levelName = (logMethods[levelNum] || 'silent').toUpperCase();

	          if (typeof window === undefinedType) return;

	          // Use localStorage if available
	          try {
	              window.localStorage[storageKey] = levelName;
	              return;
	          } catch (ignore) {}

	          // Use session cookie as fallback
	          try {
	              window.document.cookie =
	                encodeURIComponent(storageKey) + "=" + levelName + ";";
	          } catch (ignore) {}
	      }

	      function getPersistedLevel() {
	          var storedLevel;

	          if (typeof window === undefinedType) return;

	          try {
	              storedLevel = window.localStorage[storageKey];
	          } catch (ignore) {}

	          // Fallback to cookies if local storage gives us nothing
	          if (typeof storedLevel === undefinedType) {
	              try {
	                  var cookie = window.document.cookie;
	                  var location = cookie.indexOf(
	                      encodeURIComponent(storageKey) + "=");
	                  if (location !== -1) {
	                      storedLevel = /^([^;]+)/.exec(cookie.slice(location))[1];
	                  }
	              } catch (ignore) {}
	          }

	          // If the stored level is not valid, treat it as if nothing was stored.
	          if (self.levels[storedLevel] === undefined) {
	              storedLevel = undefined;
	          }

	          return storedLevel;
	      }

	      /*
	       *
	       * Public logger API - see https://github.com/pimterry/loglevel for details
	       *
	       */

	      self.name = name;

	      self.levels = { "TRACE": 0, "DEBUG": 1, "INFO": 2, "WARN": 3,
	          "ERROR": 4, "SILENT": 5};

	      self.methodFactory = factory || defaultMethodFactory;

	      self.getLevel = function () {
	          return currentLevel;
	      };

	      self.setLevel = function (level, persist) {
	          if (typeof level === "string" && self.levels[level.toUpperCase()] !== undefined) {
	              level = self.levels[level.toUpperCase()];
	          }
	          if (typeof level === "number" && level >= 0 && level <= self.levels.SILENT) {
	              currentLevel = level;
	              if (persist !== false) {  // defaults to true
	                  persistLevelIfPossible(level);
	              }
	              replaceLoggingMethods.call(self, level, name);
	              if (typeof console === undefinedType && level < self.levels.SILENT) {
	                  return "No console available for logging";
	              }
	          } else {
	              throw "log.setLevel() called with invalid level: " + level;
	          }
	      };

	      self.setDefaultLevel = function (level) {
	          if (!getPersistedLevel()) {
	              self.setLevel(level, false);
	          }
	      };

	      self.enableAll = function(persist) {
	          self.setLevel(self.levels.TRACE, persist);
	      };

	      self.disableAll = function(persist) {
	          self.setLevel(self.levels.SILENT, persist);
	      };

	      // Initialize with the right level
	      var initialLevel = getPersistedLevel();
	      if (initialLevel == null) {
	          initialLevel = defaultLevel == null ? "WARN" : defaultLevel;
	      }
	      self.setLevel(initialLevel, false);
	    }

	    /*
	     *
	     * Top-level API
	     *
	     */

	    var defaultLogger = new Logger();

	    var _loggersByName = {};
	    defaultLogger.getLogger = function getLogger(name) {
	        if (typeof name !== "string" || name === "") {
	          throw new TypeError("You must supply a name when creating a logger.");
	        }

	        var logger = _loggersByName[name];
	        if (!logger) {
	          logger = _loggersByName[name] = new Logger(
	            name, defaultLogger.getLevel(), defaultLogger.methodFactory);
	        }
	        return logger;
	    };

	    // Grab the current global log variable in case of overwrite
	    var _log = (typeof window !== undefinedType) ? window.log : undefined;
	    defaultLogger.noConflict = function() {
	        if (typeof window !== undefinedType &&
	               window.log === defaultLogger) {
	            window.log = _log;
	        }

	        return defaultLogger;
	    };

	    defaultLogger.getLoggers = function getLoggers() {
	        return _loggersByName;
	    };

	    return defaultLogger;
	}));
	});

	// @ts-expect-error Will be injected in build time
	const isDebug = true === true;
	const initLogger = (prefix, dev = true) => {
	    // eslint-disable-next-line no-underscore-dangle
	    const _logger = loglevel.getLogger(prefix);
	    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
	    _logger.methodFactory = (methodName, logLevel, loggerName) => {
	        const originalFactory = loglevel.methodFactory, rawMethod = originalFactory(methodName, logLevel, loggerName);
	        // eslint-disable-next-line @typescript-eslint/explicit-function-return-type,func-names
	        return function () {
	            rawMethod(`${prefix} ${new Date().toUTCString()}`, 
	            // eslint-disable-next-line prefer-rest-params
	            ...arguments);
	        };
	    };
	    if (dev) {
	        _logger.enableAll();
	    }
	    else {
	        // eslint-disable-next-line @typescript-eslint/no-magic-numbers
	        _logger.setLevel(4);
	    }
	    return _logger;
	}, logger = initLogger('ObserverRTC', isDebug);

	class CronInterval {
	    constructor() {
	        this.runInternal = this.runInternal.bind(this);
	    }
	    start(runnable, intervalDurationInMs) {
	        this._runnable = runnable;
	        this._intervalDurationInMs = intervalDurationInMs;
	        this.runInternal();
	    }
	    stop() {
	        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
	        if (this._runId) {
	            clearTimeout(this._runId);
	            // eslint-disable-next-line no-undefined
	            this._runId = undefined;
	        }
	    }
	    runInternal() {
	        var _a;
	        (_a = this._runnable) === null || _a === void 0 ? void 0 : _a.execute();
	        this._runId = setTimeout(this.runInternal.bind(this), this._intervalDurationInMs);
	    }
	}

	class ProcessorWorker {
	    constructor(_workerCallback) {
	        this._workerCallback = _workerCallback;
	        this.setWorkerScope = this.setWorkerScope.bind(this);
	        this.onMessage = this.onMessage.bind(this);
	        this.requestInitialConfig = this.requestInitialConfig.bind(this);
	        this.requestRawStats = this.requestRawStats.bind(this);
	        this.sendTransportData = this.sendTransportData.bind(this);
	    }
	    setWorkerScope(workerScope) {
	        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
	        this._workerScope = workerScope;
	    }
	    onMessage(msg) {
	        var _a, _b, _c;
	        const data = msg.data;
	        switch (data.what) {
	            case 'onRequestRawStats':
	                (_a = this._workerCallback) === null || _a === void 0 ? void 0 : _a.onResponseRawStats(data.data);
	                return;
	            case 'onRequestInitialConfig':
	                (_b = this._workerCallback) === null || _b === void 0 ? void 0 : _b.onResponseInitialConfig(data.data);
	                return;
	            case 'onUserMediaError':
	                (_c = this._workerCallback) === null || _c === void 0 ? void 0 : _c.onUserMediaError(data.data);
	                return;
	            default:
	                logger.warn('unknown types', data);
	        }
	    }
	    requestInitialConfig() {
	        // eslint-disable-next-line @typescript-eslint/no-unsafe-call,@typescript-eslint/no-unsafe-member-access
	        this._workerScope.postMessage({ 'what': 'requestInitialConfig' });
	    }
	    requestRawStats() {
	        // eslint-disable-next-line @typescript-eslint/no-unsafe-call,@typescript-eslint/no-unsafe-member-access
	        this._workerScope.postMessage({ 'what': 'requestRawStats' });
	    }
	    sendTransportData(samples) {
	        // eslint-disable-next-line @typescript-eslint/no-unsafe-call,@typescript-eslint/no-unsafe-member-access
	        this._workerScope.postMessage({
	            'data': samples,
	            'what': 'onLocalTransport'
	        });
	    }
	}

	class MediaSoupOptimizer {
	    isMediaSoupIntegration(rawStats) {
	        // eslint-disable-next-line @typescript-eslint/no-magic-numbers,@typescript-eslint/no-unnecessary-condition,@typescript-eslint/strict-boolean-expressions
	        return rawStats && rawStats.length > 0 && rawStats[0].details.integration === 'Mediasoup';
	    }
	    filterShortCalls(rawStats) {
	        return rawStats.filter(this.hasStats.bind(this));
	    }
	    hasStats(rawStats) {
	        // eslint-disable-next-line @typescript-eslint/no-magic-numbers
	        return rawStats.stats.receiverStats.length > 0 || rawStats.stats.senderStats.length > 0;
	    }
	}

	class TokBoxOptimizer {
	    isTokBoxIntegration(rawStats) {
	        // eslint-disable-next-line @typescript-eslint/no-magic-numbers,@typescript-eslint/no-unnecessary-condition,@typescript-eslint/strict-boolean-expressions
	        return rawStats && rawStats.length > 0 && rawStats[0].details.integration === 'TokBox';
	    }
	    filterShortCalls(rawStats) {
	        return rawStats.filter(this.hasStats.bind(this));
	    }
	    hasStats(rawStats) {
	        // eslint-disable-next-line @typescript-eslint/no-magic-numbers
	        return rawStats.stats.receiverStats.length > 0 || rawStats.stats.senderStats.length > 0;
	    }
	}

	class IntegrationOptimizer {
	    constructor() {
	        this._tokBoxOptimizer = new TokBoxOptimizer();
	        this._mediaSoupOptimizer = new MediaSoupOptimizer();
	    }
	    optimize(rawStats) {
	        if (this._tokBoxOptimizer.isTokBoxIntegration(rawStats)) {
	            return this._tokBoxOptimizer.filterShortCalls(rawStats);
	        }
	        if (this._mediaSoupOptimizer.isMediaSoupIntegration(rawStats)) {
	            return this._mediaSoupOptimizer.filterShortCalls(rawStats);
	        }
	        return rawStats;
	    }
	}

	// eslint-disable-next-line @typescript-eslint/no-extraneous-class
	class StatsMap {
	    static localCandidate(candidate) {
	        const { candidateType, deleted, id, ip, isRemote, networkType, port, priority, protocol, transportId } = candidate;
	        return {
	            candidateType,
	            deleted,
	            id,
	            ip,
	            isRemote,
	            networkType,
	            port,
	            priority,
	            protocol,
	            transportId
	        };
	    }
	    static remoteCandidate(candidate) {
	        const { candidateType, deleted, id, ip, isRemote, port, priority, protocol, transportId } = candidate;
	        return {
	            candidateType,
	            deleted,
	            id,
	            ip,
	            isRemote,
	            port,
	            priority,
	            protocol,
	            transportId
	        };
	    }
	    static candidatePair(candidatePair) {
	        const { availableOutgoingBitrate, bytesReceived, bytesSent, consentRequestsSent, currentRoundTripTime, id, localCandidateId, nominated, priority, remoteCandidateId, requestsReceived, requestsSent, responsesReceived, responsesSent, state, totalRoundTripTime, transportId, writable } = candidatePair;
	        return {
	            availableOutgoingBitrate,
	            bytesReceived,
	            bytesSent,
	            consentRequestsSent,
	            currentRoundTripTime,
	            id,
	            localCandidateId,
	            nominated,
	            priority,
	            remoteCandidateId,
	            requestsReceived,
	            requestsSent,
	            responsesReceived,
	            responsesSent,
	            state,
	            totalRoundTripTime,
	            transportId,
	            writable
	        };
	    }
	    static mediaSource(stats) {
	        const { audioLevel, framesPerSecond, height, id, mediaType, totalAudioEnergy, totalSamplesDuration, trackId, width } = stats;
	        return {
	            audioLevel,
	            framesPerSecond,
	            height,
	            id,
	            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access,@typescript-eslint/strict-boolean-expressions,@typescript-eslint/no-unsafe-assignment,@typescript-eslint/prefer-nullish-coalescing
	            'mediaType': mediaType || stats.kind,
	            totalAudioEnergy,
	            totalSamplesDuration,
	            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access,@typescript-eslint/strict-boolean-expressions,@typescript-eslint/no-unsafe-assignment,@typescript-eslint/prefer-nullish-coalescing
	            'trackId': trackId || stats.trackIdentifier,
	            width
	        };
	    }
	    // eslint-disable-next-line max-lines-per-function
	    static inboundRTPStatElement(stats) {
	        const { bytesReceived, codecId, decoderImplementation, estimatedPlayoutTimestamp, fecPacketsDiscarded, fecPacketsReceived, firCount, framesDecoded, headerBytesReceived, id, isRemote, jitter, keyFramesDecoded, lastPacketReceivedTimestamp, mediaType, nackCount, packetsLost, packetsReceived, pliCount, qpSum, ssrc, totalDecodeTime, totalInterFrameDelay, totalSquaredInterFrameDelay, trackId, transportId } = stats;
	        return {
	            bytesReceived,
	            codecId,
	            decoderImplementation,
	            estimatedPlayoutTimestamp,
	            fecPacketsDiscarded,
	            fecPacketsReceived,
	            firCount,
	            framesDecoded,
	            headerBytesReceived,
	            id,
	            isRemote,
	            jitter,
	            keyFramesDecoded,
	            lastPacketReceivedTimestamp,
	            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access,@typescript-eslint/strict-boolean-expressions,@typescript-eslint/no-unsafe-assignment,@typescript-eslint/prefer-nullish-coalescing
	            'mediaType': mediaType || stats.kind,
	            nackCount,
	            packetsLost,
	            packetsReceived,
	            pliCount,
	            qpSum,
	            ssrc,
	            totalDecodeTime,
	            totalInterFrameDelay,
	            totalSquaredInterFrameDelay,
	            trackId,
	            transportId
	        };
	    }
	    // eslint-disable-next-line max-lines-per-function
	    static outboundRTPStatElement(stats) {
	        const { bytesSent, codecId, encoderImplementation, firCount, framesEncoded, headerBytesSent, id, isRemote, keyFramesEncoded, mediaSourceId, mediaType, nackCount, packetsSent, pliCount, qpSum, qualityLimitationReason, qualityLimitationResolutionChanges, remoteId, retransmittedBytesSent, retransmittedPacketsSent, ssrc, totalEncodedBytesTarget, totalEncodeTime, totalPacketSendDelay, trackId, transportId } = stats;
	        return {
	            bytesSent,
	            codecId,
	            encoderImplementation,
	            firCount,
	            framesEncoded,
	            headerBytesSent,
	            id,
	            isRemote,
	            keyFramesEncoded,
	            mediaSourceId,
	            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access,@typescript-eslint/strict-boolean-expressions,@typescript-eslint/no-unsafe-assignment,@typescript-eslint/prefer-nullish-coalescing
	            'mediaType': mediaType || stats.kind,
	            nackCount,
	            packetsSent,
	            pliCount,
	            qpSum,
	            qualityLimitationReason,
	            qualityLimitationResolutionChanges,
	            remoteId,
	            retransmittedBytesSent,
	            retransmittedPacketsSent,
	            ssrc,
	            totalEncodeTime,
	            totalEncodedBytesTarget,
	            totalPacketSendDelay,
	            trackId,
	            transportId
	        };
	    }
	    static remoteInboundRTPStatElement(stats) {
	        const { codecId, id, jitter, localId, mediaType, packetsLost, roundTripTime, ssrc, transportId } = stats;
	        return {
	            codecId,
	            id,
	            jitter,
	            localId,
	            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access,@typescript-eslint/strict-boolean-expressions,@typescript-eslint/no-unsafe-assignment,@typescript-eslint/prefer-nullish-coalescing
	            'mediaType': mediaType || stats.kind,
	            packetsLost,
	            roundTripTime,
	            ssrc,
	            transportId
	        };
	    }
	    // eslint-disable-next-line
	    static track(stats) {
	        const { concealedSamples, concealmentEvents, detached, ended, framesDecoded, framesDropped, framesReceived, hugeFramesSent, id, insertedSamplesForDeceleration, jitterBufferDelay, jitterBufferEmittedCount, mediaSourceId, mediaType, remoteSource, removedSamplesForAcceleration, samplesDuration, silentConcealedSamples, totalSamplesReceived } = stats;
	        return {
	            concealedSamples,
	            concealmentEvents,
	            detached,
	            ended,
	            framesDecoded,
	            framesDropped,
	            framesReceived,
	            hugeFramesSent,
	            id,
	            insertedSamplesForDeceleration,
	            jitterBufferDelay,
	            jitterBufferEmittedCount,
	            mediaSourceId,
	            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access,@typescript-eslint/strict-boolean-expressions,@typescript-eslint/no-unsafe-assignment,@typescript-eslint/prefer-nullish-coalescing
	            'mediaType': mediaType || stats.kind,
	            remoteSource,
	            removedSamplesForAcceleration,
	            samplesDuration,
	            silentConcealedSamples,
	            totalSamplesReceived
	        };
	    }
	}

	// eslint-disable-next-line @typescript-eslint/no-extraneous-class
	class RawStatsProcessor {
	    static getSendRecvStats(rawStats) {
	        const inboundRTPStats = rawStats.filter((stats) => stats.type === 'inbound-rtp').map((stats) => StatsMap.inboundRTPStatElement(stats));
	        const mediaSources = rawStats.filter((stats) => stats.type === 'media-source').map((stats) => StatsMap.mediaSource(stats));
	        const outboundRTPStats = rawStats.filter((stats) => stats.type === 'outbound-rtp').map((stats) => StatsMap.outboundRTPStatElement(stats));
	        const remoteInboundRTPStats = rawStats.filter((stats) => stats.type === 'remote-inbound-rtp').map((stats) => StatsMap.remoteInboundRTPStatElement(stats));
	        const tracks = rawStats.filter((stats) => stats.type === 'track').map((stats) => StatsMap.track(stats));
	        return {
	            inboundRTPStats,
	            mediaSources,
	            outboundRTPStats,
	            remoteInboundRTPStats,
	            tracks
	        };
	    }
	    static getIceStats(observerStats) {
	        const { receiverStats, senderStats } = observerStats;
	        const localCandidates = [
	            ...receiverStats.map((item) => item).filter((item) => item.type === 'local-candidate'),
	            ...senderStats.map((item) => item).filter((item) => item.type === 'local-candidate')
	        ].map((stats) => StatsMap.localCandidate(stats));
	        const remoteCandidates = [
	            ...receiverStats.map((item) => item).filter((item) => item.type === 'remote-candidate'),
	            ...senderStats.map((item) => item).filter((item) => item.type === 'remote-candidate')
	        ].map((stats) => StatsMap.remoteCandidate(stats));
	        const candidatePairs = [
	            ...receiverStats.map((item) => item).filter((item) => item.type === 'candidate-pair'),
	            ...senderStats.map((item) => item).filter((item) => item.type === 'candidate-pair')
	        ].map((stats) => StatsMap.candidatePair(stats));
	        return {
	            candidatePairs,
	            localCandidates,
	            remoteCandidates
	        };
	    }
	}

	// eslint-disable-next-line @typescript-eslint/no-extraneous-class
	class TimeUtil {
	    static getCurrent() {
	        return Date.now();
	    }
	    static getTimeZoneOffsetInMinute() {
	        const timezoneOffset = new Date().getTimezoneOffset();
	        return timezoneOffset;
	    }
	}

	// 15 seconds
	const statsExpireTime = 15000;
	class StatsOptimizer {
	    constructor() {
	        this._lastStatList = [];
	        this.addStatBulk = this.addStatBulk.bind(this);
	        this.getLast = this.getLast.bind(this);
	        this.removeOldBulk = this.removeOldBulk.bind(this);
	        this.isEqual = this.isEqual.bind(this);
	        this.excludeSameCandidates = this.excludeSameCandidates.bind(this);
	    }
	    excludeSameCandidates(currentStats) {
	        var _a, _b, _c, _d, _e, _f;
	        const previousStats = this.getLast(currentStats);
	        if (!previousStats) {
	            return currentStats;
	        }
	        const retval = JSON.parse(JSON.stringify(currentStats));
	        if (this.isEqual((_a = previousStats.iceStats) === null || _a === void 0 ? void 0 : _a.localCandidates, (_b = currentStats.iceStats) === null || _b === void 0 ? void 0 : _b.localCandidates)) {
	            (_c = retval.iceStats) === null || _c === void 0 ? true : delete _c.localCandidates;
	        }
	        if (this.isEqual((_d = previousStats.iceStats) === null || _d === void 0 ? void 0 : _d.remoteCandidates, (_e = currentStats.iceStats) === null || _e === void 0 ? void 0 : _e.remoteCandidates)) {
	            (_f = retval.iceStats) === null || _f === void 0 ? true : delete _f.remoteCandidates;
	        }
	        return retval;
	    }
	    addStatBulk(currentStatsList) {
	        this._lastStatList.push(...currentStatsList);
	        this.removeOldBulk();
	    }
	    isEqual(previousCandidate = [], currentCandidate = []) {
	        return currentCandidate.
	            every((candidate) => previousCandidate.
	            some((item) => item.id === candidate.id));
	    }
	    removeOldBulk() {
	        const now = TimeUtil.getCurrent();
	        /*
	         * Only keep new stats that does not cross 'statsExpireTime'
	         * and does not already have a entry
	         */
	        this._lastStatList = this._lastStatList.
	            filter((pcStats) => now - pcStats.timestamp < statsExpireTime);
	    }
	    getLast(currentStats) {
	        // eslint-disable-next-line @typescript-eslint/no-magic-numbers
	        for (let index = this._lastStatList.length - 1; index >= 0; index -= 1) {
	            if (this._lastStatList[index].peerConnectionId === currentStats.peerConnectionId) {
	                return this._lastStatList[index];
	            }
	        }
	        // eslint-disable-next-line no-undefined
	        return undefined;
	    }
	}

	/*! *****************************************************************************
	Copyright (c) Microsoft Corporation. All rights reserved.
	Licensed under the Apache License, Version 2.0 (the "License"); you may not use
	this file except in compliance with the License. You may obtain a copy of the
	License at http://www.apache.org/licenses/LICENSE-2.0

	THIS CODE IS PROVIDED ON AN *AS IS* BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
	KIND, EITHER EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION ANY IMPLIED
	WARRANTIES OR CONDITIONS OF TITLE, FITNESS FOR A PARTICULAR PURPOSE,
	MERCHANTABLITY OR NON-INFRINGEMENT.

	See the Apache Version 2.0 License for specific language governing permissions
	and limitations under the License.
	***************************************************************************** */
	/* global Reflect, Promise */

	var extendStatics = function(d, b) {
	    extendStatics = Object.setPrototypeOf ||
	        ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
	        function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
	    return extendStatics(d, b);
	};

	function __extends(d, b) {
	    extendStatics(d, b);
	    function __() { this.constructor = d; }
	    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
	}

	function __values(o) {
	    var m = typeof Symbol === "function" && o[Symbol.iterator], i = 0;
	    if (m) return m.call(o);
	    return {
	        next: function () {
	            if (o && i >= o.length) o = void 0;
	            return { value: o && o[i++], done: !o };
	        }
	    };
	}

	function __read(o, n) {
	    var m = typeof Symbol === "function" && o[Symbol.iterator];
	    if (!m) return o;
	    var i = m.call(o), r, ar = [], e;
	    try {
	        while ((n === void 0 || n-- > 0) && !(r = i.next()).done) ar.push(r.value);
	    }
	    catch (error) { e = { error: error }; }
	    finally {
	        try {
	            if (r && !r.done && (m = i["return"])) m.call(i);
	        }
	        finally { if (e) throw e.error; }
	    }
	    return ar;
	}

	function __spread() {
	    for (var ar = [], i = 0; i < arguments.length; i++)
	        ar = ar.concat(__read(arguments[i]));
	    return ar;
	}

	var Event = /** @class */ (function () {
	    function Event(type, target) {
	        this.target = target;
	        this.type = type;
	    }
	    return Event;
	}());
	var ErrorEvent = /** @class */ (function (_super) {
	    __extends(ErrorEvent, _super);
	    function ErrorEvent(error, target) {
	        var _this = _super.call(this, 'error', target) || this;
	        _this.message = error.message;
	        _this.error = error;
	        return _this;
	    }
	    return ErrorEvent;
	}(Event));
	var CloseEvent = /** @class */ (function (_super) {
	    __extends(CloseEvent, _super);
	    function CloseEvent(code, reason, target) {
	        if (code === void 0) { code = 1000; }
	        if (reason === void 0) { reason = ''; }
	        var _this = _super.call(this, 'close', target) || this;
	        _this.wasClean = true;
	        _this.code = code;
	        _this.reason = reason;
	        return _this;
	    }
	    return CloseEvent;
	}(Event));

	/*!
	 * Reconnecting WebSocket
	 * by Pedro Ladaria <pedro.ladaria@gmail.com>
	 * https://github.com/pladaria/reconnecting-websocket
	 * License MIT
	 */
	var getGlobalWebSocket = function () {
	    if (typeof WebSocket !== 'undefined') {
	        // @ts-ignore
	        return WebSocket;
	    }
	};
	/**
	 * Returns true if given argument looks like a WebSocket class
	 */
	var isWebSocket = function (w) { return typeof w !== 'undefined' && !!w && w.CLOSING === 2; };
	var DEFAULT = {
	    maxReconnectionDelay: 10000,
	    minReconnectionDelay: 1000 + Math.random() * 4000,
	    minUptime: 5000,
	    reconnectionDelayGrowFactor: 1.3,
	    connectionTimeout: 4000,
	    maxRetries: Infinity,
	    maxEnqueuedMessages: Infinity,
	    startClosed: false,
	    debug: false,
	};
	var ReconnectingWebSocket = /** @class */ (function () {
	    function ReconnectingWebSocket(url, protocols, options) {
	        var _this = this;
	        if (options === void 0) { options = {}; }
	        this._listeners = {
	            error: [],
	            message: [],
	            open: [],
	            close: [],
	        };
	        this._retryCount = -1;
	        this._shouldReconnect = true;
	        this._connectLock = false;
	        this._binaryType = 'blob';
	        this._closeCalled = false;
	        this._messageQueue = [];
	        /**
	         * An event listener to be called when the WebSocket connection's readyState changes to CLOSED
	         */
	        this.onclose = null;
	        /**
	         * An event listener to be called when an error occurs
	         */
	        this.onerror = null;
	        /**
	         * An event listener to be called when a message is received from the server
	         */
	        this.onmessage = null;
	        /**
	         * An event listener to be called when the WebSocket connection's readyState changes to OPEN;
	         * this indicates that the connection is ready to send and receive data
	         */
	        this.onopen = null;
	        this._handleOpen = function (event) {
	            _this._debug('open event');
	            var _a = _this._options.minUptime, minUptime = _a === void 0 ? DEFAULT.minUptime : _a;
	            clearTimeout(_this._connectTimeout);
	            _this._uptimeTimeout = setTimeout(function () { return _this._acceptOpen(); }, minUptime);
	            _this._ws.binaryType = _this._binaryType;
	            // send enqueued messages (messages sent before websocket open event)
	            _this._messageQueue.forEach(function (message) { return _this._ws.send(message); });
	            _this._messageQueue = [];
	            if (_this.onopen) {
	                _this.onopen(event);
	            }
	            _this._listeners.open.forEach(function (listener) { return _this._callEventListener(event, listener); });
	        };
	        this._handleMessage = function (event) {
	            _this._debug('message event');
	            if (_this.onmessage) {
	                _this.onmessage(event);
	            }
	            _this._listeners.message.forEach(function (listener) { return _this._callEventListener(event, listener); });
	        };
	        this._handleError = function (event) {
	            _this._debug('error event', event.message);
	            _this._disconnect(undefined, event.message === 'TIMEOUT' ? 'timeout' : undefined);
	            if (_this.onerror) {
	                _this.onerror(event);
	            }
	            _this._debug('exec error listeners');
	            _this._listeners.error.forEach(function (listener) { return _this._callEventListener(event, listener); });
	            _this._connect();
	        };
	        this._handleClose = function (event) {
	            _this._debug('close event');
	            _this._clearTimeouts();
	            if (_this._shouldReconnect) {
	                _this._connect();
	            }
	            if (_this.onclose) {
	                _this.onclose(event);
	            }
	            _this._listeners.close.forEach(function (listener) { return _this._callEventListener(event, listener); });
	        };
	        this._url = url;
	        this._protocols = protocols;
	        this._options = options;
	        if (this._options.startClosed) {
	            this._shouldReconnect = false;
	        }
	        this._connect();
	    }
	    Object.defineProperty(ReconnectingWebSocket, "CONNECTING", {
	        get: function () {
	            return 0;
	        },
	        enumerable: true,
	        configurable: true
	    });
	    Object.defineProperty(ReconnectingWebSocket, "OPEN", {
	        get: function () {
	            return 1;
	        },
	        enumerable: true,
	        configurable: true
	    });
	    Object.defineProperty(ReconnectingWebSocket, "CLOSING", {
	        get: function () {
	            return 2;
	        },
	        enumerable: true,
	        configurable: true
	    });
	    Object.defineProperty(ReconnectingWebSocket, "CLOSED", {
	        get: function () {
	            return 3;
	        },
	        enumerable: true,
	        configurable: true
	    });
	    Object.defineProperty(ReconnectingWebSocket.prototype, "CONNECTING", {
	        get: function () {
	            return ReconnectingWebSocket.CONNECTING;
	        },
	        enumerable: true,
	        configurable: true
	    });
	    Object.defineProperty(ReconnectingWebSocket.prototype, "OPEN", {
	        get: function () {
	            return ReconnectingWebSocket.OPEN;
	        },
	        enumerable: true,
	        configurable: true
	    });
	    Object.defineProperty(ReconnectingWebSocket.prototype, "CLOSING", {
	        get: function () {
	            return ReconnectingWebSocket.CLOSING;
	        },
	        enumerable: true,
	        configurable: true
	    });
	    Object.defineProperty(ReconnectingWebSocket.prototype, "CLOSED", {
	        get: function () {
	            return ReconnectingWebSocket.CLOSED;
	        },
	        enumerable: true,
	        configurable: true
	    });
	    Object.defineProperty(ReconnectingWebSocket.prototype, "binaryType", {
	        get: function () {
	            return this._ws ? this._ws.binaryType : this._binaryType;
	        },
	        set: function (value) {
	            this._binaryType = value;
	            if (this._ws) {
	                this._ws.binaryType = value;
	            }
	        },
	        enumerable: true,
	        configurable: true
	    });
	    Object.defineProperty(ReconnectingWebSocket.prototype, "retryCount", {
	        /**
	         * Returns the number or connection retries
	         */
	        get: function () {
	            return Math.max(this._retryCount, 0);
	        },
	        enumerable: true,
	        configurable: true
	    });
	    Object.defineProperty(ReconnectingWebSocket.prototype, "bufferedAmount", {
	        /**
	         * The number of bytes of data that have been queued using calls to send() but not yet
	         * transmitted to the network. This value resets to zero once all queued data has been sent.
	         * This value does not reset to zero when the connection is closed; if you keep calling send(),
	         * this will continue to climb. Read only
	         */
	        get: function () {
	            var bytes = this._messageQueue.reduce(function (acc, message) {
	                if (typeof message === 'string') {
	                    acc += message.length; // not byte size
	                }
	                else if (message instanceof Blob) {
	                    acc += message.size;
	                }
	                else {
	                    acc += message.byteLength;
	                }
	                return acc;
	            }, 0);
	            return bytes + (this._ws ? this._ws.bufferedAmount : 0);
	        },
	        enumerable: true,
	        configurable: true
	    });
	    Object.defineProperty(ReconnectingWebSocket.prototype, "extensions", {
	        /**
	         * The extensions selected by the server. This is currently only the empty string or a list of
	         * extensions as negotiated by the connection
	         */
	        get: function () {
	            return this._ws ? this._ws.extensions : '';
	        },
	        enumerable: true,
	        configurable: true
	    });
	    Object.defineProperty(ReconnectingWebSocket.prototype, "protocol", {
	        /**
	         * A string indicating the name of the sub-protocol the server selected;
	         * this will be one of the strings specified in the protocols parameter when creating the
	         * WebSocket object
	         */
	        get: function () {
	            return this._ws ? this._ws.protocol : '';
	        },
	        enumerable: true,
	        configurable: true
	    });
	    Object.defineProperty(ReconnectingWebSocket.prototype, "readyState", {
	        /**
	         * The current state of the connection; this is one of the Ready state constants
	         */
	        get: function () {
	            if (this._ws) {
	                return this._ws.readyState;
	            }
	            return this._options.startClosed
	                ? ReconnectingWebSocket.CLOSED
	                : ReconnectingWebSocket.CONNECTING;
	        },
	        enumerable: true,
	        configurable: true
	    });
	    Object.defineProperty(ReconnectingWebSocket.prototype, "url", {
	        /**
	         * The URL as resolved by the constructor
	         */
	        get: function () {
	            return this._ws ? this._ws.url : '';
	        },
	        enumerable: true,
	        configurable: true
	    });
	    /**
	     * Closes the WebSocket connection or connection attempt, if any. If the connection is already
	     * CLOSED, this method does nothing
	     */
	    ReconnectingWebSocket.prototype.close = function (code, reason) {
	        if (code === void 0) { code = 1000; }
	        this._closeCalled = true;
	        this._shouldReconnect = false;
	        this._clearTimeouts();
	        if (!this._ws) {
	            this._debug('close enqueued: no ws instance');
	            return;
	        }
	        if (this._ws.readyState === this.CLOSED) {
	            this._debug('close: already closed');
	            return;
	        }
	        this._ws.close(code, reason);
	    };
	    /**
	     * Closes the WebSocket connection or connection attempt and connects again.
	     * Resets retry counter;
	     */
	    ReconnectingWebSocket.prototype.reconnect = function (code, reason) {
	        this._shouldReconnect = true;
	        this._closeCalled = false;
	        this._retryCount = -1;
	        if (!this._ws || this._ws.readyState === this.CLOSED) {
	            this._connect();
	        }
	        else {
	            this._disconnect(code, reason);
	            this._connect();
	        }
	    };
	    /**
	     * Enqueue specified data to be transmitted to the server over the WebSocket connection
	     */
	    ReconnectingWebSocket.prototype.send = function (data) {
	        if (this._ws && this._ws.readyState === this.OPEN) {
	            this._debug('send', data);
	            this._ws.send(data);
	        }
	        else {
	            var _a = this._options.maxEnqueuedMessages, maxEnqueuedMessages = _a === void 0 ? DEFAULT.maxEnqueuedMessages : _a;
	            if (this._messageQueue.length < maxEnqueuedMessages) {
	                this._debug('enqueue', data);
	                this._messageQueue.push(data);
	            }
	        }
	    };
	    /**
	     * Register an event handler of a specific event type
	     */
	    ReconnectingWebSocket.prototype.addEventListener = function (type, listener) {
	        if (this._listeners[type]) {
	            // @ts-ignore
	            this._listeners[type].push(listener);
	        }
	    };
	    ReconnectingWebSocket.prototype.dispatchEvent = function (event) {
	        var e_1, _a;
	        var listeners = this._listeners[event.type];
	        if (listeners) {
	            try {
	                for (var listeners_1 = __values(listeners), listeners_1_1 = listeners_1.next(); !listeners_1_1.done; listeners_1_1 = listeners_1.next()) {
	                    var listener = listeners_1_1.value;
	                    this._callEventListener(event, listener);
	                }
	            }
	            catch (e_1_1) { e_1 = { error: e_1_1 }; }
	            finally {
	                try {
	                    if (listeners_1_1 && !listeners_1_1.done && (_a = listeners_1.return)) _a.call(listeners_1);
	                }
	                finally { if (e_1) throw e_1.error; }
	            }
	        }
	        return true;
	    };
	    /**
	     * Removes an event listener
	     */
	    ReconnectingWebSocket.prototype.removeEventListener = function (type, listener) {
	        if (this._listeners[type]) {
	            // @ts-ignore
	            this._listeners[type] = this._listeners[type].filter(function (l) { return l !== listener; });
	        }
	    };
	    ReconnectingWebSocket.prototype._debug = function () {
	        var args = [];
	        for (var _i = 0; _i < arguments.length; _i++) {
	            args[_i] = arguments[_i];
	        }
	        if (this._options.debug) {
	            // not using spread because compiled version uses Symbols
	            // tslint:disable-next-line
	            console.log.apply(console, __spread(['RWS>'], args));
	        }
	    };
	    ReconnectingWebSocket.prototype._getNextDelay = function () {
	        var _a = this._options, _b = _a.reconnectionDelayGrowFactor, reconnectionDelayGrowFactor = _b === void 0 ? DEFAULT.reconnectionDelayGrowFactor : _b, _c = _a.minReconnectionDelay, minReconnectionDelay = _c === void 0 ? DEFAULT.minReconnectionDelay : _c, _d = _a.maxReconnectionDelay, maxReconnectionDelay = _d === void 0 ? DEFAULT.maxReconnectionDelay : _d;
	        var delay = 0;
	        if (this._retryCount > 0) {
	            delay =
	                minReconnectionDelay * Math.pow(reconnectionDelayGrowFactor, this._retryCount - 1);
	            if (delay > maxReconnectionDelay) {
	                delay = maxReconnectionDelay;
	            }
	        }
	        this._debug('next delay', delay);
	        return delay;
	    };
	    ReconnectingWebSocket.prototype._wait = function () {
	        var _this = this;
	        return new Promise(function (resolve) {
	            setTimeout(resolve, _this._getNextDelay());
	        });
	    };
	    ReconnectingWebSocket.prototype._getNextUrl = function (urlProvider) {
	        if (typeof urlProvider === 'string') {
	            return Promise.resolve(urlProvider);
	        }
	        if (typeof urlProvider === 'function') {
	            var url = urlProvider();
	            if (typeof url === 'string') {
	                return Promise.resolve(url);
	            }
	            if (!!url.then) {
	                return url;
	            }
	        }
	        throw Error('Invalid URL');
	    };
	    ReconnectingWebSocket.prototype._connect = function () {
	        var _this = this;
	        if (this._connectLock || !this._shouldReconnect) {
	            return;
	        }
	        this._connectLock = true;
	        var _a = this._options, _b = _a.maxRetries, maxRetries = _b === void 0 ? DEFAULT.maxRetries : _b, _c = _a.connectionTimeout, connectionTimeout = _c === void 0 ? DEFAULT.connectionTimeout : _c, _d = _a.WebSocket, WebSocket = _d === void 0 ? getGlobalWebSocket() : _d;
	        if (this._retryCount >= maxRetries) {
	            this._debug('max retries reached', this._retryCount, '>=', maxRetries);
	            return;
	        }
	        this._retryCount++;
	        this._debug('connect', this._retryCount);
	        this._removeListeners();
	        if (!isWebSocket(WebSocket)) {
	            throw Error('No valid WebSocket class provided');
	        }
	        this._wait()
	            .then(function () { return _this._getNextUrl(_this._url); })
	            .then(function (url) {
	            // close could be called before creating the ws
	            if (_this._closeCalled) {
	                return;
	            }
	            _this._debug('connect', { url: url, protocols: _this._protocols });
	            _this._ws = _this._protocols
	                ? new WebSocket(url, _this._protocols)
	                : new WebSocket(url);
	            _this._ws.binaryType = _this._binaryType;
	            _this._connectLock = false;
	            _this._addListeners();
	            _this._connectTimeout = setTimeout(function () { return _this._handleTimeout(); }, connectionTimeout);
	        });
	    };
	    ReconnectingWebSocket.prototype._handleTimeout = function () {
	        this._debug('timeout event');
	        this._handleError(new ErrorEvent(Error('TIMEOUT'), this));
	    };
	    ReconnectingWebSocket.prototype._disconnect = function (code, reason) {
	        if (code === void 0) { code = 1000; }
	        this._clearTimeouts();
	        if (!this._ws) {
	            return;
	        }
	        this._removeListeners();
	        try {
	            this._ws.close(code, reason);
	            this._handleClose(new CloseEvent(code, reason, this));
	        }
	        catch (error) {
	            // ignore
	        }
	    };
	    ReconnectingWebSocket.prototype._acceptOpen = function () {
	        this._debug('accept open');
	        this._retryCount = 0;
	    };
	    ReconnectingWebSocket.prototype._callEventListener = function (event, listener) {
	        if ('handleEvent' in listener) {
	            // @ts-ignore
	            listener.handleEvent(event);
	        }
	        else {
	            // @ts-ignore
	            listener(event);
	        }
	    };
	    ReconnectingWebSocket.prototype._removeListeners = function () {
	        if (!this._ws) {
	            return;
	        }
	        this._debug('removeListeners');
	        this._ws.removeEventListener('open', this._handleOpen);
	        this._ws.removeEventListener('close', this._handleClose);
	        this._ws.removeEventListener('message', this._handleMessage);
	        // @ts-ignore
	        this._ws.removeEventListener('error', this._handleError);
	    };
	    ReconnectingWebSocket.prototype._addListeners = function () {
	        if (!this._ws) {
	            return;
	        }
	        this._debug('addListeners');
	        this._ws.addEventListener('open', this._handleOpen);
	        this._ws.addEventListener('close', this._handleClose);
	        this._ws.addEventListener('message', this._handleMessage);
	        // @ts-ignore
	        this._ws.addEventListener('error', this._handleError);
	    };
	    ReconnectingWebSocket.prototype._clearTimeouts = function () {
	        clearTimeout(this._connectTimeout);
	        clearTimeout(this._uptimeTimeout);
	    };
	    return ReconnectingWebSocket;
	}());

	class WebSocketTransport {
	    constructor(wsServerAddress) {
	        this.send = this.send.bind(this);
	        this.sendBulk = this.sendBulk.bind(this);
	        if (!wsServerAddress) {
	            throw new Error('websocker server address is required');
	        }
	        const options = {
	            'connectionTimeout': 30000,
	            'debug': false,
	            // Last two minutes ( 60s + 60s ) status
	            'maxEnqueuedMessages': 120,
	            'maxRetries': 100
	        };
	        this._webSocket = new ReconnectingWebSocket(wsServerAddress, [], options);
	        this._webSocket.onclose = (close) => {
	            logger.warn('websocket closed', close);
	        };
	        this._webSocket.onerror = (err) => {
	            logger.warn('websocket error', err);
	        };
	        this._webSocket.onopen = (currentEvent) => {
	            logger.warn('websocket on open', currentEvent);
	        };
	    }
	    dispose() {
	        var _a;
	        (_a = this._webSocket) === null || _a === void 0 ? void 0 : _a.close();
	        // eslint-disable-next-line no-undefined
	        this._webSocket = undefined;
	    }
	    send(socketPayload) {
	        var _a;
	        logger.warn('sending payload ->', socketPayload);
	        (_a = this._webSocket) === null || _a === void 0 ? void 0 : _a.send(JSON.stringify(socketPayload));
	    }
	    sendBulk(socketPayloadList) {
	        socketPayloadList.forEach((currentPayload) => {
	            this.send(currentPayload);
	        });
	    }
	}

	const defaultIntervalDurationInMs = 1000;
	class ObserverProcessor {
	    constructor() {
	        this._cron = new CronInterval();
	        this._statsOptimizer = new StatsOptimizer();
	        this._integrationOptimizer = new IntegrationOptimizer();
	        this._processorWorker = new ProcessorWorker(this);
	        this.startWsServer = this.startWsServer.bind(this);
	        this.startCronTask = this.startCronTask.bind(this);
	        this.onResponseRawStats = this.onResponseRawStats.bind(this);
	        this.onResponseInitialConfig = this.onResponseInitialConfig.bind(this);
	        this.sendDataToTransport = this.sendDataToTransport.bind(this);
	        // eslint-disable-next-line no-console
	        console.warn('$ObserverRTC version[processor]', 
	        // @ts-expect-error Will be injected in build time
	        "0.6.0", 'from build date', 
	        // @ts-expect-error Will be injected in build time
	        "Thu, 14 Jan 2021 02:34:46 GMT");
	    }
	    get messageHandler() {
	        // eslint-disable-next-line @typescript-eslint/unbound-method
	        return this._processorWorker.onMessage;
	    }
	    onResponseRawStats(rawStats) {
	        const filteredStats = this._integrationOptimizer.optimize(rawStats);
	        const socketPayloads = filteredStats.map((currentStats) => {
	            const payload = {
	                'browserId': currentStats.details.browserId,
	                'callId': currentStats.details.callId,
	                'iceStats': RawStatsProcessor.getIceStats(currentStats.stats),
	                'peerConnectionId': currentStats.details.peerConnectionId,
	                'receiverStats': RawStatsProcessor.getSendRecvStats(currentStats.stats.receiverStats),
	                'senderStats': RawStatsProcessor.getSendRecvStats(currentStats.stats.senderStats),
	                'timeZoneOffsetInMinute': currentStats.details.timeZoneOffsetInMinute,
	                'timestamp': currentStats.details.timestamp,
	                'userId': currentStats.details.userId
	            };
	            return payload;
	        });
	        // Order is import starts
	        const optimizedPayload = socketPayloads.map((currentStats) => this._statsOptimizer.excludeSameCandidates(currentStats));
	        this._statsOptimizer.addStatBulk(socketPayloads);
	        // Order is import ends
	        // Try to send the payload to transport
	        this.sendDataToTransport(optimizedPayload);
	    }
	    onUserMediaError(mediaError) {
	        const socketPayloads = {
	            'browserId': mediaError.details.browserId,
	            'timeZoneOffsetInMinute': mediaError.details.timeZoneOffsetInMinute,
	            'timestamp': mediaError.details.timestamp,
	            'userMediaErrors': [{ 'message': mediaError.errName }]
	        };
	        this.sendDataToTransport([socketPayloads]);
	    }
	    updateWorkerInstance(workerScope) {
	        this._processorWorker.setWorkerScope(workerScope);
	    }
	    initialize() {
	        this._processorWorker.requestInitialConfig();
	    }
	    onResponseInitialConfig(initialConfig) {
	        this._initialConfig = initialConfig;
	        this.startCronTask(initialConfig.poolingIntervalInMs);
	        if (this._initialConfig.transportType === 'local') {
	            // Don't try to initialize websocket transport
	            return;
	        }
	        this.startWsServer(initialConfig.wsAddress);
	    }
	    startWsServer(wsServerAddress) {
	        logger.warn('start websocket server', wsServerAddress);
	        if (this._webSocketTransport) {
	            this._webSocketTransport.dispose();
	        }
	        this._webSocketTransport = new WebSocketTransport(wsServerAddress);
	    }
	    startCronTask(intervalDurationInMs = defaultIntervalDurationInMs) {
	        this._cron.start({ 'execute': this._processorWorker.requestRawStats.bind(this) }, intervalDurationInMs);
	    }
	    sendDataToTransport(samples) {
	        var _a, _b;
	        if (((_a = this._initialConfig) === null || _a === void 0 ? void 0 : _a.transportType) === 'local') {
	            // eslint-disable-next-line @typescript-eslint/no-magic-numbers
	            if (samples.length > 0) {
	                this._processorWorker.sendTransportData(samples);
	            }
	        }
	        else {
	            (_b = this._webSocketTransport) === null || _b === void 0 ? void 0 : _b.sendBulk(samples);
	        }
	    }
	}
	const observerProcessor = new ObserverProcessor();
	// Update worker scope
	observerProcessor.updateWorkerInstance(self);
	// Try to initialize
	observerProcessor.initialize();
	// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
	onmessage = observerProcessor.messageHandler;

})));
