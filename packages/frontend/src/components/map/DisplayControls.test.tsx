import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import type { TheatreMetadata } from '../../hooks/useTheatres';
import { DisplayControls } from './DisplayControls';
import { resolveMapChoice, setMapChoice } from '../../utils/mapChoice';

const theatres: TheatreMetadata[] = [
  { id: 'germany', name: 'Germany', defaultMap: 'default', maps: [{ id: 'default', name: 'Default' }, { id: 'vfr', name: 'VFR chart' }] },
  { id: 'syria', name: 'Syria', defaultMap: 'default', maps: [{ id: 'default', name: 'Default' }] },
];

vi.mock('../../hooks/useTheatres', () => ({
  useTheatres: () => ({ theatres, isLoading: false, error: null }),
}));

function renderControls(theatreId: string) {
  return render(
    <DisplayControls
      theatreId={theatreId}
      gridEnabled={false}
      measureEnabled={false}
      onGridChange={vi.fn()}
      onMeasureChange={vi.fn()}
    />,
  );
}

describe('DisplayControls map selector', () => {
  beforeEach(() => {
    localStorage.clear();
    setMapChoice('germany', 'default');
  });

  it('is hidden when the theatre offers a single map', () => {
    renderControls('syria');
    expect(screen.queryByLabelText('Map')).toBeNull();
  });

  it("lists the theatre's maps and marks the selected one", () => {
    renderControls('germany');
    const select = screen.getByLabelText('Map') as HTMLSelectElement;
    expect([...select.options].map(o => o.textContent)).toEqual(['Default', 'VFR chart']);
    expect(select.value).toBe('default');
  });

  it('stores the chosen map for the theatre', () => {
    renderControls('germany');
    fireEvent.change(screen.getByLabelText('Map'), { target: { value: 'vfr' } });
    expect(resolveMapChoice(theatres[0])).toBe('vfr');
    expect((screen.getByLabelText('Map') as HTMLSelectElement).value).toBe('vfr');
  });

  it('follows a choice made elsewhere', () => {
    renderControls('germany');
    act(() => setMapChoice('germany', 'vfr'));
    expect((screen.getByLabelText('Map') as HTMLSelectElement).value).toBe('vfr');
  });
});
