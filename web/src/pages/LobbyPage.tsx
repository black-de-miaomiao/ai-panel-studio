import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Clapperboard,
  Mic2,
  Plus,
  Radio,
  Sparkles
} from 'lucide-react';
import { Link, useSearchParams } from 'react-router';
import {
  LOBBY_GROUPS,
  type DiscussionListItem,
  type LobbyGroupKey
} from '@aps/shared';
import { mockApi } from '../mocks/mockApi';
import { DiscussionCard } from '../components/lobby/DiscussionCard';
import { LobbyGroupTabs } from '../components/lobby/LobbyGroupTabs';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';

const DEFAULT_TAB = LOBBY_GROUPS[0]?.key ?? 'live';

function isLobbyGroupKey(value: string | null): value is LobbyGroupKey {
  return LOBBY_GROUPS.some((group) => group.key === value);
}

export default function LobbyPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab');
  const [activeKey, setActiveKey] = useState<LobbyGroupKey>(
    isLobbyGroupKey(requestedTab) ? requestedTab : DEFAULT_TAB
  );
  const [items, setItems] = useState<DiscussionListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void mockApi
      .listDiscussions()
      .then((discussions) => {
        if (!active) return;
        setItems(discussions);
        const defaultGroup = LOBBY_GROUPS.find((group) =>
          discussions.some((discussion) =>
            (group.statuses as readonly DiscussionListItem['status'][]).includes(
              discussion.status
            )
          )
        );
        const initialKey = isLobbyGroupKey(requestedTab)
          ? requestedTab
          : (defaultGroup?.key ?? DEFAULT_TAB);
        setActiveKey(initialKey);
        setSearchParams((current) => {
          const next = new URLSearchParams(current);
          next.set('tab', initialKey);
          return next;
        }, { replace: true });
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [requestedTab, setSearchParams]);

  useEffect(() => {
    if (isLobbyGroupKey(requestedTab) && requestedTab !== activeKey) {
      setActiveKey(requestedTab);
    }
  }, [activeKey, requestedTab]);

  const counts = useMemo(() => {
    const result: Record<LobbyGroupKey, number> = {
      live: 0,
      upcoming: 0,
      replay: 0
    };
    for (const group of LOBBY_GROUPS) {
      result[group.key] = items.filter((discussion) =>
        (group.statuses as readonly DiscussionListItem['status'][]).includes(
          discussion.status
        )
      ).length;
    }
    return result;
  }, [items]);
  const activeGroup = LOBBY_GROUPS.find((group) => group.key === activeKey);
  const visibleItems = activeGroup
    ? items.filter((item) =>
        (activeGroup.statuses as readonly DiscussionListItem['status'][]).includes(
          item.status
        )
      )
    : [];

  return (
    <main className="lobby-page page-shell">
      <header className="lobby-header">
        <Link aria-label="AI Panel Studio 首页" className="brand-lockup" to="/">
          <span className="brand-lockup__mark">
            <Clapperboard size={19} strokeWidth={1.7} />
            <i />
          </span>
          <span className="brand-lockup__text">
            <strong>AI PANEL STUDIO</strong>
            <small>圆桌讨论 · 演播厅</small>
          </span>
        </Link>
        <nav aria-label="主导航" className="lobby-header__nav">
          <span className="lobby-header__nav-item is-active">
            <Radio size={15} />
            演播大厅
          </span>
          <Link className="lobby-header__new-link" to="/new">
            <Plus size={16} />
            发起新讨论
          </Link>
        </nav>
      </header>

      <div className="lobby-content scroll-region">
        <section className="lobby-hero">
          <div className="lobby-hero__copy">
            <span className="eyebrow"><span /> LIVE DISCUSSION ROOM</span>
            <h1>
              把一个问题，
              <br />
              交给<span>不同的声音。</span>
            </h1>
            <p>
              邀请一桌 AI 专家，现场看观点如何交锋、共识如何浮现。
              <br className="desktop-break" />
              每场讨论，都从真实的问题开始。
            </p>
            <div className="lobby-hero__actions">
              <Link className="button button--primary button--lg" to="/new">
                <span className="button__icon"><Plus size={17} /></span>
                发起一场圆桌
                <ArrowRight size={16} />
              </Link>
              <span className="lobby-hero__note">
                <Sparkles size={14} />
                6 位专家 · 1 位主持人 · 多角度交锋
              </span>
            </div>
          </div>

          <div className="lobby-hero__signal" aria-hidden="true">
            <div className="signal-orbit signal-orbit--outer" />
            <div className="signal-orbit signal-orbit--inner" />
            <div className="signal-core">
              <Mic2 size={29} strokeWidth={1.5} />
            </div>
            <span className="signal-node signal-node--one" />
            <span className="signal-node signal-node--two" />
            <span className="signal-node signal-node--three" />
            <span className="signal-caption">ON AIR / 24H</span>
          </div>
          <div className="lobby-hero__index" aria-hidden="true">
            <span>01</span>
            <span>STUDIO FLOOR</span>
          </div>
        </section>

        <section className="lobby-discussions" aria-labelledby="discussions-heading">
          <div className="lobby-section-heading">
            <div>
              <span className="section-kicker">
                <span className="section-kicker__line" />
                讨论现场
              </span>
              <h2 id="discussions-heading">正在发生的观点交锋</h2>
              <p>选择一场讨论，进入演播厅，跟上每一次观点碰撞。</p>
            </div>
            <div className="lobby-section-heading__meta">
              <span className="live-indicator"><i /> ON AIR</span>
              <span>{items.length.toString().padStart(2, '0')} 场讨论</span>
            </div>
          </div>

          <LobbyGroupTabs
            counts={counts}
            value={activeKey}
            onChange={(key) => {
              setActiveKey(key);
              setSearchParams((current) => {
                const next = new URLSearchParams(current);
                next.set('tab', key);
                return next;
              });
            }}
          />

          {loading ? (
            <div className="lobby-loading" role="status">
              <span className="skeleton skeleton--card" />
              <span className="skeleton skeleton--card" />
              <span className="skeleton skeleton--card" />
            </div>
          ) : visibleItems.length ? (
            <div className="discussion-grid">
              {visibleItems.map((discussion) => (
                <DiscussionCard
                  discussion={discussion}
                  key={discussion.id}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              title={
                activeKey === 'live'
                  ? '演播厅暂时安静'
                  : activeKey === 'upcoming'
                    ? '还没有待开播的讨论'
                    : '还没有往期回放'
              }
              description="发起一个新话题，召集不同立场的专家一起聊聊。"
              icon={<Radio size={21} />}
              action={
                <Link className="button button--secondary button--md" to="/new">
                  发起新讨论
                  <ArrowRight size={15} />
                </Link>
              }
            />
          )}
        </section>
        <footer className="lobby-footer">
          <span>AI PANEL STUDIO</span>
          <span>把不同的声音，放在同一张桌上。</span>
          <Link to="/studio/demo">进入演示场</Link>
        </footer>
      </div>
    </main>
  );
}
