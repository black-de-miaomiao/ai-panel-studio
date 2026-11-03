import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import { ArrowLeft, Clapperboard, LoaderCircle } from 'lucide-react';
import {
  type DiscussionSnapshot,
  type DiscussionStatus,
  type StreamEvent
} from '@aps/shared';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { ApiError } from '../api/httpApi';
import { useDiscussionApi } from '../api/DiscussionApiContext';
import { createDemoSnapshot } from '../mocks/fixtures';
import {
  createMockScript,
  snapshotAtFrame
} from '../mocks/mockScript';
import { MockEventSource } from '../mocks/mockEventSource';
import { useDiscussion } from '../state/useDiscussion';
import type { DiscussionEventSource } from '../state/eventSource';
import { SseDiscussionEventSource } from '../state/sseEventSource';
import { StudioHeader } from '../components/studio/StudioHeader';
import { StageArena } from '../components/studio/StageArena';
import { OnAirCaption } from '../components/studio/OnAirCaption';
import { StudioDesktopPanel } from '../components/studio/StudioDesktopPanel';
import { TranscriptPanel } from '../components/studio/TranscriptPanel';
import { InsightsPanel } from '../components/studio/InsightsPanel';
import { SummaryPanel } from '../components/studio/SummaryPanel';
import { Tabs } from '../components/ui/Tabs';
import { Button } from '../components/ui/Button';

interface StudioPageProps {
  id: string;
}

type ControlOperation = 'start' | 'pause' | 'resume' | 'end';

function errorMessage(caught: unknown, fallback: string): string {
  return caught instanceof Error && caught.message
    ? caught.message
    : fallback;
}

function makeStatusEvent(
  snapshot: DiscussionSnapshot,
  status: DiscussionStatus
): StreamEvent {
  return {
    type: 'discussion.status',
    discussionId: snapshot.discussion.id,
    at: new Date().toISOString(),
    status,
    turnCount: snapshot.discussion.turnCount,
    maxTurns: snapshot.discussion.maxTurns
  };
}

