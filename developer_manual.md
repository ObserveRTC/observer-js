# Developer Manual - ObserveRTC Observer JS

## Overview
ObserveRTC Observer JS is a server-side component for monitoring WebRTC applications and services. It provides real-time analysis of WebRTC metrics, call quality scoring, and issue detection.

## Architecture

### Core Components

1. **Observer**: Main orchestrator that manages calls and clients
2. **ObservedCall**: Represents a WebRTC call session with multiple clients
3. **ObservedClient**: Represents a single client in a call
4. **ObservedPeerConnection**: Represents a WebRTC peer connection
5. **Monitors**: Specialized components for tracking specific metrics

### Key Features

- Real-time WebRTC metrics processing
- Quality score calculation for audio/video tracks
- Issue detection and severity classification
- Call summary generation
- TURN usage monitoring
- SFU server monitoring

## Development Setup

### Prerequisites
- Node.js 16+
- TypeScript 4.5+
- Jest for testing

### Installation
```bash
npm install
npm run build
```

### Running Tests
```bash
npm test
```

## Code Structure

```
src/
├── index.ts              # Main entry point
├── Observer.ts           # Core observer implementation
├── ObservedCall.ts       # Call management
├── ObservedClient.ts     # Client management
├── monitors/             # Monitoring components
├── scores/              # Quality scoring algorithms
├── detectors/           # Issue detection logic
└── updaters/            # Update policy implementations
```

## Configuration

### Update Policies
- `update-on-any-client-updated`: Updates when any client changes
- `update-when-all-client-updated`: Updates when all clients have updated
- `update-on-interval`: Updates at fixed intervals

### Score Calculation
Quality scores range from 0.0 to 5.0:
- **Critical issues**: Set score to 0.0
- **Major issues**: Multiply score by 0.5
- **Minor issues**: Multiply score by 0.8

## Common Patterns

### Creating an Observer
```typescript
const observer = createObserver({
    defaultServiceId: 'my-service',
    defaultMediaUnitId: 'my-component',
});
```

### Monitoring Calls
```typescript
const call = observer.createObservedCall({
    callId: 'unique-call-id',
    updatePolicy: 'update-on-any-client-updated'
});

call.on('update', () => {
    console.log('Call metrics updated');
});
```

### Issue Detection
Issues are classified by severity:
- `critical`: System-breaking problems
- `major`: Significant quality degradation
- `minor`: Noticeable but manageable issues

## Best Practices

1. **Memory Management**: Always call `close()` on observers, calls, and clients when done
2. **Event Listeners**: Remove event listeners in cleanup to prevent memory leaks
3. **Error Handling**: Wrap observer operations in try-catch blocks
4. **Performance**: Use appropriate update policies based on your use case

## Troubleshooting

### Common Issues

1. **Memory Leaks**: Ensure proper cleanup of event listeners
2. **Update Policy Confusion**: Verify correct updater assignment in ObservedCall constructor
3. **Score Calculation**: Check that issue severity handling is consistent across components

### Debugging

Enable debug logging:
```typescript
const observer = createObserver({
    // configuration
});

observer.on('error', (error) => {
    console.error('Observer error:', error);
});
```

## Contributing

1. Follow TypeScript best practices
2. Add tests for new features
3. Update documentation
4. Run linting before committing
5. Use semantic commit messages

## API Reference

### Observer
- `createObservedCall(settings)`: Create a new call monitor
- `createCallSummaryMonitor()`: Create call summary monitor
- `close()`: Cleanup and close observer

### ObservedCall
- `createObservedClient(settings)`: Add client to call
- `getObservedClient(clientId)`: Retrieve client by ID
- `update()`: Force metrics update
- `close()`: End call monitoring

### Monitoring Events
- `update`: Metrics updated
- `newclient`: New client joined
- `empty`: No clients remaining
- `close`: Component closed

## Performance Considerations

- Use interval-based updates for high-frequency scenarios
- Monitor memory usage in long-running applications
- Consider client limits for large-scale deployments
- Implement proper cleanup in production environments