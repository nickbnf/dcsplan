import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TitleZone } from './TitleZone';

const theatres = [
  { id: 'caucasus', name: 'Caucasus', defaultMap: 'default', maps: [{ id: 'default', name: 'Default' }] },
  { id: 'syria', name: 'Syria', defaultMap: 'default', maps: [{ id: 'default', name: 'Default' }] },
];

describe('TitleZone', () => {
  it('displays the theatre name as static text, not a dropdown', () => {
    render(
      <TitleZone
        currentTheatreId="syria"
        availableTheatres={theatres}
        isLoadingTheatres={false}
      />
    );

    expect(screen.getByText('Syria Theatre')).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
