/**
 * Missing-object placeholder (add-library-profile-sync, task 6.1; spec:
 * map-objects). The library context is mocked so each test sets which entries
 * are present and what entryStatus answers.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { FlightPlan, LibraryObject } from '../../types/flightPlan';
import type { EntryStatus } from '../../sync/assetSync';

let library: LibraryObject[] = [];
let statuses: Record<string, EntryStatus> = {};
let trashed: Set<string> = new Set();

vi.mock('../../contexts/LibraryContext', () => ({
  useLibrary: () => ({
    library,
    entryStatus: (id: string) => statuses[id] ?? (library.some(e => e.id === id) ? 'present' : 'deleted'),
    isTrashed: (id: string) => trashed.has(id),
  }),
}));
vi.mock('../../contexts/ObjectSelectionContext', () => ({
  useObjectSelection: () => ({ selectedId: null, setSelectedId: vi.fn() }),
}));

import { ObjectsZone } from './ObjectsZone';

const SAM: LibraryObject = { id: 'sam', type: 'sam_site', lat: 42, lon: 41, name: 'SA-10' };
const plan = (refs: FlightPlan['libraryRefs']): FlightPlan => ({
  theatre: 'caucasus', points: [], declination: 0, bankAngle: 45, initTimeSec: 0, initFob: 0,
  name: 'P', libraryRefs: refs,
});

function renderZone(fp: FlightPlan, onFlightPlanUpdate = vi.fn()) {
  const utils = render(
    <MemoryRouter>
      <ObjectsZone
        flightPlan={fp} onFlightPlanUpdate={onFlightPlanUpdate}
        isAddMode={false} addType="sam_site" onAddModeToggle={vi.fn()} onAddTypeChange={vi.fn()}
      />
    </MemoryRouter>,
  );
  return { ...utils, onFlightPlanUpdate };
}

beforeEach(() => {
  library = [SAM];
  statuses = {};
  trashed = new Set();
});

describe('ObjectsZone — missing-object placeholder', () => {
  it('lists an unresolved ref as a placeholder alongside resolved objects', () => {
    renderZone(plan([{ uuid: 'sam' }, { uuid: 'gone' }]));
    expect(screen.getByText('SA-10')).toBeInTheDocument();
    expect(screen.getAllByTestId('missing-object-card')).toHaveLength(1);
  });

  it('a deleted entry offers Remove from plan, which removes only that ref', () => {
    const { onFlightPlanUpdate } = renderZone(plan([{ uuid: 'sam' }, { uuid: 'gone', comment: 'Pop-up here' }]));
    const card = screen.getByTestId('missing-object-card');
    expect(card).toHaveAttribute('data-state', 'deleted');
    expect(card).toHaveTextContent('Object deleted from the library');
    expect(card).toHaveTextContent('Pop-up here');
    fireEvent.click(screen.getAllByTitle('Remove from plan').at(-1)!);
    expect(onFlightPlanUpdate).toHaveBeenCalledWith(expect.objectContaining({
      libraryRefs: [{ uuid: 'sam' }],
    }));
  });

  it('a not-yet-synced entry is neutral and offers no removal', () => {
    statuses = { later: 'pending' };
    renderZone(plan([{ uuid: 'later', comment: 'Note' }]));
    const card = screen.getByTestId('missing-object-card');
    expect(card).toHaveAttribute('data-state', 'pending');
    expect(card).toHaveTextContent('Not synced yet');
    expect(card).toHaveTextContent('Note');
    expect(screen.queryByTitle('Remove from plan')).toBeNull();
    expect(card.className).not.toMatch(/red/);
  });

  it('a pending placeholder becomes a normal card once the entry arrives', () => {
    statuses = { later: 'pending' };
    const fp = plan([{ uuid: 'later' }]);
    const { rerender } = renderZone(fp);
    expect(screen.getByTestId('missing-object-card')).toBeInTheDocument();

    library = [SAM, { ...SAM, id: 'later', name: 'SA-11' }];
    statuses = {};
    rerender(
      <MemoryRouter>
        <ObjectsZone flightPlan={fp} onFlightPlanUpdate={vi.fn()} isAddMode={false} addType="sam_site"
          onAddModeToggle={vi.fn()} onAddTypeChange={vi.fn()} />
      </MemoryRouter>,
    );
    expect(screen.queryByTestId('missing-object-card')).toBeNull();
    expect(screen.getByText('SA-11')).toBeInTheDocument();
  });

  it('showing a plan with unresolved refs does not change it', () => {
    const { onFlightPlanUpdate } = renderZone(plan([{ uuid: 'gone' }]));
    expect(onFlightPlanUpdate).not.toHaveBeenCalled();
  });
});

describe('ObjectsZone — trashed entries (add-trash-and-soft-delete 6.5)', () => {
  it('a trashed entry says it can be restored, and still offers Remove from plan', () => {
    trashed = new Set(['gone']);
    renderZone(plan([{ uuid: 'gone' }]));
    const card = screen.getByTestId('missing-object-card');
    expect(card).toHaveTextContent('Object deleted from the library');
    expect(card).toHaveTextContent('It can be restored from the Trash.');
    expect(screen.getByTitle('Remove from plan')).toBeInTheDocument();
  });

  it('a purged entry does not mention restoring', () => {
    renderZone(plan([{ uuid: 'gone' }]));
    expect(screen.getByTestId('missing-object-card')).not.toHaveTextContent('Trash');
  });

  it('restoring the entry replaces the placeholder with a normal card', () => {
    trashed = new Set(['gone']);
    const fp = plan([{ uuid: 'gone' }]);
    const { rerender } = renderZone(fp);
    library = [SAM, { id: 'gone', type: 'aaa', lat: 42, lon: 41, name: 'ZSU-23' }];
    trashed = new Set();
    rerender(
      <MemoryRouter>
        <ObjectsZone
          flightPlan={fp} onFlightPlanUpdate={vi.fn()}
          isAddMode={false} addType="sam_site" onAddModeToggle={vi.fn()} onAddTypeChange={vi.fn()}
        />
      </MemoryRouter>,
    );
    expect(screen.queryByTestId('missing-object-card')).toBeNull();
    expect(screen.getByText('ZSU-23')).toBeInTheDocument();
  });
});
