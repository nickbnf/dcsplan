/**
 * The import chooser (capability: plan-import; add-local-data-import D2): one
 * checkbox per part of the source, all ticked by default, with what each would
 * add and what leaving it out means. Presentational only — the dialog hosting
 * it reads the source and runs the import.
 */
import React, { useEffect } from 'react';
import { profileLabel } from '../../types/flightPlan';
import type { ImportPreview, ImportSelection } from '../../import/types';

export interface ImportChooserProps {
  preview: ImportPreview;
  selection: ImportSelection;
  onChange: (selection: ImportSelection) => void;
  tier: 'anonymous' | 'signed-in';
  /** A file's plan is always imported; local data's plan can be left out. */
  planLocked: boolean;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

const Item: React.FC<{
  label: string;
  checked: boolean;
  disabled?: boolean;
  onToggle: (checked: boolean) => void;
  children?: React.ReactNode;
}> = ({ label, checked, disabled, onToggle, children }) => (
  <div className="p-2 border border-gray-200 rounded">
    <label className="flex items-center gap-2 text-sm font-medium text-gray-800">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={e => onToggle(e.target.checked)}
      />
      {label}
    </label>
    {children && <div className="ml-6 mt-1 space-y-0.5 text-xs text-gray-600">{children}</div>}
  </div>
);

export const ImportChooser: React.FC<ImportChooserProps> = ({ preview, selection, onChange, tier, planLocked }) => {
  const set = (patch: Partial<ImportSelection>) => onChange({ ...selection, ...patch });
  const { plan, entries, profile } = preview;

  // Every object is already held: there is nothing to choose. The row stays
  // selected, so local duplicates still leave the device (plan-import,
  // *Deselecting an item only skips what the destination lacks*).
  const allHeld = entries !== null && entries.added === 0;
  useEffect(() => {
    if (allHeld && !selection.entries) onChange({ ...selection, entries: true });
  }, [allHeld, selection, onChange]);

  return (
    <div className="space-y-2" data-testid="import-chooser">
      {plan && (
        <Item
          label={`Flight plan “${plan.name || 'Untitled'}”`}
          checked={planLocked || selection.plan}
          disabled={planLocked}
          onToggle={checked => set({ plan: checked })}
        >
          <div>{plan.theatre} · {plural(plan.waypoints, 'waypoint', 'waypoints')}</div>
        </Item>
      )}

      {entries && (
        <Item
          label={allHeld ? 'Library objects' : `Library objects (${entries.total})`}
          checked={allHeld || selection.entries}
          disabled={allHeld}
          onToggle={checked => set({ entries: checked })}
        >
          {allHeld ? (
            <div>
              {plural(entries.total, 'object', 'objects')}, all already in your {tier === 'signed-in' ? 'account' : 'library'}
            </div>
          ) : (
            <>
              <div className="text-green-700">{entries.added} new</div>
              {entries.kept > 0 && <div>{entries.kept} already in your library</div>}
            </>
          )}
          {entries.differs > 0 && (
            <div className="text-amber-700" data-testid="snapshot-differs">
              {entries.differs} of these {entries.differs === 1 ? 'differs' : 'differ'}; your library's version is kept
            </div>
          )}
          {!selection.entries && entries.added > 0 && (
            <div className="text-amber-700" data-testid="entries-skipped-note">
              {plural(entries.added, 'new object is', 'new objects are')} not added; the plan shows {entries.added === 1 ? 'it' : 'them'} as missing.
            </div>
          )}
        </Item>
      )}

      {profile && (
        <Item
          label={`Performance profile “${profileLabel(profile.aircraft)}”`}
          checked={selection.profile}
          onToggle={checked => set({ profile: checked })}
        >
          {profile.present ? (
            <div>Already in your profiles; the plan flies it.</div>
          ) : tier === 'signed-in' ? (
            selection.profile
              ? <div className="text-green-700">New to your profiles</div>
              : <div className="text-amber-700" data-testid="profile-skipped-note">Not added; the plan has no profile and its legs are Manual.</div>
          ) : (
            selection.profile
              ? <div>Replaces your current profile</div>
              : <div data-testid="profile-skipped-note">Your current profile is kept; the plan flies it.</div>
          )}
        </Item>
      )}
    </div>
  );
};

export default ImportChooser;
