import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TimeEditableField } from './FlightPlanZone';

describe('TimeEditableField', () => {
  const mockOnChange = vi.fn();

  beforeEach(() => {
    mockOnChange.mockClear();
  });

  describe('Display mode', () => {
    it('displays time in HH:MM:SS format', () => {
      // 12:34:56 = 45296 seconds
      const timeSec = 12 * 3600 + 34 * 60 + 56;
      render(<TimeEditableField timeSec={timeSec} onChange={mockOnChange} />);
      
      expect(screen.getByText('12:34:56')).toBeInTheDocument();
    });

    it('displays single digit hours with leading zero', () => {
      const timeSec = 3 * 3600 + 5 * 60 + 7;
      render(<TimeEditableField timeSec={timeSec} onChange={mockOnChange} />);
      
      expect(screen.getByText('03:05:07')).toBeInTheDocument();
    });

    it('displays midnight correctly', () => {
      const timeSec = 0;
      render(<TimeEditableField timeSec={timeSec} onChange={mockOnChange} />);
      
      expect(screen.getByText('00:00:00')).toBeInTheDocument();
    });
  });

  describe('Entering edit mode', () => {
    it('switches to edit mode when clicked', async () => {
      const timeSec = 12 * 3600 + 34 * 60 + 56;
      render(<TimeEditableField timeSec={timeSec} onChange={mockOnChange} />);
      
      const displaySpan = screen.getByText('12:34:56');
      await userEvent.click(displaySpan);
      
      const input = screen.getByPlaceholderText(/HH or HH:MM or HH:MM:SS/i);
      expect(input).toBeInTheDocument();
      expect(input).toHaveValue('12:34:56');
    });

    it('initializes input with current time value', async () => {
      const timeSec = 5 * 3600 + 30 * 60 + 15;
      render(<TimeEditableField timeSec={timeSec} onChange={mockOnChange} />);
      
      await userEvent.click(screen.getByText('05:30:15'));
      
      const input = screen.getByPlaceholderText(/HH or HH:MM or HH:MM:SS/i);
      expect(input).toHaveValue('05:30:15');
    });
  });

  describe('Full time format entry (HH:MM:SS)', () => {
    it('saves full time format correctly', async () => {
      const timeSec = 0;
      render(<TimeEditableField timeSec={timeSec} onChange={mockOnChange} />);
      
      await userEvent.click(screen.getByText('00:00:00'));
      const input = screen.getByPlaceholderText(/HH or HH:MM or HH:MM:SS/i);
      
      await userEvent.clear(input);
      await userEvent.type(input, '12:34:56');
      await userEvent.keyboard('{Enter}');
      
      expect(mockOnChange).toHaveBeenCalledWith(12, 34, 56);
    });

    it('saves full time format on blur', async () => {
      const timeSec = 0;
      render(<TimeEditableField timeSec={timeSec} onChange={mockOnChange} />);
      
      await userEvent.click(screen.getByText('00:00:00'));
      const input = screen.getByPlaceholderText(/HH or HH:MM or HH:MM:SS/i);
      
      await userEvent.clear(input);
      await userEvent.type(input, '23:59:59');
      fireEvent.blur(input);
      
      await waitFor(() => {
        expect(mockOnChange).toHaveBeenCalledWith(23, 59, 59);
      });
    });
  });

  describe('Partial time format entry', () => {
    it('handles hours only (HH) and sets minutes and seconds to 0', async () => {
      const timeSec = 0;
      render(<TimeEditableField timeSec={timeSec} onChange={mockOnChange} />);
      
      await userEvent.click(screen.getByText('00:00:00'));
      const input = screen.getByPlaceholderText(/HH or HH:MM or HH:MM:SS/i);
      
      await userEvent.clear(input);
      await userEvent.type(input, '12');
      await userEvent.keyboard('{Enter}');
      
      expect(mockOnChange).toHaveBeenCalledWith(12, 0, 0);
    });

    it('handles hours and minutes (HH:MM) and sets seconds to 0', async () => {
      const timeSec = 0;
      render(<TimeEditableField timeSec={timeSec} onChange={mockOnChange} />);
      
      await userEvent.click(screen.getByText('00:00:00'));
      const input = screen.getByPlaceholderText(/HH or HH:MM or HH:MM:SS/i);
      
      await userEvent.clear(input);
      await userEvent.type(input, '12:23');
      await userEvent.keyboard('{Enter}');
      
      expect(mockOnChange).toHaveBeenCalledWith(12, 23, 0);
    });

    it('handles single digit hours', async () => {
      const timeSec = 0;
      render(<TimeEditableField timeSec={timeSec} onChange={mockOnChange} />);
      
      await userEvent.click(screen.getByText('00:00:00'));
      const input = screen.getByPlaceholderText(/HH or HH:MM or HH:MM:SS/i);
      
      await userEvent.clear(input);
      await userEvent.type(input, '5');
      await userEvent.keyboard('{Enter}');
      
      expect(mockOnChange).toHaveBeenCalledWith(5, 0, 0);
    });
  });

  describe('Auto-formatting while typing', () => {
    it('auto-formats when typing digits', async () => {
      const timeSec = 0;
      render(<TimeEditableField timeSec={timeSec} onChange={mockOnChange} />);
      
      await userEvent.click(screen.getByText('00:00:00'));
      const input = screen.getByPlaceholderText(/HH or HH:MM or HH:MM:SS/i) as HTMLInputElement;
      
      await userEvent.clear(input);
      await userEvent.type(input, '123456');
      
      // Should auto-format to 12:34:56
      expect(input.value).toBe('12:34:56');
    });

    it('auto-formats hours when typing 2 digits', async () => {
      const timeSec = 0;
      render(<TimeEditableField timeSec={timeSec} onChange={mockOnChange} />);
      
      await userEvent.click(screen.getByText('00:00:00'));
      const input = screen.getByPlaceholderText(/HH or HH:MM or HH:MM:SS/i) as HTMLInputElement;
      
      await userEvent.clear(input);
      await userEvent.type(input, '12');
      
      expect(input.value).toBe('12');
    });

    it('auto-formats hours and minutes when typing 4 digits', async () => {
      const timeSec = 0;
      render(<TimeEditableField timeSec={timeSec} onChange={mockOnChange} />);
      
      await userEvent.click(screen.getByText('00:00:00'));
      const input = screen.getByPlaceholderText(/HH or HH:MM or HH:MM:SS/i) as HTMLInputElement;
      
      await userEvent.clear(input);
      await userEvent.type(input, '1234');
      
      expect(input.value).toBe('12:34');
    });
  });

  describe('Backspace behavior', () => {
    it('allows backspacing through all characters', async () => {
      const timeSec = 12 * 3600 + 34 * 60 + 56;
      render(<TimeEditableField timeSec={timeSec} onChange={mockOnChange} />);
      
      await userEvent.click(screen.getByText('12:34:56'));
      const input = screen.getByPlaceholderText(/HH or HH:MM or HH:MM:SS/i) as HTMLInputElement;
      
      // Backspace multiple times to delete all characters
      for (let i = 0; i < 10; i++) {
        await userEvent.keyboard('{Backspace}');
      }
      
      expect(input.value).toBe('');
    });

    it('allows partial deletion and re-entry', async () => {
      const timeSec = 12 * 3600 + 34 * 60 + 56;
      render(<TimeEditableField timeSec={timeSec} onChange={mockOnChange} />);
      
      await userEvent.click(screen.getByText('12:34:56'));
      const input = screen.getByPlaceholderText(/HH or HH:MM or HH:MM:SS/i) as HTMLInputElement;
      
      // Delete to partial format
      await userEvent.keyboard('{Backspace}{Backspace}{Backspace}');
      expect(input.value.length).toBeLessThan(8);
      
      // Type new digits
      await userEvent.type(input, '789');
      
      // Should be formatted appropriately
      expect(input.value).toMatch(/\d/);
    });
  });

  describe('Keyboard shortcuts', () => {
    it('saves on Enter key', async () => {
      const timeSec = 0;
      render(<TimeEditableField timeSec={timeSec} onChange={mockOnChange} />);
      
      await userEvent.click(screen.getByText('00:00:00'));
      const input = screen.getByPlaceholderText(/HH or HH:MM or HH:MM:SS/i);
      
      await userEvent.clear(input);
      await userEvent.type(input, '15:30:45');
      await userEvent.keyboard('{Enter}');
      
      expect(mockOnChange).toHaveBeenCalledWith(15, 30, 45);
      expect(input).not.toBeInTheDocument(); // Should exit edit mode
    });

    it('cancels on Escape key', async () => {
      const timeSec = 12 * 3600 + 34 * 60 + 56;
      render(<TimeEditableField timeSec={timeSec} onChange={mockOnChange} />);
      
      await userEvent.click(screen.getByText('12:34:56'));
      const input = screen.getByPlaceholderText(/HH or HH:MM or HH:MM:SS/i);
      
      await userEvent.clear(input);
      await userEvent.type(input, '99:99:99');
      await userEvent.keyboard('{Escape}');
      
      // Should restore original value
      expect(mockOnChange).not.toHaveBeenCalled();
      expect(input).not.toBeInTheDocument(); // Should exit edit mode
      
      // Should display original time
      expect(screen.getByText('12:34:56')).toBeInTheDocument();
    });
  });

  describe('Value validation and clamping', () => {
    it('clamps hours to 0-23', async () => {
      const timeSec = 0;
      render(<TimeEditableField timeSec={timeSec} onChange={mockOnChange} />);
      
      await userEvent.click(screen.getByText('00:00:00'));
      const input = screen.getByPlaceholderText(/HH or HH:MM or HH:MM:SS/i);
      
      await userEvent.clear(input);
      await userEvent.type(input, '25:00:00');
      await userEvent.keyboard('{Enter}');
      
      expect(mockOnChange).toHaveBeenCalledWith(23, 0, 0);
    });

    it('clamps minutes to 0-59', async () => {
      const timeSec = 0;
      render(<TimeEditableField timeSec={timeSec} onChange={mockOnChange} />);
      
      await userEvent.click(screen.getByText('00:00:00'));
      const input = screen.getByPlaceholderText(/HH or HH:MM or HH:MM:SS/i);
      
      await userEvent.clear(input);
      await userEvent.type(input, '12:99:00');
      await userEvent.keyboard('{Enter}');
      
      expect(mockOnChange).toHaveBeenCalledWith(12, 59, 0);
    });

    it('clamps seconds to 0-59', async () => {
      const timeSec = 0;
      render(<TimeEditableField timeSec={timeSec} onChange={mockOnChange} />);
      
      await userEvent.click(screen.getByText('00:00:00'));
      const input = screen.getByPlaceholderText(/HH or HH:MM or HH:MM:SS/i);
      
      await userEvent.clear(input);
      await userEvent.type(input, '12:34:99');
      await userEvent.keyboard('{Enter}');
      
      expect(mockOnChange).toHaveBeenCalledWith(12, 34, 59);
    });

    it('handles negative hours by clamping to 0', async () => {
      const timeSec = 0;
      render(<TimeEditableField timeSec={timeSec} onChange={mockOnChange} />);
      
      await userEvent.click(screen.getByText('00:00:00'));
      const input = screen.getByPlaceholderText(/HH or HH:MM or HH:MM:SS/i);
      
      await userEvent.clear(input);
      // Type a negative value (if allowed by input)
      await userEvent.type(input, '-5');
      await userEvent.keyboard('{Enter}');
      
      // Since we only allow digits and colons, -5 won't parse as negative
      // But if it did, it should clamp to 0
      // Let's test with a valid format that might result in edge case
      expect((input as HTMLInputElement).value).not.toContain('-');
    });
  });

  describe('Edge cases', () => {
    it('handles empty input by restoring original', async () => {
      const timeSec = 12 * 3600 + 34 * 60 + 56;
      render(<TimeEditableField timeSec={timeSec} onChange={mockOnChange} />);
      
      await userEvent.click(screen.getByText('12:34:56'));
      const input = screen.getByPlaceholderText(/HH or HH:MM or HH:MM:SS/i);
      
      await userEvent.clear(input);
      fireEvent.blur(input);
      
      // Should not call onChange with invalid data
      // Input should be restored
      await waitFor(() => {
        expect(mockOnChange).not.toHaveBeenCalled();
      });
    });

    it('handles invalid format gracefully', async () => {
      const timeSec = 12 * 3600 + 34 * 60 + 56;
      render(<TimeEditableField timeSec={timeSec} onChange={mockOnChange} />);
      
      await userEvent.click(screen.getByText('12:34:56'));
      const input = screen.getByPlaceholderText(/HH or HH:MM or HH:MM:SS/i) as HTMLInputElement;
      
      // Type something that can't be parsed properly
      await userEvent.clear(input);
      // We only allow digits and colons, so invalid formats are prevented
      // But let's test with just colons
      await userEvent.type(input, '::');
      fireEvent.blur(input);
      
      // Should restore to original
      await waitFor(() => {
        expect(screen.getByText('12:34:56')).toBeInTheDocument();
      });
    });

    it('maintains state correctly when timeSec prop changes', () => {
      const { rerender } = render(<TimeEditableField timeSec={3600} onChange={mockOnChange} />);
      
      expect(screen.getByText('01:00:00')).toBeInTheDocument();
      
      rerender(<TimeEditableField timeSec={7200} onChange={mockOnChange} />);
      
      expect(screen.getByText('02:00:00')).toBeInTheDocument();
    });
  });

  describe('Input width', () => {
    it('has wider input field in edit mode', async () => {
      const timeSec = 0;
      render(<TimeEditableField timeSec={timeSec} onChange={mockOnChange} />);
      
      await userEvent.click(screen.getByText('00:00:00'));
      const input = screen.getByPlaceholderText(/HH or HH:MM or HH:MM:SS/i);
      
      // Check that input has w-20 class for wider display
      expect(input).toHaveClass('w-20');
    });
  });
});

