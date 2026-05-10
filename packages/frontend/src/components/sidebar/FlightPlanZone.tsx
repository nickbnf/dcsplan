import React, { useState, useMemo, useRef, useEffect } from 'react';
import * as Separator from '@radix-ui/react-separator';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import type { FlightPlan, LegData, WaypointType, Regime, LegSegmentsResult } from '../../types/flightPlan';
import { flightPlanUtils, getEffectiveExitTime } from '../../utils/flightPlanUtils';
import { applyRegimeToWaypoint, clearRegimeBinding } from '../../utils/regimeUtils';
import { formatCoordinate } from '../../utils/coordinateUtils';
import { GenerateDialog } from './GenerateDialog';
import { DeleteWaypointDialog } from './DeleteWaypointDialog';
import { ImportFlightPlanDialog } from './ImportFlightPlanDialog';
import { useFlightPlan } from '../../contexts/FlightPlanContext';
import { useWaypointSelection } from '../../contexts/WaypointSelectionContext';

interface FlightPlanZoneProps {
  flightPlan: FlightPlan;
  onFlightPlanUpdate: (flightPlan: FlightPlan) => void;
  projection?: any;
  navigationMode: string;
}

interface EditableFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  maxLength?: number;
  unit?: string;
  numericOnly?: boolean; // If true, only allows numbers; if false, allows any text
}

const EditableField: React.FC<EditableFieldProps> = ({
  value,
  onChange,
  placeholder = "Click to edit",
  className = "",
  maxLength,
  unit = "",
  numericOnly = true
}) => {
  const [editValue, setEditValue] = useState(() => value.replace(unit, '').trim());
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    if (!isFocused) {
      setEditValue(value.replace(unit, '').trim());
    }
  }, [value, unit, isFocused]);

  const handleSave = () => {
    const newValue = unit ? `${editValue}${unit}` : editValue;
    onChange(newValue);
    setIsFocused(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      (e.target as HTMLInputElement).blur();
    } else if (e.key === 'Escape') {
      setEditValue(value.replace(unit, '').trim());
      (e.target as HTMLInputElement).blur();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value;
    if (numericOnly) {
      if (/^\d*\.?\d*$/.test(inputValue)) {
        if (!maxLength || inputValue.length <= maxLength) {
          setEditValue(inputValue);
        }
      }
    } else {
      if (!maxLength || inputValue.length <= maxLength) {
        setEditValue(inputValue);
      }
    }
  };

  const getInputWidth = () => {
    if (numericOnly) {
      return maxLength === 3 ? 'w-8' : maxLength === 5 ? 'w-12' : 'w-8';
    } else {
      if (maxLength) {
        if (maxLength <= 10) return 'w-24';
        if (maxLength <= 15) return 'w-40';
        if (maxLength <= 20) return 'w-52';
        if (maxLength <= 25) return 'w-64';
        if (maxLength <= 30) return 'w-72';
        return 'w-80';
      }
      return 'w-32';
    }
  };

  const inputWidth = getInputWidth();
  // When not focused, embed the unit in the displayed value (matches original span appearance).
  // When focused, show only the editable part so the unit doesn't interfere with typing.
  const displayValue = isFocused ? editValue : `${editValue}${unit}`;

  return (
    <input
      type="text"
      value={displayValue}
      onChange={handleInputChange}
      onFocus={(e) => {
        const target = e.target;
        setIsFocused(true);
        // Select after React re-renders with the unit-stripped value
        requestAnimationFrame(() => target.select());
      }}
      onBlur={handleSave}
      onKeyDown={handleKeyDown}
      placeholder={placeholder}
      maxLength={maxLength}
      // Compact ch-based width when not focused to match the original span footprint;
      // fixed Tailwind width when focused to give room for editing.
      style={!isFocused ? { width: `calc(${Math.max(displayValue.length + 1, 2)}ch + 0.5rem)` } : undefined}
      className={`bg-transparent outline-none text-sm ${className} ${
        isFocused
          ? `${inputWidth} border-b border-gray-400 focus:border-gray-600 cursor-text`
          : 'cursor-pointer hover:bg-gray-100 px-1 py-0.5 rounded'
      }`}
    />
  );
};

interface TimeEditableFieldProps {
  timeSec: number;
  onChange: (hour: number, minute: number, seconds: number) => void;
  className?: string;
}

