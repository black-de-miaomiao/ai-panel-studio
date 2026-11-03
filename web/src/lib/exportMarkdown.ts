import type { DiscussionSnapshot } from '@aps/shared';

export function exportMarkdown(snapshot: DiscussionSnapshot): string {
  const participants = [...snapshot.participants].sort(
    (left, right) => left.seat - right.seat
  );
  const participantById = new Map(
    participants.map((participant) => [participant.id, participant])
  );
  const utterances = [...snapshot.utterances].sort(
    (left, right) => left.seq - right.seq
  );
  const insights = [...snapshot.insights].sort(
    (left, right) => left.updatedAtSeq - right.updatedAtSeq
  );

  const lines = [
    `# ${snapshot.discussion.topic}`,
    '',
    '## 嘉宾阵容',
    ...participants.map(
      (participant) =>
        `- ${participant.role === 'host' ? '主持人' : '专家'}：${participant.name}（${participant.profession} · ${participant.title}）— ${participant.stanceTag}：${participant.stance}`
    ),
    '',
    '## 现场实录',
    ...utterances.flatMap((utterance) => {
      const speaker = participantById.get(utterance.participantId);
      const name = speaker?.name ?? '未知嘉宾';
      const title = speaker?.title ? ` · ${speaker.title}` : '';
      return [
        `### #${utterance.seq} ${name}${title}`,
        '',
        utterance.content,
        ''
      ];
    }),
    '## 共识',
    ...insights
      .filter((insight) => insight.kind === 'consensus')
      .map((insight) => {
        const positions = insight.stances
          .map((stance) => {
            const name = participantById.get(stance.participantId)?.name;
            return name ? `${name}：${stance.position}` : stance.position;
          })
          .join('；');
        return `- ${insight.content}${positions ? `（${positions}）` : ''}`;
      }),
    '',
    '## 分歧',
    ...insights
      .filter((insight) => insight.kind === 'divergence')
      .map((insight) => {
        const positions = insight.stances
          .map((stance) => {
            const name = participantById.get(stance.participantId)?.name;
            return name ? `${name}：${stance.position}` : stance.position;
          })
          .join('；');
        const resolved = insight.status === 'resolved' ? '（已化解）' : '';
        return `- ${insight.content}${resolved}${positions ? ` — ${positions}` : ''}`;
      })
  ];

  if (snapshot.discussion.summary) {
    lines.push('', '## 主持人总结', '', snapshot.discussion.summary);
  }

  return `${lines.join('\n').trimEnd()}\n`;
}
