import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import App from './App';
import { mockApi } from './mocks/mockApi';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>
  );
}

beforeEach(() => {
  mockApi.reset();
});

afterEach(() => {
  cleanup();
});

describe('AI Panel Studio routes', () => {
  it('renders the lobby with grouped discussions and a stable replay tab', async () => {
    renderAt('/');

    expect(
      await screen.findByRole('heading', { name: '正在发生的观点交锋' })
    ).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /直播中/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /待开播/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /往期回放/ })).toHaveAttribute(
      'data-testid',
      'replay'
    );
    expect(
      screen.getByRole('link', { name: /进入演播厅：AI 助手进入企业客服/ })
    ).toBeInTheDocument();
  });

  it('shows the lineup form and validates before submission', async () => {
    const user = userEvent.setup();
    renderAt('/new');

    const topic = await screen.findByLabelText('今晚想聊什么？');
    await user.type(topic, 'A');
    await user.click(screen.getByRole('button', { name: '生成嘉宾阵容' }));
    expect(await screen.findByText(/话题长度需在 2–200 字之间/)).toBeInTheDocument();

    await user.clear(topic);
    await user.type(topic, '远程办公的边界在哪里？');
    await user.click(screen.getByRole('button', { name: '生成嘉宾阵容' }));
    expect(
      await screen.findByRole('heading', { name: '今晚的圆桌嘉宾' }, { timeout: 3000 })
    ).toBeInTheDocument();
    expect(screen.getByText('周明')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '换一批' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '确认阵容，进入演播厅' })
    ).toBeEnabled();
  });

  it('opens the deterministic demo and renders live studio regions', async () => {
    renderAt('/studio/demo?speed=100&at=36');

    expect(
      await screen.findByRole('heading', { name: /AI 助手进入企业客服/ })
    ).toBeInTheDocument();
    expect(screen.getByLabelText('演播厅舞台与嘉宾席位')).toBeInTheDocument();
    expect(screen.getByLabelText('直播字幕')).toHaveAttribute(
      'aria-live',
      'polite'
    );
    expect(screen.getByRole('tab', { name: /实录/ })).toBeInTheDocument();
  });
});
