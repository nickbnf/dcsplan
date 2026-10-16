import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const navigate = vi.fn();
vi.mock('react-router-dom', async (orig) => {
  const mod = await (orig() as Promise<any>);
  return { ...mod, useNavigate: () => navigate };
});

vi.mock('../hooks/useTheatres', () => ({
  useTheatres: () => ({
    theatres: [{ id: 'caucasus', name: 'Caucasus' }, { id: 'nevada', name: 'Nevada' }],
    isLoading: false,
    error: null,
  }),
}));

const sel: any = {};
vi.mock('../contexts/PlanSelectionContext', () => ({
  usePlanSelection: () => sel,
}));

import PlansHomePage from './PlansHomePage';

const plan = (id: string, name: string, theatre = 'caucasus') => ({
  id, name, theatre, updatedAt: new Date().toISOString(), lastEditor: null,
});

beforeEach(() => {
  navigate.mockClear();
  Object.assign(sel, {
    plans: [plan('p1', 'Ingress Alpha'), plan('p2', 'Strike Batumi', 'nevada')],
    selectPlan: vi.fn(),
    newDraft: vi.fn(),
    renamePlan: vi.fn(),
  });
});

describe('PlansHomePage (9.1)', () => {
  it('lists the space plans with name and theatre', () => {
    render(<PlansHomePage />);
    expect(screen.getByText('Ingress Alpha')).toBeInTheDocument();
    expect(screen.getByText('Strike Batumi')).toBeInTheDocument();
    expect(screen.getByText(/Nevada/)).toBeInTheDocument();
  });

  it('selecting a plan makes it active and opens NAV', () => {
    render(<PlansHomePage />);
    fireEvent.click(screen.getByText('Ingress Alpha'));
    expect(sel.selectPlan).toHaveBeenCalledWith('p1');
    expect(navigate).toHaveBeenCalledWith('/');
  });

  it('creating a plan makes a draft and opens NAV', () => {
    render(<PlansHomePage />);
    fireEvent.click(screen.getByRole('button', { name: /new plan/i }));
    const name = screen.getByPlaceholderText('Flight plan name');
    fireEvent.change(name, { target: { value: 'Fresh Plan' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(sel.newDraft).toHaveBeenCalledWith('caucasus', 'Fresh Plan');
    expect(navigate).toHaveBeenCalledWith('/');
  });

  it('blocks a New-plan name that collides with an existing plan (A1)', () => {
    render(<PlansHomePage />);
    fireEvent.click(screen.getByRole('button', { name: /new plan/i }));
    const name = screen.getByPlaceholderText('Flight plan name');
    fireEvent.change(name, { target: { value: 'Ingress Alpha' } });
    expect(screen.getByText('Name must be unique.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled();
    expect(sel.newDraft).not.toHaveBeenCalled();
  });

  it('blocks a rename that collides with another plan (A1)', () => {
    render(<PlansHomePage />);
    fireEvent.click(screen.getByRole('button', { name: 'Rename Strike Batumi' }));
    const input = screen.getByDisplayValue('Strike Batumi');
    fireEvent.change(input, { target: { value: 'Ingress Alpha' } });
    expect(screen.getByText('Name must be unique.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(sel.renamePlan).not.toHaveBeenCalled();
  });

  it('applies a valid rename', () => {
    render(<PlansHomePage />);
    fireEvent.click(screen.getByRole('button', { name: 'Rename Strike Batumi' }));
    const input = screen.getByDisplayValue('Strike Batumi');
    fireEvent.change(input, { target: { value: 'Strike Poti' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(sel.renamePlan).toHaveBeenCalledWith('p2', 'Strike Poti');
  });
});
