import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';
import type {
  Discussion,
  DiscussionSnapshot,
  StreamEvent
} from '@aps/shared';
import App from '../App';
import { ApiError } from '../api/httpApi';
import { DiscussionApiProvider } from '../api/DiscussionApiContext';
import type { DiscussionApi } from '../api/types';
import { createLineupSnapshot, createShowcaseSnapshot } from '../mocks/fixtures';
import { mockApi } from '../mocks/mockApi';

class StubEventSource {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 2;
  static instances: StubEventSource[] = [];

  readyState = StubEventSource.CONNECTING;
  onopen: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent<string>) => void) | null = null;

  constructor(public readonly url: string) {
    StubEventSource.instances.push(this);
  }

  emit(data: string, lastEventId: string): void {
    this.onmessage?.(
      new MessageEvent<string>('message', { data, lastEventId })
    );
  }

  close(): void {
    this.readyState = StubEventSource.CLOSED;
  }
}

function makeApi(overrides: Partial<DiscussionApi> = {}): DiscussionApi {
  const snapshot = createLineupSnapshot({ fixtureNo: 201 });
  const updatedAt = Date.parse(snapshot.discussion.updatedAt);
  return {
    getHealth: vi.fn(async () => ({
      ok: true,
      llm: {
        provider: 'mock' as const,
        qualityModel: 'mock-quality',
        fastModel: 'mock-fast'
      }
    })),
    listDiscussions: vi.fn(async () => []),
    createDiscussion: vi.fn(async () => snapshot),
    getDiscussion: vi.fn(async () => snapshot),
    regenerateLineup: vi.fn(async () => snapshot),
    start: vi.fn(async () => ({
      ...snapshot.discussion,
      status: 'live' as const,
      updatedAt: new Date(updatedAt + 1_000).toISOString()
    })),
    pause: vi.fn(async () => ({
      ...snapshot.discussion,
      status: 'paused' as const,
      updatedAt: new Date(updatedAt + 2_000).toISOString()
    })),
    resume: vi.fn(async () => ({
      ...snapshot.discussion,
      status: 'live' as const,
      updatedAt: new Date(updatedAt + 3_000).toISOString()
    })),
    end: vi.fn(async () => ({
      ...snapshot.discussion,
      status: 'summarizing' as const,
      updatedAt: new Date(updatedAt + 4_000).toISOString()
    })),
    deleteDiscussion: vi.fn(async () => {}),
    ...overrides
  };
}

async function waitForStubEventSource(
  index = 0
): Promise<StubEventSource> {
  await waitFor(() => {
    expect(StubEventSource.instances[index]?.onmessage).toBeTypeOf('function');
  });
  const source = StubEventSource.instances[index];
  if (!source) throw new Error('SSE EventSource was not created.');
  return source;
}

function emitEvent(
  source: StubEventSource,
  event: StreamEvent,
  lastEventId = ''
): void {
  act(() => source.emit(JSON.stringify(event), lastEventId));
}

function renderAt(path: string, api: DiscussionApi) {
  return render(
    <DiscussionApiProvider api={api}>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </DiscussionApiProvider>
  );
}

const NETWORK_MESSAGE = '无法连接服务器，请确认后端已启动';

