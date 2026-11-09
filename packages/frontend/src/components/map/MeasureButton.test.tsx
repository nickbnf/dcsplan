import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MeasureButton } from './MeasureButton';

describe('MeasureButton', () => {
  it('calls the toggle callback when clicked', () => {
    const onToggle = vi.fn();
    render(<MeasureButton active={false} onToggle={onToggle} />);
    fireEvent.click(screen.getByRole('button', { name: 'Measure bearing / distance' }));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('reflects the tool state through aria-pressed', () => {
    const { rerender } = render(<MeasureButton active={false} onToggle={vi.fn()} />);
    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'false');
    rerender(<MeasureButton active={true} onToggle={vi.fn()} />);
    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'true');
  });

  it('advertises the M shortcut', () => {
    render(<MeasureButton active={false} onToggle={vi.fn()} />);
    expect(screen.getByRole('button')).toHaveAttribute('title', 'Measure bearing / distance (M)');
  });
});
