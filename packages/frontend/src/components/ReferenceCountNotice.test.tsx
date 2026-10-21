import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

let connectivity: 'online' | 'offline' = 'online';
vi.mock('../contexts/SpaceAssetsContext', () => ({ useSpaceAssets: () => ({ status: { connectivity } }) }));
vi.mock('../api/assetApi', () => ({ countReferences: vi.fn() }));

import { countReferences } from '../api/assetApi';
import { ReferenceCountNotice, referenceCountMessage } from './ReferenceCountNotice';

beforeEach(() => {
  vi.clearAllMocks();
  connectivity = 'online';
});

describe('ReferenceCountNotice (add-trash-and-soft-delete 6.1)', () => {
  it('states how many plans use an entry', async () => {
    (countReferences as any).mockResolvedValue(3);
    render(<ReferenceCountNotice kind="entry" id="e1" />);
    expect(screen.getByTestId('reference-count')).toHaveTextContent('Checking');
    expect(await screen.findByText(/Used by 3 flight plans/)).toBeInTheDocument();
    expect(countReferences).toHaveBeenCalledWith('entry', 'e1');
  });

  it('states that one plan flies a profile', async () => {
    (countReferences as any).mockResolvedValue(1);
    render(<ReferenceCountNotice kind="profile" id="p1" />);
    expect(await screen.findByText(/Flown by 1 flight plan\. It keeps the reference/)).toBeInTheDocument();
  });

  it('states that no plan uses it', async () => {
    (countReferences as any).mockResolvedValue(0);
    render(<ReferenceCountNotice kind="profile" id="p1" />);
    expect(await screen.findByText('No flight plan flies it.')).toBeInTheDocument();
  });

  it('says other plans could not be checked when the request fails', async () => {
    (countReferences as any).mockRejectedValue(new TypeError('Failed to fetch'));
    render(<ReferenceCountNotice kind="entry" id="e1" />);
    expect(await screen.findByText(/could not be checked/)).toBeInTheDocument();
  });

  it('does not ask the server while offline', () => {
    connectivity = 'offline';
    render(<ReferenceCountNotice kind="entry" id="e1" />);
    expect(screen.getByText(/could not be checked/)).toBeInTheDocument();
    expect(countReferences).not.toHaveBeenCalled();
  });

  it('never blocks: every message is informational', () => {
    expect(referenceCountMessage('entry', { status: 'counted', count: 2 }))
      .toBe('Used by 2 flight plans. They keep the reference, shown as a missing object until it is restored from the Trash.');
  });
});
