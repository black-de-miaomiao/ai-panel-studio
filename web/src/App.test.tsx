import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from './App';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('App', () => {
  it('renders the product name and requests the health endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        llm: {
          provider: 'mock'
        }
      })
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>
    );

    expect(
      await screen.findByRole('heading', { name: 'AI Panel Studio' })
    ).toBeInTheDocument();
    expect(await screen.findByText('mock')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/health');
  });
});
