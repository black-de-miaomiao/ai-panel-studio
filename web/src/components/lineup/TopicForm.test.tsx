import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TopicForm } from './TopicForm';

describe('TopicForm', () => {
  it('submits trimmed topic text with the selected expert count', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<TopicForm onSubmit={onSubmit} />);

    await user.type(
      screen.getByLabelText('今晚想聊什么？'),
      '  AI 与企业客服  '
    );
    await user.click(screen.getByRole('button', { name: '减少专家人数' }));
    await user.click(screen.getByRole('button', { name: '生成嘉宾阵容' }));

    expect(onSubmit).toHaveBeenCalledWith('AI 与企业客服', 3);
  });
});
