import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TitleZone } from './TitleZone';

const theatres = [
  { id: 'caucasus', name: 'Caucasus' },
  { id: 'syria', name: 'Syria' },
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
