import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Clapperboard, LoaderCircle } from 'lucide-react';
import {
  type DiscussionSnapshot,
  type DiscussionStatus,
  type StreamEvent
} from '@aps/shared';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { mockApi, MockApiError } from '../mocks/mockApi';
import { createDemoSnapshot } from '../mocks/fixtures';
import {
  createMockScript,
  snapshotAtFrame
} from '../mocks/mockScript';
import { MockEventSource } from '../mocks/mockEventSource';
import { useDiscussion } from '../state/useDiscussion';
import type { ConnectionStatus } from '../state/eventSource';
import { StudioHeader } from '../components/studio/StudioHeader';
import { StageArena } from '../components/studio/StageArena';
import { OnAirCaption } from '../components/studio/OnAirCaption';
import { TranscriptPanel } from '../components/studio/TranscriptPanel';
import { InsightsPanel } from '../components/studio/InsightsPanel';
import { SummaryPanel } from '../components/studio/SummaryPanel';
import { Tabs } from '../components/ui/Tabs';

interface StudioPageProps {
  id: string;
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
  demoMode
}: {
  snapshot: DiscussionSnapshot;
  eventSource: MockEventSource;
  demoMode: boolean;
}) {
  const navigate = useNavigate();
  const { state, connection, dispatchEvent } = useDiscussion(
    snapshot,
    eventSource,
    true
  );
  const [mobileTab, setMobileTab] = useState('transcript');
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const dispatchStatus = (status: DiscussionStatus, eventSeq?: number) => {
    dispatchEvent(makeStatusEvent(stateRef.current, status), eventSeq);
  };

  const onStart = async () => {
    if (!demoMode) {
      try {
        await mockApi.start(snapshot.discussion.id);
      } catch {
        // The reducer remains authoritative for the mock-only local control.
      }
    }
    dispatchStatus('live', stateRef.current.lastEventSeq + 1);
  };
  const onPause = async () => {
    if (!demoMode) {
      try {
        await mockApi.pause(snapshot.discussion.id);
      } catch {
        // A local preview still allows controls when mock data is read-only.
      }
    }
    dispatchStatus('paused', stateRef.current.lastEventSeq + 1);
  };
  const onResume = async () => {
    if (!demoMode) {
      try {
        await mockApi.resume(snapshot.discussion.id);
      } catch {
        // A local preview still allows controls when mock data is read-only.
      }
    }
    dispatchStatus('live', stateRef.current.lastEventSeq + 1);
  };
  const onEnd = async () => {
    if (!demoMode) {
      try {
        await mockApi.end(snapshot.discussion.id);
      } catch {
        // The UI keeps its mock-only transition deterministic.
      }
    }
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

    if (demoMode) return;
    window.setTimeout(() => {
      const latest = stateRef.current;
      const summary = [
        '本场讨论围绕用户提出的问题展开，专家从服务效率、实际边界与用户体验几个角度进行了交流。',
        '嘉宾认同，应先从范围清晰、答案可核验的问题开始，并为用户保留明确的人工支持。',
        '复杂问题的自动化边界仍需结合实际服务流程验证。下一步可以从小范围试点开始，持续观察用户反馈。'
      ].join('\n\n');
      try {
        mockApi.completeSummary(latest.discussion.id, summary);
      } catch {
        // A route opened from the static seed fixture has no mutable record.
      }
      dispatchEvent(
        {
          type: 'summary.completed',
          discussionId: latest.discussion.id,
          at: new Date().toISOString(),
          summary
        },
        latest.lastEventSeq + 1
      );
      dispatchEvent(
        makeStatusEvent(latest, 'ended'),
        latest.lastEventSeq + 2
      );
    }, 680);
  };

  const summaryPanel =
    state.discussion.status === 'summarizing' ||
    state.discussion.status === 'ended' ? (
      <SummaryPanel
        snapshot={state}
        liveSummary={
          state.liveUtterance?.act === 'closing'
            ? state.liveUtterance.text
            : ''
        }
        onBack={() => navigate('/')}
      />
    ) : null;

  const insightPanel = (
    <InsightsPanel
      insights={state.insights}
      participants={state.participants}
      version={state.insightsVersion}
    />
  );
  const transcriptPanel = (
    <TranscriptPanel
      participants={state.participants}
      utterances={state.utterances}
    />
  );

  return (
    <main className="studio-page page-shell">
      <StudioHeader
        connection={connection}
        onBack={() => navigate('/')}
        onEnd={onEnd}
        onPause={onPause}
        onResume={onResume}
        onStart={onStart}
        state={state}
      />
      {state.lastError ? (
        <div className="studio-error-banner" role="status">
          {state.lastError}
        </div>
      ) : null}
      <div
        className="studio-layout scroll-region"
        data-studio-status={state.discussion.status}
      >
        <div className="studio-stage-column">
          <StageArena
            liveSpeakerId={state.liveUtterance?.participantId}
            participants={state.participants}
          />
          <OnAirCaption
            liveUtterance={state.liveUtterance}
            participants={state.participants}
          />
        </div>
        <div className="studio-transcript-desktop">{transcriptPanel}</div>
        <aside className="studio-insights-desktop">
          {summaryPanel}
          {insightPanel}
        </aside>
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
      {demoMode ? (
        <div className="studio-demo-tag">
          <span aria-hidden="true" />
          DEMO REPLAY
        </div>
      ) : null}
    </main>
  );
}

export default function StudioPage({ id }: StudioPageProps) {
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
    () =>
      new MockEventSource(frames, speed, frameIndex),
    [frameIndex, frames, speed]
  );
  const [snapshot, setSnapshot] = useState<DiscussionSnapshot | null>(
    demoSnapshot
  );
  const [loading, setLoading] = useState(!demoMode);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (demoMode) {
      setSnapshot(demoSnapshot);
      setLoading(false);
      setError(null);
      return;
    }
    let active = true;
    setLoading(true);
    void mockApi
      .getDiscussion(id)
      .then((nextSnapshot) => {
        if (active) setSnapshot(nextSnapshot);
      })
      .catch((caught: unknown) => {
        if (!active) return;
        setError(
          caught instanceof MockApiError
            ? caught.message
            : '暂时无法载入这场讨论。'
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [demoMode, demoSnapshot, id]);

  const emptySource = useMemo(() => new MockEventSource([]), []);

  if (loading) {
    return (
      <main className="studio-loading page-shell" role="status">
        <LoaderCircle className="loading-spinner" size={22} />
        <span>正在调试演播厅灯光…</span>
      </main>
    );
  }

  if (!snapshot) {
    return (
      <main className="studio-not-found page-shell">
        <span className="brand-lockup__mark">
          <Clapperboard size={18} />
        </span>
        <h1>{error ?? '没有找到这场讨论'}</h1>
        <p>这场演播厅可能已经离开节目单。</p>
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
      eventSource={demoMode ? demoEventSource : emptySource}
      key={`${id}-${demoMode ? frameIndex : 'snapshot'}`}
      snapshot={snapshot}
    />
  );
}
