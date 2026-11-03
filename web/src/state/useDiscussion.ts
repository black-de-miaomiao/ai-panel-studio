import { useCallback, useEffect, useReducer, useState } from 'react';
import type { Discussion, DiscussionSnapshot, StreamEvent } from '@aps/shared';
import type {
  ConnectionStatus,
  DiscussionEventSource
} from './eventSource';
import {
  initState,
  patchDiscussionState,
  reduce
} from './discussionReducer';

type Action =
  | { type: 'event'; event: StreamEvent; eventSeq?: number }
  | { type: 'replace'; snapshot: DiscussionSnapshot }
  | { type: 'patchDiscussion'; discussion: Discussion };

function stateReducer(state: ReturnType<typeof initState>, action: Action) {
  if (action.type === 'replace') return initState(action.snapshot);
  if (action.type === 'patchDiscussion') {
    return patchDiscussionState(state, action.discussion);
  }
  return reduce(state, action.event, action.eventSeq);
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
  const patchDiscussion = useCallback(
    (discussion: Discussion) =>
      dispatch({ type: 'patchDiscussion', discussion }),
    []
  );

  return { state, connection, dispatchEvent, patchDiscussion };
}
