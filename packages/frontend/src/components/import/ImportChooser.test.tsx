/** The import chooser (add-local-data-import task 4.1; spec: plan-import,
 *  *The import chooser lists what the file holds*, *Deselecting an item only
 *  skips what the destination lacks*). */
import React, { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { defaultAircraft } from '../../types/flightPlan';
import { SELECT_ALL, type ImportPreview, type ImportSelection } from '../../import/types';
import { ImportChooser } from './ImportChooser';
import { ImportDialog } from './ImportDialog';

const FULL: ImportPreview = {
  plan: { name: 'Strike North', theatre: 'caucasus', waypoints: 5 },
  entries: { total: 12, added: 4, kept: 8, differs: 0 },
  profile: { aircraft: { ...defaultAircraft(), model: 'F-16C' }, present: false },
};

const Harness: React.FC<{ preview?: ImportPreview; tier?: 'anonymous' | 'signed-in'; planLocked?: boolean }> = ({
  preview = FULL, tier = 'signed-in', planLocked = true,
}) => {
  const [selection, setSelection] = useState<ImportSelection>(SELECT_ALL);
  return <ImportChooser preview={preview} selection={selection} onChange={setSelection} tier={tier} planLocked={planLocked} />;
};

const box = (name: RegExp) => screen.getByRole('checkbox', { name });

describe('ImportChooser', () => {
  it('lists the plan, library objects and profile, all selected', () => {
    render(<Harness />);
    expect(box(/Flight plan “Strike North”/)).toBeChecked();
    expect(box(/Library objects \(12\)/)).toBeChecked();
    expect(box(/Performance profile “F-16C”/)).toBeChecked();
    expect(screen.getByText('4 new')).toBeInTheDocument();
    expect(screen.getByText('8 already in your library')).toBeInTheDocument();
  });

  it('lists only what the source holds', () => {
    render(<Harness preview={{ ...FULL, entries: null, profile: null }} />);
    expect(screen.getAllByRole('checkbox')).toHaveLength(1);
  });

  it('does not let a file\'s plan be deselected', () => {
    render(<Harness />);
    expect(box(/Flight plan/)).toBeDisabled();
  });

  it('lets local data\'s plan be deselected', () => {
    render(<Harness planLocked={false} />);
    fireEvent.click(box(/Flight plan/));
    expect(box(/Flight plan/)).not.toBeChecked();
  });

  it('states that skipped new objects will show as missing', () => {
    render(<Harness />);
    expect(screen.queryByTestId('entries-skipped-note')).toBeNull();
    fireEvent.click(box(/Library objects/));
    expect(screen.getByTestId('entries-skipped-note')).toHaveTextContent('4 new objects are not added; the plan shows them as missing.');
  });

  it('locks the library row when every object is already in the account', () => {
    render(<Harness preview={{ ...FULL, entries: { total: 56, added: 0, kept: 56, differs: 0 } }} />);
    const row = box(/Library objects/);
    expect(row).toBeChecked();
    expect(row).toBeDisabled();
    expect(screen.getByText('56 objects, all already in your account')).toBeInTheDocument();
    expect(screen.queryByTestId('entries-skipped-note')).toBeNull();
  });

  it('says "library" rather than "account" in the anonymous tier', () => {
    render(<Harness tier="anonymous" preview={{ ...FULL, entries: { total: 1, added: 0, kept: 1, differs: 0 } }} />);
    expect(screen.getByText('1 object, all already in your library')).toBeInTheDocument();
  });

  it('re-selects a locked library row so local duplicates still leave the device', () => {
    const onChange = vi.fn();
    render(
      <ImportChooser
        preview={{ ...FULL, entries: { total: 3, added: 0, kept: 3, differs: 0 } }}
        selection={{ plan: true, entries: false, profile: true }}
        onChange={onChange}
        tier="signed-in"
        planLocked={false}
      />,
    );
    expect(onChange).toHaveBeenCalledWith({ plan: true, entries: true, profile: true });
  });

  it('reports held objects that differ', () => {
    render(<Harness preview={{ ...FULL, entries: { total: 5, added: 1, kept: 4, differs: 2 } }} />);
    expect(screen.getByTestId('snapshot-differs')).toHaveTextContent("2 of these differ; your library's version is kept");
  });

  it('signed in: a skipped new profile leaves the plan without one', () => {
    render(<Harness />);
    fireEvent.click(box(/Performance profile/));
    expect(screen.getByTestId('profile-skipped-note')).toHaveTextContent('the plan has no profile');
  });

  it('signed in: a profile already held is reused', () => {
    render(<Harness preview={{ ...FULL, profile: { ...FULL.profile!, present: true } }} />);
    expect(screen.getByText('Already in your profiles; the plan flies it.')).toBeInTheDocument();
  });

  it('anonymous: a skipped profile keeps the current one', () => {
    render(<Harness tier="anonymous" />);
    expect(screen.getByText('Replaces your current profile')).toBeInTheDocument();
    fireEvent.click(box(/Performance profile/));
    expect(screen.getByTestId('profile-skipped-note')).toHaveTextContent('Your current profile is kept');
  });
});

describe('ImportDialog', () => {
  it('cancelling calls onCancel and never onConfirm', () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    render(
      <ImportDialog open title="Import" confirmLabel="Import" onCancel={onCancel} onConfirm={onConfirm}
        preview={FULL} selection={SELECT_ALL} onChange={() => {}} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('offers Not now as the cancel label when asked', () => {
    render(
      <ImportDialog open title="Import" confirmLabel="Import" cancelLabel="Not now" onCancel={() => {}} onConfirm={() => {}}
        preview={FULL} selection={SELECT_ALL} onChange={() => {}} />,
    );
    expect(screen.getByRole('button', { name: 'Not now' })).toBeInTheDocument();
  });

  it('cannot confirm before there is a preview', () => {
    render(<ImportDialog open title="Import" confirmLabel="Import" onCancel={() => {}} onConfirm={() => {}} />);
    expect(screen.getByRole('button', { name: 'Import' })).toBeDisabled();
  });
});
