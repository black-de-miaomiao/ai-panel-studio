import { useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Clapperboard,
  Radio,
  ShieldCheck,
  Sparkles
} from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import type { DiscussionSnapshot } from '@aps/shared';
import { ApiError } from '../api/httpApi';
import { useDiscussionApi } from '../api/DiscussionApiContext';
import { TopicForm } from '../components/lineup/TopicForm';
import { LineupReview } from '../components/lineup/LineupReview';
import { LineupSkeleton } from '../components/lineup/LineupSkeleton';
import { Button } from '../components/ui/Button';

type RetryOperation = 'regenerate' | 'start';

function errorMessage(caught: unknown, fallback: string): string {
  return caught instanceof Error && caught.message
    ? caught.message
    : fallback;
}

function failedDiscussionId(caught: unknown): string | null {
  if (!(caught instanceof ApiError) || caught.code !== 'LLM_ERROR') return null;
  const detail = caught.details[0];
  if (!detail || typeof detail !== 'object') return null;
  const id = (detail as { discussionId?: unknown }).discussionId;
  return typeof id === 'string' ? id : null;
}

export default function NewDiscussionPage() {
  const api = useDiscussionApi();
  const navigate = useNavigate();
  const [snapshot, setSnapshot] = useState<DiscussionSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryOperation, setRetryOperation] =
    useState<RetryOperation>('regenerate');
  const [failedId, setFailedId] = useState<string | null>(null);
  const [lastRequest, setLastRequest] = useState<{
    topic: string;
    expertCount: number;
  } | null>(null);

  const generate = async (topic: string, expertCount: number) => {
    setBusy(true);
    setError(null);
    setRetryOperation('regenerate');
    setLastRequest({ topic, expertCount });
    try {
      const created = failedId
        ? await api.regenerateLineup(failedId)
        : await api.createDiscussion({ topic, expertCount });
      setSnapshot(created);
      setFailedId(null);
    } catch (caught) {
      setError(errorMessage(caught, '暂时无法生成嘉宾阵容，请稍后重试。'));
      const discussionId = failedDiscussionId(caught);
      if (discussionId) {
        setFailedId(discussionId);
        try {
          setSnapshot(await api.getDiscussion(discussionId));
        } catch (loadError) {
          setError(
            errorMessage(
              loadError,
              '暂时无法载入失败的讨论，请稍后重试。'
            )
          );
        }
      }
    } finally {
      setBusy(false);
    }
  };

  const regenerate = async () => {
    if (!snapshot) return;
    setBusy(true);
    setError(null);
    setRetryOperation('regenerate');
    try {
      const updated = await api.regenerateLineup(snapshot.discussion.id);
      setSnapshot(updated);
      setFailedId(null);
    } catch (caught) {
      setError(errorMessage(caught, '暂时无法更换阵容，请稍后重试。'));
    } finally {
      setBusy(false);
    }
  };

  const confirmLineup = async () => {
    if (!snapshot) return;
    setBusy(true);
    setError(null);
    try {
      await api.start(snapshot.discussion.id);
      navigate(`/studio/${snapshot.discussion.id}`);
    } catch (caught) {
      setError(errorMessage(caught, '暂时无法进入演播厅，请稍后重试。'));
      setRetryOperation('start');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="new-page page-shell">
      <header className="new-header">
        <Link aria-label="返回演播大厅" className="brand-lockup" to="/">
          <span className="brand-lockup__mark">
            <Clapperboard size={18} strokeWidth={1.7} />
            <i />
          </span>
          <span className="brand-lockup__text">
            <strong>AI PANEL STUDIO</strong>
            <small>圆桌讨论 · 演播厅</small>
          </span>
        </Link>
        <span className="new-header__step">
          <span>01</span> / 02 · 发起讨论
        </span>
        <Link className="new-header__back" to="/">
          <ArrowLeft size={15} />
          返回大厅
        </Link>
      </header>

      <div className="new-page__content scroll-region">
        <div className="new-page__inner">
          {!snapshot ? (
            <>
              <section className="new-intro">
                <span className="section-kicker">
                  <Radio size={14} />
                  NEW ROUND TABLE / 01
                </span>
                <h1>让一个好问题，<span>开场。</span></h1>
                <p>
                  设定议题，邀请几位立场不同的专家。
                  <br className="desktop-break" />
                  主持人会把观点带到同一张桌上。
                </p>
              </section>

              <div className="new-workspace">
                <section className="new-form-card">
                  <div className="new-form-card__header">
                    <div>
                      <span className="panel__eyebrow">DISCUSSION BRIEF</span>
                      <h2>设定你的议题</h2>
                    </div>
                    <span className="new-form-card__step">STEP 01</span>
                  </div>
                  <TopicForm
                    busy={busy}
                    error={error}
                    initialTopic={lastRequest?.topic}
                    initialExpertCount={lastRequest?.expertCount}
                    onSubmit={(topic, expertCount) => void generate(topic, expertCount)}
                  />
                  {!snapshot && error && lastRequest && !busy ? (
                    <div className="new-page__retry">
                      <Button
                        onClick={() =>
                          void generate(
                            lastRequest.topic,
                            lastRequest.expertCount
                          )
                        }
                        size="sm"
                        variant="secondary"
                      >
                        重试
                      </Button>
                    </div>
                  ) : null}
                  {busy ? (
                    <div className="new-form-card__generating" role="status">
                      <span className="generating-spark"><Sparkles size={15} /></span>
                      正在邀请嘉宾入场…
                    </div>
                  ) : null}
                </section>

                <aside className="new-side-note">
                  <div className="new-side-note__top">
                    <span className="new-side-note__icon">
                      <Sparkles size={17} />
                    </span>
                    <span>今晚的流程</span>
                  </div>
                  <ol>
                    <li className="is-current">
                      <span>01</span>
                      <div><strong>设定议题</strong><small>输入一个值得讨论的问题</small></div>
                    </li>
                    <li>
                      <span>02</span>
                      <div><strong>邀请嘉宾</strong><small>生成不同立场的专家阵容</small></div>
                    </li>
                    <li>
                      <span>03</span>
                      <div><strong>进入演播厅</strong><small>确认阵容，开始观点交锋</small></div>
                    </li>
                  </ol>
                  <div className="new-side-note__foot">
                    <ShieldCheck size={15} />
                    话题和阵容只用于本场讨论
                  </div>
                  <div className="new-side-note__graphic" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                    <span />
                    <i />
                  </div>
                </aside>
              </div>
              {busy ? <LineupSkeleton expertCount={lastRequest?.expertCount} /> : null}
            </>
          ) : (
            <LineupReview
              busy={busy}
              error={error}
              onBack={() => {
                setSnapshot(null);
                setError(null);
                setFailedId(null);
              }}
              onConfirm={() => void confirmLineup()}
              onRegenerate={() => void regenerate()}
              onRetry={
                retryOperation === 'start'
                  ? () => void confirmLineup()
                  : () => void regenerate()
              }
              retryLabel={
                retryOperation === 'start' ? '重试进入演播厅' : '重试生成'
              }
              snapshot={snapshot}
            />
          )}
        </div>
        <footer className="new-page__footer">
          <span>第一个好问题，值得一桌认真作答。</span>
          <Link to="/studio/demo">
            先看演播厅演示
            <ArrowRight size={14} />
          </Link>
        </footer>
      </div>
    </main>
  );
}
