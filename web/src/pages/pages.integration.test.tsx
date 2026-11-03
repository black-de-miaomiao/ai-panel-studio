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
import type { Discussion, DiscussionSnapshot } from '@aps/shared';
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
      status: 'live' as const
    })),
    pause: vi.fn(async () => ({
      ...snapshot.discussion,
      status: 'paused' as const
    })),
    resume: vi.fn(async () => ({
      ...snapshot.discussion,
      status: 'live' as const
    })),
    end: vi.fn(async () => ({
      ...snapshot.discussion,
      status: 'summarizing' as const
    })),
    deleteDiscussion: vi.fn(async () => {}),
    ...overrides
  };
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
    expect(StubEventSource.instances[0]?.url).toContain(
      `since=${snapshot.lastEventSeq}`
    );
  });

  it('calls start, pause, resume, and end APIs from studio controls', async () => {
    const user = userEvent.setup();
    const snapshot = createLineupSnapshot({ fixtureNo: 205 });
    const start = vi.fn(async () => ({
      ...snapshot.discussion,
      status: 'live' as const
    }));
    const pause = vi.fn(async () => ({
      ...snapshot.discussion,
      status: 'paused' as const
    }));
    const resume = vi.fn(async () => ({
      ...snapshot.discussion,
      status: 'live' as const
    }));
    const end = vi.fn(async () => ({
      ...snapshot.discussion,
      status: 'summarizing' as const
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

    const source = StubEventSource.instances[0];
    expect(source).toBeDefined();
    if (!source) return;

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

    act(() => {
      utterances.forEach((utterance, index) => {
        source.emit(
          JSON.stringify({
            type: 'utterance.completed',
            discussionId: snapshot.discussion.id,
            at: sseAt,
            utterance
          }),
          String(index + 1)
        );
      });
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

  it('does not apply an older control response over a newer SSE status', async () => {
    const user = userEvent.setup();
    const snapshot = createLineupSnapshot({ fixtureNo: 208 });
    const initialUpdatedAt = Date.parse(snapshot.discussion.updatedAt);
    const responseUpdatedAt = new Date(initialUpdatedAt + 1_000).toISOString();
    const sseUpdatedAt = new Date(initialUpdatedAt + 2_000).toISOString();
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
    const source = StubEventSource.instances[0];
    expect(source).toBeDefined();
    expect(resolveStart).toBeDefined();
    if (!source || !resolveStart) return;

    act(() => {
      source.emit(
        JSON.stringify({
          type: 'discussion.status',
          discussionId: snapshot.discussion.id,
          at: sseUpdatedAt,
          status: 'live',
          turnCount: 0,
          maxTurns: snapshot.discussion.maxTurns
        }),
        '1'
      );
    });
    const pauseButton = await screen.findByRole('button', { name: '暂停' });

    await act(async () => {
      resolveStart?.({
        ...snapshot.discussion,
        status: 'lineup_ready',
        updatedAt: responseUpdatedAt
      });
    });

    await waitFor(() => expect(pauseButton).toBeEnabled());
    expect(screen.getByText('LIVE')).toBeInTheDocument();
    expect(start).toHaveBeenCalledWith(snapshot.discussion.id);
    expect(screen.queryByRole('button', { name: '开始直播' })).toBeNull();
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