beforeEach(() => {
  StubEventSource.instances = [];
  vi.stubGlobal('EventSource', StubEventSource);
  mockApi.reset();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('pages with an injected discussion API', () => {
  it('renders API discussions in lobby groups and shows the empty state', async () => {
    const items = await mockApi.listDiscussions();
    const api = makeApi({
      listDiscussions: vi.fn(async () => items)
    });
    renderAt('/', api);

    expect(
      await screen.findByRole('heading', { name: '正在发生的观点交锋' })
    ).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /直播中/ })).toBeInTheDocument();
    expect(screen.getByText('已暂停')).toBeInTheDocument();

    const emptyApi = makeApi({
      listDiscussions: vi.fn(async () => [])
    });
    cleanup();
    renderAt('/', emptyApi);
    expect(
      await screen.findByRole('heading', { name: '演播厅暂时安静' })
    ).toBeInTheDocument();
  });

  it('shows a NETWORK error and retries the lobby request', async () => {
    const user = userEvent.setup();
    const listDiscussions = vi
      .fn()
      .mockRejectedValueOnce(new ApiError('NETWORK', NETWORK_MESSAGE))
      .mockResolvedValueOnce([]);
    const api = makeApi({ listDiscussions });
    renderAt('/', api);

    expect(await screen.findByText(NETWORK_MESSAGE)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '重试' }));
    expect(
      await screen.findByRole('heading', { name: '演播厅暂时安静' })
    ).toBeInTheDocument();
    expect(listDiscussions).toHaveBeenCalledTimes(2);
  });

  it('keeps the new-discussion form usable after a NETWORK failure', async () => {
    const user = userEvent.setup();
    const snapshot = createLineupSnapshot({ fixtureNo: 202 });
    const createDiscussion = vi
      .fn()
      .mockRejectedValueOnce(new ApiError('NETWORK', NETWORK_MESSAGE))
      .mockResolvedValueOnce(snapshot);
    const api = makeApi({ createDiscussion });
    renderAt('/new', api);

    await user.type(
      await screen.findByLabelText('今晚想聊什么？'),
      '远程办公的边界在哪里？'
    );
    await user.click(screen.getByRole('button', { name: '生成嘉宾阵容' }));
    expect(await screen.findByText(NETWORK_MESSAGE)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '重试' }));

    expect(
      await screen.findByRole('heading', { name: '今晚的圆桌嘉宾' })
    ).toBeInTheDocument();
    expect(createDiscussion).toHaveBeenCalledTimes(2);
  });

  it('uses the failed discussion ID from LLM details to regenerate a lineup', async () => {
    const user = userEvent.setup();
    const failed = createLineupSnapshot({
      fixtureNo: 203,
      topic: '讨论生成失败后如何重试？',
      status: 'failed'
    });
    const regenerated: DiscussionSnapshot = {
      ...failed,
      discussion: { ...failed.discussion, status: 'lineup_ready' }
    };
    const createDiscussion = vi.fn(async () => {
      throw new ApiError('LLM_ERROR', '暂时无法生成阵容，请稍后重试', [
        { discussionId: failed.discussion.id }
      ]);
    });
    const getDiscussion = vi.fn(async () => failed);
    const regenerateLineup = vi.fn(async () => regenerated);
    const api = makeApi({ createDiscussion, getDiscussion, regenerateLineup });
    renderAt('/new', api);

    await user.type(
      await screen.findByLabelText('今晚想聊什么？'),
      failed.discussion.topic
    );
    await user.click(screen.getByRole('button', { name: '生成嘉宾阵容' }));
    expect(await screen.findByText('暂时无法生成阵容，请稍后重试')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '重试生成' }));

    expect(regenerateLineup).toHaveBeenCalledWith(failed.discussion.id);
    expect(
      await screen.findByRole('button', {
        name: '确认阵容，进入演播厅'
      })
    ).toBeEnabled();
  });

  it('shows a NETWORK error and retry action when loading a studio snapshot', async () => {
    const user = userEvent.setup();
    const snapshot = createLineupSnapshot({ fixtureNo: 204 });
    const getDiscussion = vi
      .fn()
      .mockRejectedValueOnce(new ApiError('NETWORK', NETWORK_MESSAGE))
      .mockResolvedValueOnce(snapshot);
    const api = makeApi({ getDiscussion });
    renderAt(`/studio/${snapshot.discussion.id}`, api);

    expect(await screen.findByText(NETWORK_MESSAGE)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '重试' }));
    expect(
      await screen.findByRole('heading', { name: snapshot.discussion.topic })
    ).toBeInTheDocument();
    const source = await waitForStubEventSource();
    expect(source.url).toContain(
      `since=${snapshot.lastEventSeq}`
    );
  });

  it('calls start, pause, resume, and end APIs from studio controls', async () => {
    const user = userEvent.setup();
    const snapshot = createLineupSnapshot({ fixtureNo: 205 });
    const updatedAt = Date.parse(snapshot.discussion.updatedAt);
    const start = vi.fn(async () => ({
      ...snapshot.discussion,
      status: 'live' as const,
      updatedAt: new Date(updatedAt + 1_000).toISOString()
    }));
    const pause = vi.fn(async () => ({
      ...snapshot.discussion,
      status: 'paused' as const,
      updatedAt: new Date(updatedAt + 2_000).toISOString()
    }));
    const resume = vi.fn(async () => ({
      ...snapshot.discussion,
      status: 'live' as const,
      updatedAt: new Date(updatedAt + 3_000).toISOString()
    }));
    const end = vi.fn(async () => ({
      ...snapshot.discussion,
      status: 'summarizing' as const,
      updatedAt: new Date(updatedAt + 4_000).toISOString()
    }));
    const api = makeApi({
      getDiscussion: vi.fn(async () => snapshot),
      start,
      pause,
      resume,
      end
    });
    renderAt(`/studio/${snapshot.discussion.id}`, api);

    await user.click(await screen.findByRole('button', { name: '开始直播' }));
    await user.click(await screen.findByRole('button', { name: '暂停' }));
    await user.click(await screen.findByRole('button', { name: '继续' }));
    await user.click(await screen.findByRole('button', { name: '结束讨论' }));
    await user.click(
      screen.getByRole('button', { name: '结束并生成总结' })
    );

    expect(start).toHaveBeenCalledWith(snapshot.discussion.id);
    expect(pause).toHaveBeenCalledWith(snapshot.discussion.id);
    expect(resume).toHaveBeenCalledWith(snapshot.discussion.id);
    expect(end).toHaveBeenCalledWith(snapshot.discussion.id);
    expect(
      await screen.findAllByText('主持人正在收束观点')
    ).toHaveLength(2);
  });

  it('keeps SSE transcript entries when pausing after two new utterances', async () => {
    const user = userEvent.setup();
    const snapshot = createLineupSnapshot({
      fixtureNo: 207,
      status: 'live'
    });
    const host = snapshot.participants[0];
    const expert = snapshot.participants[1];
    expect(host).toBeDefined();
    expect(expert).toBeDefined();
    if (!host || !expert) return;

    const sseAt = new Date(
      Date.parse(snapshot.discussion.updatedAt) + 2_000
    ).toISOString();
    const pause = vi.fn(async () => ({
      ...snapshot.discussion,
      status: 'paused' as const,
      updatedAt: new Date(
        Date.parse(snapshot.discussion.updatedAt) + 1_000
      ).toISOString()
    }));
    const api = makeApi({
      getDiscussion: vi.fn(async () => snapshot),
      pause
    });
    renderAt(`/studio/${snapshot.discussion.id}`, api);
    await screen.findByRole('heading', { name: snapshot.discussion.topic });

    const source = await waitForStubEventSource();

    const utterances = [
      {
        id: '50000000-0000-4000-8000-000000000101',
        discussionId: snapshot.discussion.id,
        participantId: host.id,
        seq: 1,
        act: 'opening',
        replyToParticipantId: null,
        content: 'SSE 到达的第一条发言。',
        createdAt: sseAt
      },
      {
        id: '50000000-0000-4000-8000-000000000102',
        discussionId: snapshot.discussion.id,
        participantId: expert.id,
        seq: 2,
        act: 'statement',
        replyToParticipantId: host.id,
        content: 'SSE 到达的第二条发言。',
        createdAt: sseAt
      }
    ] as const;

    utterances.forEach((utterance, index) => {
      emitEvent(
        source,
        {
          type: 'utterance.completed',
          discussionId: snapshot.discussion.id,
          at: sseAt,
          utterance
        },
        String(snapshot.lastEventSeq + index + 1)
      );
    });
    expect(await screen.findAllByText(utterances[0].content)).toHaveLength(2);
    expect(await screen.findAllByText(utterances[1].content)).toHaveLength(2);

    await user.click(await screen.findByRole('button', { name: '暂停' }));
    expect(
      await screen.findByRole('button', { name: '继续' })
    ).toBeInTheDocument();
    expect(pause).toHaveBeenCalledWith(snapshot.discussion.id);
    const transcripts = document.querySelectorAll(
      '.transcript-panel__content[role="log"]'
    );
    expect(transcripts.length).toBeGreaterThan(0);
    for (const transcript of transcripts) {
      expect(transcript.querySelectorAll('.transcript-item')).toHaveLength(2);
    }
    expect(screen.getAllByText('已暂停').length).toBeGreaterThan(0);
  });

  it('keeps the live status and first utterance when a start response arrives late', async () => {
    const user = userEvent.setup();
    const snapshot = createLineupSnapshot({ fixtureNo: 208 });
    const host = snapshot.participants[0];
    expect(host).toBeDefined();
    if (!host) return;

    const initialUpdatedAt = Date.parse(snapshot.discussion.updatedAt);
    const responseUpdatedAt = new Date(initialUpdatedAt + 1_000).toISOString();
    const sseUpdatedAt = new Date(initialUpdatedAt + 2_000).toISOString();
    const utteranceAt = new Date(initialUpdatedAt + 3_000).toISOString();
    const utterance = {
      id: '50000000-0000-4000-8000-000000000208',
      discussionId: snapshot.discussion.id,
      participantId: host.id,
      seq: 1,
      act: 'opening' as const,
      replyToParticipantId: null,
      content: '直播开始后到达的第一条发言。',
      createdAt: utteranceAt
    };
    let resolveStart: ((discussion: Discussion) => void) | undefined;
    const start = vi.fn(
      () =>
        new Promise<Discussion>((resolve) => {
          resolveStart = resolve;
        })
    );
    const api = makeApi({
      getDiscussion: vi.fn(async () => snapshot),
      start
    });
    renderAt(`/studio/${snapshot.discussion.id}`, api);

    await user.click(await screen.findByRole('button', { name: '开始直播' }));
    const source = await waitForStubEventSource();
    expect(resolveStart).toBeDefined();
    if (!resolveStart) return;

    emitEvent(
      source,
      {
        type: 'discussion.status',
        discussionId: snapshot.discussion.id,
        at: sseUpdatedAt,
        status: 'live',
        turnCount: 0,
        maxTurns: snapshot.discussion.maxTurns
      },
      String(snapshot.lastEventSeq + 1)
    );
    emitEvent(
      source,
      {
        type: 'utterance.completed',
        discussionId: snapshot.discussion.id,
        at: utteranceAt,
        utterance
      },
      String(snapshot.lastEventSeq + 2)
    );
    expect(await screen.findAllByText(utterance.content)).toHaveLength(2);
    const pauseButton = await screen.findByRole('button', { name: '暂停' });

    await act(async () => {
      resolveStart?.({
        ...snapshot.discussion,
        status: 'lineup_ready',
        updatedAt: responseUpdatedAt
      });
    });

    await waitFor(() => expect(pauseButton).toBeEnabled());
    expect(
      document.querySelector('.studio-layout')
    ).toHaveAttribute('data-studio-status', 'live');
    expect(screen.getByText('LIVE')).toBeInTheDocument();
    expect(await screen.findAllByText(utterance.content)).toHaveLength(2);
    expect(start).toHaveBeenCalledWith(snapshot.discussion.id);
    expect(screen.queryByRole('button', { name: '开始直播' })).toBeNull();
  });

  it.each([
    'before summary',
    'between summary and ended',
    'after ended'
  ] as const)(
    'retains the completed summary when the end response arrives %s',
    async (responseTiming) => {
      const user = userEvent.setup();
      const snapshot = createLineupSnapshot({
        fixtureNo: 209,
        status: 'live'
      });
      const initialUpdatedAt = Date.parse(snapshot.discussion.updatedAt);
      const summarizingAt = new Date(initialUpdatedAt + 1_000).toISOString();
      const summaryAt = new Date(initialUpdatedAt + 2_000).toISOString();
      const endedAt = new Date(initialUpdatedAt + 3_000).toISOString();
      const summary = '讨论形成了明确的协作结论。';
      let resolveEnd: ((discussion: Discussion) => void) | undefined;
      const end = vi.fn(
        () =>
          new Promise<Discussion>((resolve) => {
            resolveEnd = resolve;
          })
      );
      const api = makeApi({
        getDiscussion: vi.fn(async () => snapshot),
        end
      });
      renderAt(`/studio/${snapshot.discussion.id}`, api);
      await screen.findByRole('heading', { name: snapshot.discussion.topic });
      const source = await waitForStubEventSource();

      await user.click(await screen.findByRole('button', { name: '结束讨论' }));
      await user.click(
        await screen.findByRole('button', { name: '结束并生成总结' })
      );
      await waitFor(() => expect(end).toHaveBeenCalledWith(snapshot.discussion.id));
      if (!resolveEnd) throw new Error('End response resolver was not created.');

      emitEvent(
        source,
        {
          type: 'discussion.status',
          discussionId: snapshot.discussion.id,
          at: summarizingAt,
          status: 'summarizing',
          turnCount: snapshot.discussion.turnCount,
          maxTurns: snapshot.discussion.maxTurns
        },
        String(snapshot.lastEventSeq + 1)
      );
      await waitFor(() =>
        expect(document.querySelector('.studio-layout')).toHaveAttribute(
          'data-studio-status',
          'summarizing'
        )
      );

      const endResponse: Discussion = {
        ...snapshot.discussion,
        status: 'summarizing',
        summary: null,
        updatedAt: summarizingAt
      };
      const respondToEnd = async () => {
        const resolve = resolveEnd;
        if (!resolve) throw new Error('End response resolver was not created.');
        await act(async () => resolve(endResponse));
      };
      const emitSummary = () =>
        emitEvent(
          source,
          {
            type: 'summary.completed',
            discussionId: snapshot.discussion.id,
            at: summaryAt,
            summary
          },
          String(snapshot.lastEventSeq + 2)
        );
      const emitEnded = () =>
        emitEvent(
          source,
          {
            type: 'discussion.status',
            discussionId: snapshot.discussion.id,
            at: endedAt,
            status: 'ended',
            turnCount: snapshot.discussion.turnCount,
            maxTurns: snapshot.discussion.maxTurns
          },
          String(snapshot.lastEventSeq + 3)
        );

      if (responseTiming === 'before summary') await respondToEnd();
      emitSummary();
      if (responseTiming === 'between summary and ended') {
        await respondToEnd();
      }
      emitEnded();
      if (responseTiming === 'after ended') await respondToEnd();

      await waitFor(() =>
        expect(document.querySelector('.studio-layout')).toHaveAttribute(
          'data-studio-status',
          'ended'
        )
      );
      expect(await screen.findByText(summary)).toBeInTheDocument();
      expect(end).toHaveBeenCalledTimes(1);
    }
  );

  it('streams closing text, replaces a retried caption, and finalizes matching content', async () => {
    const snapshot = createLineupSnapshot({
      fixtureNo: 210,
      status: 'live'
    });
    const host = snapshot.participants[0];
    expect(host).toBeDefined();
    if (!host) return;

    const initialUpdatedAt = Date.parse(snapshot.discussion.updatedAt);
    const summarizingAt = new Date(initialUpdatedAt + 1_000).toISOString();
    const firstStartedAt = new Date(initialUpdatedAt + 2_000).toISOString();
    const retryStartedAt = new Date(initialUpdatedAt + 3_000).toISOString();
    const completedAt = new Date(initialUpdatedAt + 4_000).toISOString();
    const summaryAt = new Date(initialUpdatedAt + 5_000).toISOString();
    const endedAt = new Date(initialUpdatedAt + 6_000).toISOString();
    const firstUtteranceId = '50000000-0000-4000-8000-000000000210';
    const closingUtteranceId = '50000000-0000-4000-8000-000000000211';
    const firstAttemptText = '先整理本场共识，';
    const secondAttemptText = '讨论形成了明确共识。';
    const finalAttemptText = '下一步从低风险试点开始。';
    const summary = `${secondAttemptText}${finalAttemptText}`;
    const api = makeApi({
      getDiscussion: vi.fn(async () => snapshot)
    });
    renderAt(`/studio/${snapshot.discussion.id}`, api);
    await screen.findByRole('heading', { name: snapshot.discussion.topic });
    const source = await waitForStubEventSource();
    const seq = snapshot.lastEventSeq;

    emitEvent(
      source,
      {
        type: 'discussion.status',
        discussionId: snapshot.discussion.id,
        at: summarizingAt,
        status: 'summarizing',
        turnCount: snapshot.discussion.turnCount,
        maxTurns: snapshot.discussion.maxTurns
      },
      String(seq + 1)
    );
    const captionText = () =>
      document.querySelector<HTMLElement>('.on-air-caption__text')!;
    const summaryStream = () =>
      document.querySelector<HTMLElement>('.summary-panel__stream')!;
    await waitFor(() => expect(summaryStream()).toBeInTheDocument());

    emitEvent(source, {
      type: 'utterance.started',
      discussionId: snapshot.discussion.id,
      at: firstStartedAt,
      utteranceId: firstUtteranceId,
      participantId: host.id,
      act: 'closing',
      replyToParticipantId: null,
      seq: 1
    });
    emitEvent(source, {
      type: 'utterance.delta',
      discussionId: snapshot.discussion.id,
      at: firstStartedAt,
      utteranceId: firstUtteranceId,
      delta: firstAttemptText
    });
    await waitFor(() =>
      expect(captionText()).toHaveTextContent(firstAttemptText)
    );
    expect(summaryStream()).toHaveTextContent(firstAttemptText);

    emitEvent(source, {
      type: 'utterance.started',
      discussionId: snapshot.discussion.id,
      at: retryStartedAt,
      utteranceId: closingUtteranceId,
      participantId: host.id,
      act: 'closing',
      replyToParticipantId: null,
      seq: 2
    });
    await waitFor(() =>
      expect(captionText()).toHaveTextContent('等待下一位发言…')
    );
    expect(captionText()).not.toHaveTextContent(firstAttemptText);

    emitEvent(source, {
      type: 'utterance.delta',
      discussionId: snapshot.discussion.id,
      at: retryStartedAt,
      utteranceId: closingUtteranceId,
      delta: secondAttemptText
    });
    emitEvent(source, {
      type: 'utterance.delta',
      discussionId: snapshot.discussion.id,
      at: retryStartedAt,
      utteranceId: closingUtteranceId,
      delta: finalAttemptText
    });
    await waitFor(() => expect(captionText()).toHaveTextContent(summary));
    expect(summaryStream()).toHaveTextContent(summary);

    emitEvent(
      source,
      {
        type: 'utterance.completed',
        discussionId: snapshot.discussion.id,
        at: completedAt,
        utterance: {
          id: closingUtteranceId,
          discussionId: snapshot.discussion.id,
          participantId: host.id,
          seq: 2,
          act: 'closing',
          replyToParticipantId: null,
          content: summary,
          createdAt: completedAt
        }
      },
      String(seq + 2)
    );
    await waitFor(() =>
      expect(captionText()).toHaveTextContent('等待下一位发言…')
    );
    expect(captionText()).not.toHaveTextContent(summary);
    expect(
      document.querySelectorAll('.transcript-item[data-seq="2"] p')
    ).toHaveLength(2);

    emitEvent(
      source,
      {
        type: 'summary.completed',
        discussionId: snapshot.discussion.id,
        at: summaryAt,
        summary
      },
      String(seq + 3)
    );
    emitEvent(
      source,
      {
        type: 'discussion.status',
        discussionId: snapshot.discussion.id,
        at: endedAt,
        status: 'ended',
        turnCount: snapshot.discussion.turnCount,
        maxTurns: snapshot.discussion.maxTurns
      },
      String(seq + 4)
    );

    await waitFor(() =>
      expect(captionText()).toHaveTextContent('讨论已结束')
    );
    expect(captionText()).not.toHaveTextContent(summary);
    const closingItems = document.querySelectorAll(
      '.transcript-item[data-seq="2"] p'
    );
    expect(closingItems).toHaveLength(2);
    for (const item of closingItems) {
      expect(item).toHaveTextContent(summary);
    }
    expect(
      document.querySelector('.summary-panel__paragraphs')
    ).toHaveTextContent(summary);
  });

  it('refreshes the studio snapshot and announces a 409 state conflict', async () => {
    const user = userEvent.setup();
    const live = createShowcaseSnapshot(206, 'live');
    const paused: DiscussionSnapshot = {
      ...live,
      discussion: { ...live.discussion, status: 'paused' }
    };
    const pause = vi
      .fn()
      .mockRejectedValueOnce(
        new ApiError('INVALID_STATE', '当前讨论状态不允许暂停')
      );
    const getDiscussion = vi
      .fn()
      .mockResolvedValueOnce(live)
      .mockResolvedValueOnce(paused);
    const api = makeApi({ getDiscussion, pause });
    renderAt(`/studio/${live.discussion.id}`, api);

    await user.click(await screen.findByRole('button', { name: '暂停' }));

    expect(await screen.findByText('状态已变化，已刷新')).toBeInTheDocument();
    expect(
      await screen.findByRole('button', { name: '继续' })
    ).toBeInTheDocument();
    expect(getDiscussion).toHaveBeenCalledTimes(2);
  });
});
