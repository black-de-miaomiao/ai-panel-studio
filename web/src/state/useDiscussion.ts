import { useCallback, useEffect, useReducer, useState } from 'react';
import type { DiscussionSnapshot, StreamEvent } from '@aps/shared';
import type {
  ConnectionStatus,
  DiscussionEventSource
} from './eventSource';
import { initState, reduce } from './discussionReducer';

type Action =
  | { type: 'event'; event: StreamEvent; eventSeq?: number }
  | { type: 'replace'; snapshot: DiscussionSnapshot };

function stateReducer(state: ReturnType<typeof initState>, action: Action) {
  return action.type === 'replace'
    ? initState(action.snapshot)
    : reduce(state, action.event, action.eventSeq);
}

export function useDiscussion(
  snapshot: DiscussionSnapshot,
  eventSource: DiscussionEventSource,
  enabled: boolean
) {
  const [state, dispatch] = useReducer(stateReducer, snapshot, initState);
  const [connection, setConnection] = useState<ConnectionStatus>(
    enabled ? 'connecting' : 'open'
  );

  useEffect(() => {
    dispatch({ type: 'replace', snapshot });
  }, [snapshot]);

  useEffect(() => {
    if (!enabled) {
      setConnection('open');
      return;
    }
    setConnection('connecting');
    return eventSource.subscribe(
      (event, eventSeq) => dispatch({ type: 'event', event, eventSeq }),
      setConnection
    );
  }, [enabled, eventSource]);

  const dispatchEvent = useCallback(
    (event: StreamEvent, eventSeq?: number) =>
      dispatch({ type: 'event', event, eventSeq }),
    []
  );

  return { state, connection, dispatchEvent };
}
