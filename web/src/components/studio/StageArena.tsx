import type { DiscussionStatus, Participant } from '@aps/shared';
import { HostSeat } from './HostSeat';
import { ExpertStatusWindow } from './ExpertStatusWindow';

interface StageArenaProps {
  participants: Participant[];
  liveSpeakerId?: string | null;
  discussionStatus: DiscussionStatus;
}

export function StageArena({
  participants,
  liveSpeakerId,
  discussionStatus
}: StageArenaProps) {
  const host = participants.find((participant) => participant.role === 'host');
  const experts = participants
    .filter((participant) => participant.role === 'expert')
    .sort((left, right) => left.seat - right.seat);
  const hostSpeaking = host?.id === liveSpeakerId || host?.agentState === 'speaking';

  return (
    <section
      aria-label="演播厅舞台与嘉宾席位"
      className="stage-arena"
    >
      <div className="stage-arena__spotlight" aria-hidden="true" />
      {host ? <HostSeat host={host} isSpeaking={hostSpeaking} /> : null}
      <div className="stage-arena__divider" aria-hidden="true">
        <span>圆桌席位</span>
      </div>
      <div className="stage-arena__experts">
        {experts.map((participant) => (
          <ExpertStatusWindow
            key={participant.id}
            isSpeaking={
              participant.id === liveSpeakerId ||
              participant.agentState === 'speaking'
            }
            participant={participant}
            discussionStatus={discussionStatus}
          />
        ))}
      </div>
      <div className="stage-arena__floor">
        <span>AI PANEL STUDIO</span>
        <span>LIVE SESSION · {experts.length + 1} SEATS</span>
      </div>
    </section>
  );
}
