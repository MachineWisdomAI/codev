import { useEffect } from 'react';
import { getSSEEventsUrl } from '../lib/api.js';

type Listener = () => void;

// Singleton EventSource shared across all hooks in this tab.
//
// WHY a singleton: Browsers enforce a 6-connection-per-origin limit for
// HTTP/1.1. Each EventSource holds one persistent connection open. Without
// sharing, every hook that calls useSSE() would open its own connection,
// quickly exhausting the limit (ERR_INSUFFICIENT_RESOURCES) and blocking
// other requests (fetch, WebSocket upgrades, etc.).
//
// NOTE: Each browser tab gets its own module scope, so each open dashboard
// tab will have one independent EventSource connection. This is expected
// and unavoidable — tabs don't share JS module state.
let eventSource: EventSource | null = null;
const listeners = new Set<Listener>();

function notify(): void {
  for (const fn of listeners) fn();
}

function connect(): void {
  if (eventSource || typeof EventSource === 'undefined') return;
  eventSource = new EventSource(getSSEEventsUrl());
  eventSource.onmessage = () => notify();
  eventSource.onerror = () => {
    // EventSource automatically reconnects on error; no action needed.
  };
}

function disconnect(): void {
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }
}

/**
 * Subscribe to SSE events from Tower. The callback fires on every SSE message
 * (including the initial "connected" event sent after reconnection).
 * Uses a shared EventSource singleton — multiple hooks share one connection.
 */
export function useSSE(onEvent: Listener): void {
  useEffect(() => {
    listeners.add(onEvent);
    connect();
    return () => {
      listeners.delete(onEvent);
      if (listeners.size === 0) {
        disconnect();
      }
    };
  }, [onEvent]);
}
