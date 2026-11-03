import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createShowcaseSnapshot } from '../../mocks/fixtures';
import { OnAirCaption } from './OnAirCaption';

describe('OnAirCaption', () => {
  it.each([
    ['ended', '讨论已结束'],
    ['paused', '讨论已暂停']
  ] as const)(
    'shows the %s message instead of the waiting placeholder',
    (status, message) => {
      const snapshot = createShowcaseSnapshot(44, status);
      render(
        <OnAirCaption
          liveUtterance={null}
          participants={snapshot.participants}
          status={status}
        />
      );

      expect(screen.getByText(message)).toBeInTheDocument();
      expect(screen.queryByText('等待下一位发言…')).not.toBeInTheDocument();
    }
  );
});
