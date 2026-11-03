import type { CSSProperties } from 'react';
import {
  AGENT_STATE_LABELS,
  INTENT_LABELS,
  type DiscussionStatus,
  type Participant
} from '@aps/shared';
import { Avatar } from '../ui/Avatar';

const INTENT_MARKS = {
  raise_hand: '✋',
  interrupt: '⚡',
  supplement: '＋',
  rebut: '⚔'
} as const;

interface ExpertStatusWindowProps {
  participant: Participant;
  isSpeaking: boolean;
  discussionStatus: DiscussionStatus;
}

export function ExpertStatusWindow({
  participant,
  isSpeaking,
  discussionStatus
}: ExpertStatusWindowProps) {
  const state = isSpeaking ? 'speaking' : participant.agentState;
  const focus = participant.focus?.trim() ? participant.focus : undefined;
  const statusFocus =
    discussionStatus === 'live'
      ? state === 'speaking'
        ? '正在发言'
        : state === 'idle'
          ? '正在聆听'
          : null
      : null;
  const focusText = focus ?? statusFocus;
  return (
    <article
      className={`expert-window expert-window--${state}`}
      data-state={state}
      style={{ '--seat-color': participant.color } as CSSProperties}
    >
      <div className="expert-window__top">
        <span className="expert-window__seat">
          SEAT / {String(participant.seat).padStart(2, '0')}
        </span>
        <span className={`expert-window__state-dot expert-window__state-dot--${state}`} />
      </div>
      <div className="expert-window__identity">
        <Avatar participant={participant} size="md" />
        <div className="expert-window__nameplate">
          <h3>{participant.name}</h3>
          <span>{participant.stanceTag}</span>
        </div>
      </div>
      <p className="expert-window__title">
        {participant.profession} · {participant.title}
      </p>
      <p className="expert-window__stance">{participant.stance}</p>
      <div className="expert-window__status-row">
        <span className="expert-window__status">
          {AGENT_STATE_LABELS[state]}
        </span>
        {state === 'preparing' && participant.agentIntent ? (
          <span className="expert-window__intent">
            <span aria-hidden="true">
              {INTENT_MARKS[participant.agentIntent]}
            </span>
            {INTENT_LABELS[participant.agentIntent]}
          </span>
        ) : null}
      </div>
      {focusText ? (
        <p
          className={`expert-window__focus${!focus && statusFocus === '正在聆听' ? ' is-listening' : ''}`}
        >
          <span>关注点：</span>
          {focusText}
        </p>
      ) : null}
      {state === 'speaking' ? (
        <span className="expert-window__wave" aria-label="正在发言">
          <i />
          <i />
          <i />
          <i />
          <i />
        </span>
      ) : null}
    </article>
  );
}