function StudioSession({
  snapshot,
  eventSource,
  demoMode,
  onSnapshot
}: {
  snapshot: DiscussionSnapshot;
  eventSource: DiscussionEventSource;
  demoMode: boolean;
  onSnapshot: (snapshot: DiscussionSnapshot) => void;
}) {
  const api = useDiscussionApi();
  const navigate = useNavigate();
  const [mobileTab, setMobileTab] = useState('transcript');
  const [requestBusy, setRequestBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryAction, setRetryAction] = useState<(() => void) | null>(null);
  const [discussionDeleted, setDiscussionDeleted] = useState(false);
  const { state, connection, dispatchEvent, patchDiscussion } = useDiscussion(
    snapshot,
    eventSource,
    !discussionDeleted
  );
  const stateRef = useRef(state);
  const redirectTimer = useRef<number | null>(null);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(
    () => () => {
      if (redirectTimer.current !== null) {
        window.clearTimeout(redirectTimer.current);
      }
    },
    []
  );

  const markDiscussionDeleted = useCallback(() => {
    setDiscussionDeleted(true);
    setError('这场讨论已被删除，即将返回演播大厅。');
    setRetryAction(null);
    if (redirectTimer.current === null) {
      redirectTimer.current = window.setTimeout(() => navigate('/'), 1_500);
    }
  }, [navigate]);

  useEffect(() => {
    if (demoMode || connection !== 'closed' || discussionDeleted) return;
    let active = true;
    void api.getDiscussion(snapshot.discussion.id).catch((caught: unknown) => {
      if (
        active &&
        caught instanceof ApiError &&
        caught.code === 'NOT_FOUND'
      ) {
        markDiscussionDeleted();
      }
    });
    return () => {
      active = false;
    };
  }, [
    api,
    connection,
    demoMode,
    discussionDeleted,
    markDiscussionDeleted,
    snapshot.discussion.id
  ]);

  const dispatchStatus = (status: DiscussionStatus) => {
    const current = stateRef.current;
    dispatchEvent(
      makeStatusEvent(current, status),
      current.lastEventSeq + 1
    );
  };

  const runControl = async (operation: ControlOperation): Promise<void> => {
    if (requestBusy) return;
    setRequestBusy(true);
    setError(null);
    setRetryAction(null);
    try {
      if (demoMode) {
        if (operation === 'start') dispatchStatus('live');
        if (operation === 'pause') dispatchStatus('paused');
        if (operation === 'resume') dispatchStatus('live');
        if (operation === 'end') {
          const current = stateRef.current;
          dispatchEvent(
            {
              type: 'discussion.status',
              discussionId: current.discussion.id,
              at: new Date().toISOString(),
              status: 'summarizing',
              turnCount: current.discussion.turnCount,
              maxTurns: current.discussion.maxTurns
            },
            current.lastEventSeq + 1
          );
        }
        return;
      }

      const discussion = await api[operation](snapshot.discussion.id);
      patchDiscussion(discussion);
    } catch (caught) {
      if (
        !demoMode &&
        caught instanceof ApiError &&
        caught.code === 'INVALID_STATE'
      ) {
        try {
          onSnapshot(await api.getDiscussion(snapshot.discussion.id));
          setError('状态已变化，已刷新');
        } catch (refreshError) {
          if (
            refreshError instanceof ApiError &&
            refreshError.code === 'NOT_FOUND'
          ) {
            markDiscussionDeleted();
          } else {
            setError(
              errorMessage(refreshError, '暂时无法刷新讨论状态，请稍后重试。')
            );
            setRetryAction(() => () => {
              void runControl(operation);
            });
          }
        }
      } else {
        setError(errorMessage(caught, '操作失败，请稍后重试。'));
        setRetryAction(() => () => {
          void runControl(operation);
        });
      }
    } finally {
      setRequestBusy(false);
    }
  };

  const transcriptPanel = (
    <TranscriptPanel
      participants={state.participants}
      utterances={state.utterances}
    />
  );
  const visibleError = error ?? state.lastError;

  return (
    <main className="studio-page page-shell">
      <StudioHeader
        busy={requestBusy}
        connection={connection}
        demoMode={demoMode}
        onBack={() => navigate('/')}
        onEnd={() => runControl('end')}
        onPause={() => void runControl('pause')}
        onResume={() => void runControl('resume')}
        onStart={() => void runControl('start')}
        state={state}
      />
      {visibleError ? (
        <div
          className="studio-error-banner"
          role={error ? 'alert' : 'status'}
        >
          <span>{visibleError}</span>
          {retryAction ? (
            <button
              className="studio-error-banner__retry"
              disabled={requestBusy}
              onClick={() => retryAction()}
              type="button"
            >
              重试
            </button>
          ) : null}
        </div>
      ) : null}
      <div
        className="studio-layout scroll-region"
        data-studio-status={state.discussion.status}
      >
        <div className="studio-stage-column">
          <StageArena
            discussionStatus={state.discussion.status}
            liveSpeakerId={state.liveUtterance?.participantId}
            participants={state.participants}
          />
          <OnAirCaption
            liveUtterance={state.liveUtterance}
            participants={state.participants}
            status={state.discussion.status}
          />
        </div>
        <div className="studio-transcript-desktop">{transcriptPanel}</div>
        <StudioDesktopPanel
          insightsVersion={state.insightsVersion}
          liveSummary={
            state.liveUtterance?.act === 'closing'
              ? state.liveUtterance.text
              : ''
          }
          onBack={() => navigate('/')}
          snapshot={state}
        />
        <section className="studio-mobile-content">
          <Tabs
            ariaLabel="演播厅信息面板"
            items={[
              { key: 'transcript', label: '实录', count: state.utterances.length },
              {
                key: 'insights',
                label: '共识与分歧',
                count: state.insights.length
              },
              {
                key: 'summary',
                label: '总结',
                count: state.discussion.status === 'ended' ? 1 : 0
              }
            ]}
            activeKey={mobileTab}
            onChange={setMobileTab}
            className="studio-mobile-tabs"
            compact
          />

          <div
            aria-labelledby={mobileTab}
            className="studio-mobile-panel"
            id={`studio-tabpanel-${mobileTab}`}
            role="tabpanel"
            tabIndex={0}
          >
            {mobileTab === 'transcript' ? (
              <TranscriptPanel
                compact
                participants={state.participants}
                utterances={state.utterances}
              />
            ) : null}
            {mobileTab === 'insights' ? (
              <InsightsPanel
                compact
                insights={state.insights}
                participants={state.participants}
                version={state.insightsVersion}
              />
            ) : null}
            {mobileTab === 'summary' ? (
              <SummaryPanel
                compact
                snapshot={state}
                liveSummary={
                  state.liveUtterance?.act === 'closing'
                    ? state.liveUtterance.text
                    : ''
                }
                onBack={() => navigate('/')}
              />
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}

export default function StudioPage({ id }: StudioPageProps) {
  const api = useDiscussionApi();
  const [searchParams] = useSearchParams();
  const demoMode = id === 'demo';
  const baseSnapshot = useMemo(
    () => (demoMode ? createDemoSnapshot() : null),
    [demoMode]
  );
  const frames = useMemo(
    () => (baseSnapshot ? createMockScript(baseSnapshot) : []),
    [baseSnapshot]
  );
  const requestedProgress = Number(searchParams.get('at') ?? 0);
  const progressPercent = Number.isFinite(requestedProgress)
    ? Math.max(0, Math.min(100, requestedProgress))
    : 0;
  const speedValue = Number(searchParams.get('speed') ?? 1);
  const speed = Number.isFinite(speedValue)
    ? Math.max(0.1, Math.min(100, speedValue))
    : 1;
  const frameIndex = Math.floor((frames.length * progressPercent) / 100);
  const demoSnapshot = useMemo(
    () =>
      baseSnapshot
        ? snapshotAtFrame(baseSnapshot, frames, frameIndex)
        : null,
    [baseSnapshot, frameIndex, frames]
  );
  const demoEventSource = useMemo(
    () => new MockEventSource(frames, speed, frameIndex),
    [frameIndex, frames, speed]
  );
  const emptyEventSource = useMemo(() => new MockEventSource([]), []);
  const [snapshot, setSnapshot] = useState<DiscussionSnapshot | null>(
    demoSnapshot
  );
  const [loading, setLoading] = useState(!demoMode);
  const [loadError, setLoadError] = useState<unknown>(null);

  const loadSnapshot = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    setSnapshot(null);
    try {
      setSnapshot(await api.getDiscussion(id));
    } catch (caught) {
      setLoadError(caught);
    } finally {
      setLoading(false);
    }
  }, [api, id]);

  useEffect(() => {
    if (demoMode) {
      setSnapshot(demoSnapshot);
      setLoading(false);
      setLoadError(null);
      return;
    }
    void loadSnapshot();
  }, [demoMode, demoSnapshot, loadSnapshot]);

  const realEventSource = useMemo<DiscussionEventSource>(
    () =>
      snapshot && !demoMode
        ? new SseDiscussionEventSource(
            id,
            snapshot.lastEventSeq
          )
        : emptyEventSource,
    [demoMode, emptyEventSource, id, snapshot?.lastEventSeq]
  );

  if (loading) {
    return (
      <main className="studio-loading page-shell" role="status">
        <LoaderCircle className="loading-spinner" size={22} />
        <span>正在载入演播厅…</span>
      </main>
    );
  }

  if (!snapshot) {
    const notFound =
      loadError instanceof ApiError && loadError.code === 'NOT_FOUND';
    return (
      <main className="studio-not-found page-shell">
        <span className="brand-lockup__mark">
          <Clapperboard size={18} />
        </span>
        <h1>
          {notFound
            ? '没有找到这场讨论'
            : errorMessage(loadError, '暂时无法载入这场讨论。')}
        </h1>
        <p>
          {notFound
            ? '这场演播厅可能已经离开节目单。'
            : '请确认后端已启动，然后重试。'}
        </p>
        <Button onClick={() => void loadSnapshot()} size="md" variant="secondary">
          重试
        </Button>
        <Link className="button button--secondary button--md" to="/">
          <ArrowLeft size={15} />
          返回演播大厅
        </Link>
      </main>
    );
  }

  return (
    <StudioSession
      demoMode={demoMode}
      eventSource={demoMode ? demoEventSource : realEventSource}
      key={`${id}-${demoMode ? frameIndex : 'real'}`}
      onSnapshot={setSnapshot}
      snapshot={snapshot}
    />
  );
}