const secondsToTimeString = (timeSec: number) => {
  const hour = Math.trunc(timeSec / 3600);
  const minute = Math.trunc((timeSec % 3600) / 60);
  const seconds = timeSec % 60;
  return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:${seconds.toFixed(0).padStart(2, '0')}`;
}

export const TimeEditableField: React.FC<TimeEditableFieldProps> = ({ 
  timeSec, 
  onChange, 
  className = ""
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(() => {
    return secondsToTimeString(timeSec);
  });
  const [prevLength, setPrevLength] = useState(8);

  const handleSave = () => {
    // Try different patterns for partial entry support
    let newHour = 0;
    let newMinute = 0;
    let newSeconds = 0;
    
    // Full format: HH:MM:SS
    const fullMatch = editValue.match(/^(\d{1,2}):(\d{1,2}):(\d{1,2})$/);
    if (fullMatch) {
      newHour = parseInt(fullMatch[1]);
      newMinute = parseInt(fullMatch[2]);
      newSeconds = parseInt(fullMatch[3]);
    }
    // Partial format: HH:MM
    else {
      const partialMatch = editValue.match(/^(\d{1,2}):(\d{1,2})$/);
      if (partialMatch) {
        newHour = parseInt(partialMatch[1]);
        newMinute = parseInt(partialMatch[2]);
        newSeconds = 0;
      }
      // Just digits: HH
      else {
        const digitsOnly = editValue.replace(/[^\d]/g, '');
        if (digitsOnly.length > 0) {
          newHour = parseInt(digitsOnly);
          newMinute = 0;
          newSeconds = 0;
        } else {
          // If format is invalid, restore to original
          setEditValue(secondsToTimeString(timeSec));
          setIsEditing(false);
          return;
        }
      }
    }
    
    // Clamp values to valid ranges
    newHour = Math.min(23, Math.max(0, newHour));
    newMinute = Math.min(59, Math.max(0, newMinute));
    newSeconds = Math.min(59, Math.max(0, newSeconds));
    
    onChange(newHour, newMinute, newSeconds);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditValue(() => {
      return secondsToTimeString(timeSec);
    });
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      handleCancel();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value;
    const isDeleting = inputValue.length < prevLength;
    
    // Allow digits and colons
    if (/^[\d:]*$/.test(inputValue)) {
      // If deleting, allow natural backspace through all characters
      if (isDeleting) {
        setEditValue(inputValue);
        setPrevLength(inputValue.length);
        return;
      }
      
      // If typing, auto-format by inserting colons at appropriate positions
      const digitsOnly = inputValue.replace(/[^\d]/g, '');
      
      // Only format if we have digits and user is adding characters
      if (digitsOnly.length > 0 && inputValue.length >= prevLength) {
        let formatted = '';
        if (digitsOnly.length <= 2) {
          formatted = digitsOnly;
        } else if (digitsOnly.length <= 4) {
          formatted = digitsOnly.substring(0, 2) + ':' + digitsOnly.substring(2);
        } else {
          formatted = digitsOnly.substring(0, 2) + ':' + digitsOnly.substring(2, 4) + ':' + digitsOnly.substring(4, 6);
        }
        if (formatted.length <= 8) {
          setEditValue(formatted);
          setPrevLength(formatted.length);
        }
      } else {
        setEditValue(inputValue);
        setPrevLength(inputValue.length);
      }
    }
  };

  if (isEditing) {
    return (
      <input
        type="text"
        value={editValue}
        onChange={handleInputChange}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        className={`bg-transparent border-b border-gray-400 focus:border-gray-600 outline-none text-sm w-20 ${className}`}
        autoFocus
        placeholder="HH or HH:MM or HH:MM:SS"
      />
    );
  }

  return (
    <span
      onClick={() => {
        const timeStr = secondsToTimeString(timeSec);
        setEditValue(timeStr);
        setPrevLength(timeStr.length);
        setIsEditing(true);
      }}
      className={`cursor-pointer hover:bg-gray-100 px-1 py-0.5 rounded text-sm ${className}`}
    >
      {secondsToTimeString(timeSec)}
    </span>
  );
};

const displaySecondsInMinutes = (totalSeconds: number) => {
  const minutes = Math.trunc(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return minutes+"+"+seconds
}

const WAYPOINT_TYPE_LABELS: Record<WaypointType, string> = {
  normal: 'Normal',
  push: 'PUSH',
  ip: 'IP',
  tgt: 'TGT',
};

const WAYPOINT_TYPES: WaypointType[] = ['normal', 'push', 'ip', 'tgt'];

const WaypointTypeSelector: React.FC<{
  currentType: WaypointType;
  onTypeChange: (type: WaypointType) => void;
}> = ({ currentType, onTypeChange }) => {
  const isNormal = currentType === 'normal';

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          className={`inline-flex items-center cursor-pointer rounded px-1 py-0.5 transition-colors outline-none ${
            isNormal
              ? 'opacity-0 group-hover:opacity-100 hover:bg-gray-100 text-gray-400'
              : 'text-avio-primary font-semibold hover:bg-gray-100'
          }`}
        >
          <span className="text-sm font-aero-label">
            {isNormal ? '' : WAYPOINT_TYPE_LABELS[currentType]}
          </span>
          <span className="text-[10px] ml-0.5 text-gray-400">
            ▼
          </span>
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="bg-white rounded-md p-1 shadow-lg border border-gray-200 min-w-[120px] z-50 animate-in fade-in zoom-in duration-75"
          sideOffset={5}
          align="start"
        >
          {WAYPOINT_TYPES.map((type) => (
            <DropdownMenu.Item
              key={type}
              className={`
                flex items-center px-3 py-2 text-sm font-aero-label outline-none cursor-pointer rounded transition-colors
                ${type === currentType
                  ? 'bg-avio-panel text-avio-primary font-semibold'
                  : 'text-gray-700 hover:bg-gray-100'}
              `}
              onSelect={() => onTypeChange(type)}
            >
              {WAYPOINT_TYPE_LABELS[type]}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
};

const formatHackEta = (hackEtaSec: number): string => {
  const minutes = Math.trunc(hackEtaSec / 60);
  const seconds = hackEtaSec % 60;
  return `+${minutes.toString().padStart(2, '0')}:${seconds.toFixed(0).padStart(2, '0')}`;
};

const WaypointCard: React.FC<{ flightPlan: FlightPlan, legData: LegData | null, index: number, onFlightPlanUpdate: (flightPlan: FlightPlan) => void }> = ({ flightPlan, legData, index, onFlightPlanUpdate }) => {
  const waypoint = flightPlan.points[index];
  const waypointType = waypoint.waypointType || 'normal';
  const { selectedIndex, setSelectedIndex, coordEntry } = useWaypointSelection();
  const isSelected = selectedIndex === index;
  const isEnteringCoords = isSelected && coordEntry !== null;
  const cardRef = useRef<HTMLDivElement>(null);
  const [isEditingComment, setIsEditingComment] = useState(false);
  const [commentDraft, setCommentDraft] = useState('');
  const hasComment = !!(waypoint.comment && waypoint.comment.trim());

  useEffect(() => {
    if (isSelected && cardRef.current) {
      cardRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [isSelected]);

  // Calculate ETA and EFR for this waypoint
  let eta = flightPlan.initTimeSec;
  let efr = flightPlan.initFob;
  let hackEta: number | undefined = undefined;
  if (legData) {
    eta = legData.eta;
    efr = legData.efr;
    hackEta = legData.hackEta;
  }

  const handleDelete = () => {
    const updatedFlightPlan = flightPlanUtils.deleteTurnPoint(flightPlan, index);
    onFlightPlanUpdate(updatedFlightPlan);
  };

  const handleTypeChange = (type: WaypointType) => {
    const updatedFlightPlan = flightPlanUtils.updateTurnPoint(flightPlan, index, { waypointType: type });
    onFlightPlanUpdate(updatedFlightPlan);
  };

  const openCommentEditor = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCommentDraft(waypoint.comment || '');
    setIsEditingComment(true);
  };

  const saveComment = () => {
    const trimmed = commentDraft.trim();
    const updatedFlightPlan = flightPlanUtils.updateTurnPoint(flightPlan, index, { comment: trimmed || undefined });
    onFlightPlanUpdate(updatedFlightPlan);
    setIsEditingComment(false);
  };

  const discardComment = () => {
    setIsEditingComment(false);
  };

  const handleCommentKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveComment();
    } else if (e.key === 'Escape') {
      discardComment();
    }
  };

  return (
    <div
      ref={cardRef}
      onClick={() => setSelectedIndex(index)}
      className={`group bg-white border rounded p-3 cursor-pointer ${isSelected ? 'border-[#FFB300] ring-1 ring-[#FFB300]' : 'border-gray-200'}`}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-aero-label text-gray-900 flex items-center">
          {index + 1}.{' '}
          <WaypointTypeSelector
            currentType={waypointType}
            onTypeChange={handleTypeChange}
          />
          {' '}<EditableField
            value={waypoint.name || `WP${index + 1}`}
            onChange={(value: string) => {
              const updatedFlightPlan = flightPlanUtils.updateTurnPoint(flightPlan, index, { name: value });
              onFlightPlanUpdate(updatedFlightPlan);
            }}
            className="font-aero-label text-gray-900"
            numericOnly={false}
            maxLength={15}
          />
        </span>
        <div className="flex items-center gap-1">
          <div className="flex flex-col items-end text-right">
            {isEnteringCoords ? (
              <span className="text-xs font-aero-mono text-gray-400 opacity-60">
                <span className="text-[#FFB300] opacity-100 not-italic">✎ </span>
                {formatCoordinate(waypoint.lat ?? 0, 'lat')} {formatCoordinate(waypoint.lon ?? 0, 'lon')}
              </span>
            ) : (
              <span className="text-xs font-aero-mono text-gray-500">
                {formatCoordinate(waypoint.lat ?? 0, 'lat')} {formatCoordinate(waypoint.lon ?? 0, 'lon')}
              </span>
            )}
          </div>
          {/* Comment icon: ghost on hover when no comment, always visible+colored when comment exists */}
          <button
            onClick={openCommentEditor}
            title={hasComment ? 'Edit note' : 'Add note'}
            className={`p-1 rounded transition-opacity ${
              hasComment
                ? 'text-avio-primary opacity-100'
                : 'text-gray-400 opacity-0 group-hover:opacity-100'
            } hover:bg-gray-100`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7 8h10M7 12h6m-6 4h4M5 4h14a2 2 0 012 2v10a2 2 0 01-2 2H7l-4 4V6a2 2 0 012-2z" />
            </svg>
          </button>
          <div className="-mr-2">
            <DeleteWaypointDialog
              waypointNumber={index + 1}
              onConfirm={handleDelete}
            />
          </div>
        </div>
      </div>
      {/* Push-specific fields + ETA/EFR rows */}
      {waypointType === 'push' ? (
        <div className="mt-1 grid grid-cols-[auto_auto_auto] gap-x-3 gap-y-1 justify-end items-center">
          <div className="flex items-center space-x-1">
            <span className="font-aero-label text-gray-600 text-xs w-7 text-right">Exit</span>
            <TimeEditableField
              timeSec={getEffectiveExitTime(waypoint.exitTimeSec, eta)}
              onChange={(hour, minute, seconds) => {
                const exitTimeSec = Math.max(hour * 3600 + minute * 60 + seconds, eta);
                const updatedFlightPlan = flightPlanUtils.updateTurnPoint(flightPlan, index, { exitTimeSec });
                onFlightPlanUpdate(updatedFlightPlan);
              }}
              className="font-aero-mono text-gray-900 text-xs"
            />
          </div>
          <label className="flex items-center space-x-1 cursor-pointer col-span-2">
            <span className="font-aero-label text-gray-600 text-xs">HACK</span>
            <input
              type="checkbox"
              checked={waypoint.hack ?? false}
              onChange={(e) => {
                const updatedFlightPlan = flightPlanUtils.updateTurnPoint(flightPlan, index, { hack: e.target.checked });
                onFlightPlanUpdate(updatedFlightPlan);
              }}
              className="h-3.5 w-3.5 rounded border-gray-300 text-avio-primary focus:ring-avio-accent cursor-pointer"
            />
          </label>
          <div className="flex items-center space-x-1">
            <span className="font-aero-label text-gray-600 text-xs w-7 text-right">ETA</span>
            <span className="font-aero-mono text-gray-900 text-xs px-1 py-0.5">
              {secondsToTimeString(eta)}
              {hackEta !== undefined && <span className="text-avio-accent ml-1">{formatHackEta(hackEta)}</span>}
            </span>
          </div>
          <div className="flex items-center space-x-1">
            <span className="font-aero-label text-gray-600 text-xs">EFR</span>
            <span className="font-aero-mono text-gray-900 text-xs">{efr.toFixed(0)}lbs</span>
          </div>
        </div>
      ) : (
        <div className="flex items-center space-x-3 mt-1 justify-end">
          <div className="flex items-center space-x-1">
            <span className="font-aero-label text-gray-600 text-xs">ETA</span>
            <span className="font-aero-mono text-gray-900 text-xs">
              {secondsToTimeString(eta)}
              {hackEta !== undefined && <span className="text-avio-accent ml-1">{formatHackEta(hackEta)}</span>}
            </span>
          </div>
          <div className="flex items-center space-x-1">
            <span className="font-aero-label text-gray-600 text-xs">EFR</span>
            <span className="font-aero-mono text-gray-900 text-xs">{efr.toFixed(0)}lbs</span>
          </div>
        </div>
      )}
      {/* Comment section: inline textarea when editing, truncated preview when set */}
      {isEditingComment ? (
        <textarea
          autoFocus
          value={commentDraft}
          onChange={(e) => setCommentDraft(e.target.value)}
          onBlur={saveComment}
          onKeyDown={handleCommentKeyDown}
          onClick={(e) => e.stopPropagation()}
          maxLength={150}
          rows={3}
          className="mt-2 w-full text-xs font-aero-label text-gray-700 bg-gray-50 border border-gray-300 rounded px-2 py-1 outline-none focus:border-gray-500 resize-none"
          placeholder="Add a note for the kneeboard…"
        />
      ) : hasComment ? (
        <p
          onClick={openCommentEditor}
          className="mt-1 text-xs font-aero-label text-gray-500 truncate cursor-pointer hover:text-gray-700"
          title={waypoint.comment}
        >
          {waypoint.comment}
        </p>
      ) : null}
    </div>
  );
}

// Tooltip wrapper: shows tooltip on hover using CSS
const Tooltip: React.FC<{ tip: React.ReactNode; children: React.ReactNode }> = ({ tip, children }) => (
  <span className="relative group/tip">
    {children}
    <span className="pointer-events-none absolute bottom-full left-0 mb-1 z-50 hidden group-hover/tip:block w-max bg-gray-100 text-gray-800 border border-gray-500 text-xs rounded p-2 shadow-lg font-aero-mono whitespace-pre">
      {tip}
    </span>
  </span>
);

function formatMinutes(min: number): string {
  const m = Math.floor(min);
  const s = Math.round((min - m) * 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function segmentTooltipContent(seg: LegSegmentsResult, prevAlt: number, legAlt: number, distance: number): React.ReactNode {
  const altDelta = legAlt - prevAlt;
  if (seg.kind === 'level') {
    return `${altDelta >= 0 ? '+' : ''}${altDelta.toFixed(0)}ft over ${distance.toFixed(1)}nm`;
  }
  if (seg.kind === 'warning') {
    return `Transition too long\nNeeds ${seg.transitionDistance.toFixed(1)}nm, only ${distance.toFixed(1)}nm available`;
  }
  const sections: React.ReactNode[] = [];
  if (seg.takeoff) {
    const to = seg.takeoff;
    sections.push(
      <span key="to"><span>Take-off:</span>{`\n  ${formatMinutes(to.time)} · ${to.distance.toFixed(1)}nm · ${to.fuel.toFixed(0)}lb\n`}</span>
    );
  }
  const t = seg.transition;
  if (t.time > 0) {
    const label = t.phase === 'climb' ? 'Climb:' : 'Descent:';
    sections.push(
      <span key="tr"><span>{label}</span>{`\n  ${formatMinutes(t.time)} · ${t.distance.toFixed(1)}nm · ${t.fuel.toFixed(0)}lb\n`}</span>
    );
  }
  const c = seg.cruise;
  sections.push(
    <span key="cr"><span>Cruise:</span>{`\n  ${formatMinutes(c.time)} · ${c.distance.toFixed(1)}nm · ${c.fuel.toFixed(0)}lb`}</span>
  );
  return <>{sections}</>;
}

export const RouteCard: React.FC<{
  flightPlan: FlightPlan,
  legData: LegData,
  index: number,
  onFlightPlanUpdate: (flightPlan: FlightPlan) => void,
}> = ({ flightPlan, legData, index, onFlightPlanUpdate }) => {
  const [showRegimePicker, setShowRegimePicker] = useState(false);
  const regimePickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showRegimePicker) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (regimePickerRef.current && !regimePickerRef.current.contains(e.target as Node)) {
        setShowRegimePicker(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showRegimePicker]);

  const destWpt = flightPlan.points[index + 1];
  const prevWpt = flightPlan.points[index];
  const altDelta = destWpt.alt - prevWpt.alt;
  const boundRegime = destWpt.regimeId ? flightPlan.aircraft.regimes.find(r => r.id === destWpt.regimeId) : undefined;
  const seg = legData.segmentsResult;
  const isWarning = seg?.kind === 'warning';

  const handleInsertClick = () => {
    onFlightPlanUpdate(flightPlanUtils.insertTurnPointAtMidpoint(flightPlan, index));
  };

  const handleSelectRegime = (regime: Regime | null) => {
    setShowRegimePicker(false);
    const newPoints = [...flightPlan.points];
    if (regime) {
      newPoints[index + 1] = applyRegimeToWaypoint(destWpt, regime);
    } else {
      newPoints[index + 1] = clearRegimeBinding(destWpt);
    }
    onFlightPlanUpdate({ ...flightPlan, points: newPoints });
  };

  const altGlyph = altDelta > 0 ? '↗' : altDelta < 0 ? '↘' : null;

  return (
    <div className="group ml-4 bg-gray-100 border border-gray-200 rounded p-3">
      <div className="space-y-2 text-xs">
        {/* Line 1: CRS, DIST, ETE + regime picker */}
        <div className="flex justify-between items-center">
          <div className="flex items-center space-x-1">
            <span className="font-aero-label text-gray-600 text-xs">CRS</span>
            <span className="font-aero-mono text-gray-900 text-xs">{legData.course.toFixed(0)}°</span>
          </div>
          <div className="flex items-center space-x-1">
            <span className="font-aero-label text-gray-600 text-xs">DIST</span>
            <span className="font-aero-mono text-gray-900 text-xs">{legData.distance.toFixed(1)}nm</span>
          </div>
          <div className="flex items-center space-x-1">
            <span className="font-aero-label text-gray-600 text-xs">ETE</span>
            <span className="font-aero-mono text-gray-900 text-xs">{displaySecondsInMinutes(legData.ete)}</span>
          </div>
          {flightPlan.aircraft.regimes.length > 0 && (
            <div className="relative max-w-[9rem]" ref={regimePickerRef}>
              <button
                onClick={() => setShowRegimePicker(v => !v)}
                className="font-aero-label text-xs px-2 py-0.5 border border-gray-300 rounded bg-white hover:bg-gray-50 text-gray-700 w-full truncate block"
                title={boundRegime ? boundRegime.name : 'Manual'}
              >
                {boundRegime ? boundRegime.name : '—'}
              </button>
              {showRegimePicker && (
                <div className="absolute right-0 top-full mt-1 z-40 bg-white border border-gray-300 rounded shadow-lg min-w-max">
                  {flightPlan.aircraft.regimes.map(r => (
                    <button key={r.id} onClick={() => handleSelectRegime(r)}
                      className="block w-full text-left px-3 py-1.5 text-xs font-aero-label hover:bg-gray-100">
                      {r.name}
                    </button>
                  ))}
                  <button onClick={() => handleSelectRegime(null)}
                    className="block w-full text-left px-3 py-1.5 text-xs font-aero-label text-gray-500 hover:bg-gray-100 border-t border-gray-200">
                    — Manual —
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Line 2: Alt (with glyph), TAS, FF, WND */}
        <div className="flex justify-between items-center">
          <div className="flex items-center space-x-1">
            <span className="font-aero-label text-gray-600 text-xs">Alt</span>
            {altGlyph && seg && (
              <Tooltip tip={segmentTooltipContent(seg, prevWpt.alt, destWpt.alt, legData.distance)}>
                <span className={`text-xs cursor-default ${isWarning ? 'text-amber-600' : 'text-gray-500'}`}>{altGlyph}</span>
              </Tooltip>
            )}
            <EditableField
              value={`${destWpt.alt}'`}
              onChange={(value: string) => {
                const m = value.match(/\d+/);
                if (m && m[0]) {
                  // Alt edit does NOT clear regime binding
                  onFlightPlanUpdate(flightPlanUtils.updateTurnPoint(flightPlan, index + 1, { alt: parseInt(m[0]) }));
                }
              }}
              className="font-aero-mono text-gray-900 text-xs"
              maxLength={5}
              unit="'"
            />
          </div>
          <div className="flex items-center space-x-1">
            <span className="font-aero-label text-gray-600 text-xs">TAS</span>
            <EditableField
              value={`${destWpt.tas}K`}
              onChange={(value: string) => {
                const m = value.match(/\d+/);
                if (m && m[0]) {
                  const newTas = parseInt(m[0]);
                  // TAS edit clears regime binding if value actually changed
                  const updated = newTas !== destWpt.tas
                    ? clearRegimeBinding({ ...destWpt, tas: newTas })
                    : { ...destWpt, tas: newTas };
                  const newPoints = [...flightPlan.points];
                  newPoints[index + 1] = updated;
                  onFlightPlanUpdate({ ...flightPlan, points: newPoints });
                }
              }}
              className="font-aero-mono text-gray-900 text-xs"
              maxLength={3}
              unit="K"
            />
          </div>
          <div className="flex items-center space-x-1">
            <span className="font-aero-label text-gray-600 text-xs">FF</span>
            <EditableField
              value={`${destWpt.fuelFlow}pph`}
              onChange={(value: string) => {
                const m = value.match(/\d+/);
                if (m && m[0]) {
                  const newFf = parseInt(m[0]);
                  // FF edit clears regime binding if value actually changed
                  const updated = newFf !== destWpt.fuelFlow
                    ? clearRegimeBinding({ ...destWpt, fuelFlow: newFf })
                    : { ...destWpt, fuelFlow: newFf };
                  const newPoints = [...flightPlan.points];
                  newPoints[index + 1] = updated;
                  onFlightPlanUpdate({ ...flightPlan, points: newPoints });
                }
              }}
              className="font-aero-mono text-gray-900 text-xs"
              maxLength={5}
              unit="pph"
            />
          </div>
          <div className="flex items-center space-x-1">
            <span className="font-aero-label text-gray-600 text-xs">WND</span>
            <span>
              <EditableField
                value={`${destWpt.windDir}°`}
                onChange={(value: string) => {
                  const m = value.match(/\d+/);
                  if (m && m[0]) {
                    // Wind edit does NOT clear regime binding
                    onFlightPlanUpdate(flightPlanUtils.updateTurnPoint(flightPlan, index + 1, { windDir: parseInt(m[0]) }));
                  }
                }}
                className="font-aero-mono text-gray-900 text-xs"
                maxLength={3}
                unit="°"
              />
              /
              <EditableField
                value={`${destWpt.windSpeed}K`}
                onChange={(value: string) => {
                  const m = value.match(/\d+/);
                  if (m && m[0]) {
                    // Wind edit does NOT clear regime binding
                    onFlightPlanUpdate(flightPlanUtils.updateTurnPoint(flightPlan, index + 1, { windSpeed: parseInt(m[0]) }));
                  }
                }}
                className="font-aero-mono text-gray-900 text-xs"
                maxLength={2}
                unit="K"
              />
            </span>
          </div>
        </div>

        {/* Line 3: HDG, Leg Fuel, Insert button + warning indicator */}
        <div className="flex justify-between items-center">
          <div className="flex items-center space-x-1">
            <span className="font-aero-label text-gray-600 text-xs">HDG</span>
            <span className="font-aero-mono text-gray-900 text-xs">{legData.heading.toFixed(0)}°</span>
          </div>
          <div className="flex items-center space-x-1">
            <span className="font-aero-label text-gray-600 text-xs">Leg Fuel</span>
            <span className="font-aero-mono text-gray-900 text-xs">{legData.legFuel.toFixed(0)}lbs</span>
          </div>
          <div className="flex items-center gap-1">
            {isWarning && seg && (
              <Tooltip tip={segmentTooltipContent(seg, prevWpt.alt, destWpt.alt, legData.distance)}>
                <span className="text-amber-600 border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-aero-label rounded cursor-default select-none">
                  ⚠ Fix
                </span>
              </Tooltip>
            )}
            <button
              onClick={handleInsertClick}
              className="opacity-40 group-hover:opacity-100 transition-opacity px-2 py-1 text-xs font-aero-label rounded border border-gray-300 bg-white hover:bg-gray-50 text-gray-700"
              title="Insert waypoint at midpoint"
            >
              + Insert
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

export const FlightPlanZone: React.FC<FlightPlanZoneProps> = ({
  flightPlan,
  onFlightPlanUpdate,
  projection,
  navigationMode
}) => {
  const { requestFitToFlightPlan } = useFlightPlan();
  const fligthPlanZoneContent = useMemo(() => {
    const legData = projection
      ? flightPlanUtils.calculateAllLegData(flightPlan, projection, navigationMode)
      : [];
    const planName = flightPlan.name

    return (
    <div className="flex-1 p-4 bg-gray-50 flex flex-col">
      {/* Scrollable content area */}
      <div className="flex-1 overflow-y-auto mb-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-aero-label text-gray-700 uppercase">Flight Plan</h3>
          <div className="flex items-center gap-3">
            <button
              onClick={() => flightPlanUtils.downloadFlightPlan(flightPlan)}
              className="text-xs font-aero-label text-gray-400 hover:text-gray-600 transition-colors"
            >
              ⬇ Export
            </button>
            <ImportFlightPlanDialog
              onImport={(importedFlightPlan) => {
                onFlightPlanUpdate(importedFlightPlan);
                requestFitToFlightPlan();
              }}
            />
          </div>
        </div>
        
        {/* Flight Plan Header */}
        <div className="space-y-3 mb-2">
          <div className="flex items-center space-x-1">
            <span className="text-xs font-aero-label text-gray-600">Name:</span>
            <EditableField
              value={planName}
              onChange={(value: string) => {
                const updatedFlightPlan = { ...flightPlan, name: value };
                onFlightPlanUpdate(updatedFlightPlan);
              }}
              className="text-gray-900 font-aero-label"
              maxLength={25}
              numericOnly={false}
            />
          </div>
        </div>
        <div className="space-y-3 mb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-1">
              <span className="text-xs font-aero-label text-gray-600">Initial time:</span>
              <TimeEditableField
                timeSec={flightPlan.initTimeSec}
                onChange={(hour, minute, seconds) => {
                  const timeSec = hour * 3600 + minute * 60 + seconds;
                  const updatedFlightPlan = { ...flightPlan, initTimeSec: timeSec };
                  onFlightPlanUpdate(updatedFlightPlan);
                }}
                className="text-gray-900 font-aero-label"
              />
            </div>
            <div className="flex items-center space-x-1">
              <span className="text-xs font-aero-label text-gray-600">Initial FOB:</span>
              <EditableField
                value={`${flightPlan.initFob}`}
                onChange={(value: string) => {
                  const fob = value.match(/\d+/);
                  if (fob && fob[0]) {
                    const updatedFlightPlan = { ...flightPlan, initFob: parseInt(fob[0]) };
                    onFlightPlanUpdate(updatedFlightPlan);
                  }
                }}
                className="text-gray-900 font-aero-label"
                maxLength={5}
              />
            </div>
          </div>
        </div>

        <Separator.Root className="my-4 bg-gray-300 h-px" />

        {/* Flight Plan Entries */}
        <div className="space-y-2">
          {flightPlan.points.length === 0 ? (
            <div className="text-sm text-gray-500 italic">No waypoints added yet</div>
          ) : (
            flightPlan.points.map((_waypoint, index) => (
              <React.Fragment key={index}>
                {/* Waypoint Card */}
                <WaypointCard
                  key={index}
                  flightPlan={flightPlan} 
                  legData={index > 0 && legData[index-1] ? legData[index-1] : null}
                  index={index} 
                  onFlightPlanUpdate={onFlightPlanUpdate} 
                />

                {/* Route Card (indented) */}
                {index < flightPlan.points.length - 1 && legData[index] && (
                  <RouteCard
                    flightPlan={flightPlan}
                    legData={legData[index]}
                    index={index}
                    onFlightPlanUpdate={onFlightPlanUpdate}
                  />
                )}
              </React.Fragment>
            ))
          )}
        </div>
      </div>
      
      {/* Generate button at the bottom */}
      <GenerateDialog flightPlan={flightPlan} />
    </div>
  );
}, [flightPlan, onFlightPlanUpdate, projection, navigationMode, requestFitToFlightPlan]);

return fligthPlanZoneContent
};
