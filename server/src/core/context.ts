import type { Insight, Participant, Utterance } from '@aps/shared';

export type AliasMap = Record<string, string>;
export const TRANSCRIPT_WINDOW = 10;

export function buildAliasMap(
  participants: readonly Participant[]
): AliasMap {
  const aliases: AliasMap = {};
  const host = participants.find(({ role }) => role === 'host');
  if (host) {
    aliases.H = host.id;
  }

  const experts = participants
    .filter(({ role }) => role === 'expert')
    .toSorted((left, right) => left.seat - right.seat);
  experts.forEach((expert, index) => {
    aliases[`E${index + 1}`] = expert.id;
  });
  return aliases;
}

export function buildTranscriptWindow(
  utterances: readonly Utterance[],
  participants: readonly Participant[],
  k = TRANSCRIPT_WINDOW
): string {
  const limit = Math.max(0, Math.floor(k));
  if (limit === 0) {
    return '';
  }

  const aliasMap = buildAliasMap(participants);
  const aliasByParticipantId = new Map(
    Object.entries(aliasMap).map(([alias, id]) => [id, alias])
  );
  const participantById = new Map(
    participants.map((participant) => [participant.id, participant])
  );
  const recent = [...utterances]
    .sort(
      (left, right) =>
        left.createdAt.localeCompare(right.createdAt) || left.seq - right.seq
    )
    .slice(-limit);

  return recent
    .map((utterance) => {
      const participant = participantById.get(utterance.participantId);
      const alias = aliasByParticipantId.get(utterance.participantId) ?? '?';
      const name = participant?.name ?? '未知嘉宾';
      const title = participant?.title ?? '身份未提供';
      const content = utterance.content.replace(/\s+/g, ' ').trim();
      return `#${utterance.seq} ${alias} ${name}（${title}）：${content}`;
    })
    .join('\n');
}

export function formatInsightsForPrompt(
  insights: readonly Insight[],
  participants: readonly Participant[]
): string {
  const participantById = new Map(
    participants.map((participant) => [participant.id, participant])
  );
  const createdOrder = (kind: Insight['kind']) =>
    insights
      .map((insight, index) => ({ insight, index }))
      .filter(({ insight }) => insight.kind === kind)
      .sort(
        (left, right) =>
          left.insight.createdAt.localeCompare(right.insight.createdAt) ||
          left.index - right.index
      )
      .map(({ insight }) => insight);
  const lines: string[] = [];

  createdOrder('consensus').forEach((insight, index) => {
    const positions = insight.stances
      .map((stance) => {
        const name = participantById.get(stance.participantId)?.name ?? '专家';
        return `${name}：${stance.position}`;
      })
      .join('；');
    lines.push(
      `C${index + 1} 共识：${insight.content}${
        positions ? `（${positions}）` : ''
      }`
    );
  });

  createdOrder('divergence').forEach((insight, index) => {
    const positions = insight.stances
      .map((stance) => {
        const name = participantById.get(stance.participantId)?.name ?? '专家';
        return `${name}：${stance.position}`;
      })
      .join('；');
    const resolved = insight.status === 'resolved' ? '（已化解）' : '';
    lines.push(
      `D${index + 1} 分歧：${insight.content}${
        positions ? `（${positions}）` : ''
      }${resolved}`
    );
  });

  return lines.length > 0 ? lines.join('\n') : '（暂无已记录的共识或分歧）';
}
